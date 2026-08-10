/**
 * inpi.cjs - accès au Registre national des entreprises.
 *
 * Repris de routes/company.js sans réécriture : extraction du capital, des
 * représentants, validation d'adresse par la Base Adresse Nationale, secours par
 * lecture assistée. Ce sont des heuristiques accumulées sur des documents réels,
 * illisibles hors contexte et coûteuses à retrouver.
 *
 * Seule la fin change : le module exposait un routeur HTTP, il expose désormais
 * ses fonctions. L'ancien routes/company.js les réutilise.
 *
 * Identifiants : INPI_USERNAME et INPI_PASSWORD, par l'environnement.
 */

const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const INPI_HOST = "registre-national-entreprises.inpi.fr";
let _token = null;
let _tokenAt = 0;

function httpsJson(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { method, hostname: INPI_HOST, path, headers: Object.assign({ Accept: "application/json" }, headers || {}) };
    if (data) {
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(data);
    }
    const req = https.request(opts, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(buf); } catch (e) { /* non-JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function httpsBuffer(path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ method: "GET", hostname: INPI_HOST, path, headers: headers || {} }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, contentType: res.headers["content-type"] || "", buffer: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function getToken(force) {
  if (!force && _token && Date.now() - _tokenAt < 50 * 60 * 1000) return _token;
  const username = process.env.INPI_USERNAME;
  const password = process.env.INPI_PASSWORD;
  if (!username || !password) throw new Error("INPI_CREDENTIALS_MISSING");
  const r = await httpsJson("POST", "/api/sso/login", null, { username, password });
  if (r.status !== 200 || !r.json || !r.json.token) throw new Error("INPI_LOGIN_FAILED");
  _token = r.json.token;
  _tokenAt = Date.now();
  return _token;
}

function findCapital(obj, depth) {
  if (!obj || typeof obj !== "object" || depth > 12) return null;
  if (obj.montantCapital != null && obj.montantCapital !== "") return obj.montantCapital;
  for (const k in obj) {
    const v = findCapital(obj[k], (depth || 0) + 1);
    if (v != null) return v;
  }
  return null;
}

// Extrait la liste des représentants (personnes physiques) du JSON RNE INPI.
// L'INPI ne diffuse souvent que code postal + commune du domicile (RGPD) ;
// on renvoie la voie/numéro quand ils sont présents.
function extractRepresentants(root) {
  const out = [];
  const seen = new Set();
  (function walk(o, depth) {
    if (!o || typeof o !== "object" || depth > 14) return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
    if (o.individu && o.individu.descriptionPersonne) {
      const dp = o.individu.descriptionPersonne || {};
      const ad = o.individu.adresseDomicile || {};
      const prenoms = Array.isArray(dp.prenoms) ? dp.prenoms.join(" ") : (dp.prenoms || "");
      const nom = dp.nomUsage || dp.nom || "";
      const key = (nom + "|" + prenoms + "|" + (o.roleEntreprise || "")).toLowerCase();
      if (nom && !seen.has(key)) {
        seen.add(key);
        const rue = [ad.numVoie, ad.typeVoie, ad.voie].filter(Boolean).join(" ").trim();
        const cpVille = [ad.codePostal, ad.commune].filter(Boolean).join(" ").trim();
        out.push({
          nom: nom,
          prenoms: prenoms,
          genre: dp.genre || "",        // 1 = homme, 2 = femme (souvent absent)
          role: o.roleEntreprise || "", // code INPI
          codePostal: ad.codePostal || "",
          commune: ad.commune || "",
          adresse: [rue, cpVille].filter(Boolean).join(", "),
        });
      }
    }
    for (const k in o) walk(o[k], depth + 1);
  })(root, 0);
  return out;
}

// Récupère un JSON authentifié auprès de l'INPI (renouvelle le token sur 401).
async function inpiJson(path) {
  let token = await getToken(false);
  let r = await httpsJson("GET", path, { Authorization: "Bearer " + token });
  if (r.status === 401) {
    token = await getToken(true);
    r = await httpsJson("GET", path, { Authorization: "Bearer " + token });
  }
  return r;
}

function cleanLabel(d) {
  return (d.libelle || d.nomDocument || d.typeDocument || "Document").toString().trim();
}

// --- Validation/normalisation d'une adresse via la Base Adresse Nationale ---
// api-adresse.data.gouv.fr : gratuite, sans clé, dédiée aux adresses FR (même
// API que l'autocomplétion du formulaire). Corrige les coquilles d'OCR.
function validateAddressBAN(address) {
  return new Promise((resolve) => {
    if (!address) return resolve(null);
    const path = "/search/?limit=1&q=" + encodeURIComponent(address);
    const opts = { method: "GET", hostname: "api-adresse.data.gouv.fr", path, headers: { Accept: "application/json" } };
    const req = https.request(opts, (r) => {
      let buf = "";
      r.on("data", (c) => (buf += c));
      r.on("end", () => {
        let j = null;
        try { j = JSON.parse(buf); } catch (e) { return resolve(null); }
        const f = j && j.features && j.features[0];
        if (!f || !f.properties) return resolve(null);
        const p = f.properties;
        // type "housenumber" = adresse précise au numéro ; score 0..1
        const confiance = p.type === "housenumber" && p.score >= 0.6 ? "haute"
          : p.score >= 0.5 ? "moyenne" : "faible";
        resolve({ formatted: p.label || address, score: p.score || 0, type: p.type || "", confiance });
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// Construit un extrait ciblé du texte (lignes portant des marqueurs d'identité
// + contexte) pour limiter les tokens envoyés à l'IA.
function buildIdentityExcerpt(text) {
  const lines = (text || "").split(/\r?\n/);
  const marker = /demeurant|domicili|n[ée]e?\s+le|g[ée]rant|pr[ée]sident|nationalit[ée]|n[ée]e?\s+à/i;
  const keep = new Set();
  lines.forEach((l, i) => { if (marker.test(l)) { for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < lines.length) keep.add(k); } });
  let ex = Array.from(keep).sort((a, b) => a - b).map((i) => lines[i]).join("\n");
  if (ex.length > 9000) ex = ex.slice(0, 9000);
  if (ex.replace(/\s/g, "").length < 50) ex = (text || "").slice(0, 6000);
  return ex;
}

// Appelle Gemini et renvoie le texte de la réponse (ou null).
function geminiJson(prompt) {
  return new Promise((resolve) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return resolve(null);
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    });
    const req = https.request({
      hostname: "generativelanguage.googleapis.com",
      path: "/v1beta/models/gemini-2.5-flash:generateContent",
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key, "Content-Length": Buffer.byteLength(payload) },
    }, (r) => {
      let b = "";
      r.on("data", (c) => (b += c));
      r.on("end", () => {
        try {
          const j = JSON.parse(b);
          const t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
          resolve(t || null);
        } catch (e) { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

// Extraction d'identités via IA (robuste aux formats variés de statuts).
async function extractIdentitiesAI(text) {
  const excerpt = buildIdentityExcerpt(text);
  if (!excerpt) return null;
  const prompt = "Voici un extrait d'un acte de société français (statuts ou procès-verbal). "
    + "Extrais l'identité civile de CHAQUE personne physique dont l'état civil est détaillé (gérant, président, directeur général, représentant légal, ou associé fondateur). "
    + "Réponds UNIQUEMENT par un tableau JSON, au format exact :\n"
    + '[{"civilite":"Monsieur|Madame|","prenom":"","nom":"","adresse":"","dateNaissance":"","lieuNaissanceVille":"","cpNaissance":"","nationalite":"","situationMatrimoniale":"","pere":"","mere":"","regimeMatrimonial":""}]\n'
    + "Règles STRICTES :\n"
    + "- N'invente jamais. Si une information est absente, mets une chaîne vide.\n"
    + "- dateNaissance au format JJ/MM/AAAA (convertis les dates en lettres, ex \"18 juillet 1980\" -> \"18/07/1980\").\n"
    + "- adresse = adresse personnelle du domicile (après \"demeurant\"), réordonnée en \"numéro voie, code postal ville\".\n"
    + "- cpNaissance = code postal du lieu de naissance s'il est indiqué (ex \"(92)\" -> \"92\").\n"
    + "- pere/mere = nom et prénom des parents UNIQUEMENT s'ils sont explicitement mentionnés (\"fils de X et de Y\"), sinon vides.\n"
    + "- regimeMatrimonial = le régime si mentionné (\"séparation de biens\", \"communauté universelle\", \"participation aux acquêts\", \"communauté légale\"), sinon vide.\n"
    + "- N'inclus QUE les personnes physiques dirigeantes/représentantes, pas les associés non dirigeants ni la société.\n"
    + "Texte :\n\"\"\"\n" + excerpt + "\n\"\"\"";
  const out = await geminiJson(prompt);
  if (!out) return null;
  let arr = null;
  try { arr = JSON.parse(out); } catch (e) {
    const m = out.match(/\[[\s\S]*\]/);
    if (m) { try { arr = JSON.parse(m[0]); } catch (e2) {} }
  }
  if (!Array.isArray(arr)) return null;
  return arr.filter((p) => p && (p.nom || p.prenom)).map((p) => ({
    civilite: p.civilite || "",
    rawName: ((p.prenom || "") + " " + (p.nom || "")).trim(),
    nom: p.nom || "",
    prenoms: p.prenom || "",
    adresse: p.adresse || "",
    dateNaissance: p.dateNaissance || "",
    lieuNaissanceVille: p.lieuNaissanceVille || "",
    cpNaissance: p.cpNaissance || "",
    nationalite: p.nationalite || "",
    situationMatrimoniale: p.situationMatrimoniale || "",
    pere: p.pere || "",
    mere: p.mere || "",
    regimeMatrimonial: p.regimeMatrimonial || "",
  }));
}

// Vrai si le nom de famille ciblé apparaît à proximité (~280 car.) d'un marqueur
// d'état civil (né/demeurant). Évite d'appeler l'IA sur les actes où le nom n'est
// cité que dans du texte générique, et limite donc le coût/quota.
function nameNearMarker(text, nom, mk) {
  mk = mk || /demeurant|domicili|nee? le|nee? a/;
  const den = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const t = den(text);
  if (!nom) return mk.test(t);
  const tok = nom.split(/[\s-]+/).map(den).filter((x) => x.length >= 4).sort((a, b) => b.length - a.length)[0] || den(nom);
  let i = t.indexOf(tok);
  while (i !== -1) { if (mk.test(t.slice(Math.max(0, i - 280), i + 280))) return true; i = t.indexOf(tok, i + 1); }
  return false;
}
// Marqueur de naissance uniquement (pour cibler l'acte fondateur en phase OCR).
const BIRTH_MARKER = /nee? le|nee? a/;

// Cache mémoire des identités déjà extraites (clé siren|nom|prenom), TTL 1h -
// évite de re-télécharger/ré-OCR/ré-appeler l'IA si on resélectionne la société.
const _repCache = new Map();
function repCacheGet(key) {
  const e = _repCache.get(key);
  if (e && Date.now() - e.at < 3600 * 1000) return e.val;
  if (e) _repCache.delete(key);
  return null;
}
function repCacheSet(key, val) {
  _repCache.set(key, { at: Date.now(), val });
  if (_repCache.size > 500) _repCache.delete(_repCache.keys().next().value);
}

// Couche texte seule (pdftotext, rapide, sans OCR) - pour le pré-scan des actes.
function pdfTextLayer(buffer) {
  const tmp = path.join(os.tmpdir(), "formalist_scan_" + process.pid + "_" + Date.now() + "_" + Math.floor(Math.random() * 1e6));
  const pdf = tmp + ".pdf";
  try {
    fs.writeFileSync(pdf, buffer);
    try { return execFileSync("pdftotext", ["-layout", pdf, "-"], { maxBuffer: 64 * 1024 * 1024 }).toString(); }
    catch (e) { return ""; }
  } finally { try { fs.unlinkSync(pdf); } catch (e) {} }
}

// --- Extraction du texte d'un PDF : couche texte (pdftotext) puis OCR (tesseract) en secours ---
function pdfText(buffer) {
  const tmp = path.join(os.tmpdir(), "formalist_acte_" + process.pid + "_" + Date.now());
  const pdf = tmp + ".pdf";
  try {
    fs.writeFileSync(pdf, buffer);
    // 1) Couche texte (rapide, exact pour les PDF "born-digital")
    let text = "";
    try { text = execFileSync("pdftotext", ["-layout", pdf, "-"], { maxBuffer: 64 * 1024 * 1024 }).toString(); }
    catch (e) { text = ""; }
    if (text.replace(/\s/g, "").length >= 200) return text;
    // 2) OCR (PDF scanné) : rasterisation puis tesseract FR sur les 1res pages
    try {
      execFileSync("pdftoppm", ["-png", "-r", "200", "-f", "1", "-l", "6", pdf, tmp], { maxBuffer: 256 * 1024 * 1024 });
      let ocr = "";
      for (let i = 1; i <= 6; i++) {
        const png = tmp + "-" + i + ".png";
        const png2 = tmp + "-0" + i + ".png"; // pdftoppm pad parfois sur 2 chiffres
        const file = fs.existsSync(png) ? png : (fs.existsSync(png2) ? png2 : null);
        if (!file) break;
        try { ocr += execFileSync("tesseract", [file, "stdout", "-l", "fra"], { maxBuffer: 64 * 1024 * 1024 }).toString() + "\n"; }
        catch (e) { /* page illisible */ }
        try { fs.unlinkSync(file); } catch (e) {}
      }
      if (ocr.replace(/\s/g, "").length > text.replace(/\s/g, "").length) return ocr;
    } catch (e) { /* OCR indisponible */ }
    return text;
  } finally {
    try { fs.unlinkSync(pdf); } catch (e) {}
  }
}

// Parse les identités civiles d'un texte de statuts/PV ("Monsieur X né le … demeurant ….")
function parseIdentities(rawText) {
  const t = (rawText || "").replace(/\s+/g, " ");
  const re = /(Monsieur|Madame|M\.|Mme)\s+([A-Za-zÀ-ÿ'’.\- ]{3,60}?)\s+n[ée]+e?\s+le\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:à|a)\s+([A-Za-zÀ-ÿ'’\- ]+?)\s*\((\d{5})\)[^.]*?demeurant\s+([^.]+?)\./gi;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(t))) {
    const seg = m[0];
    const nat = /nationalit[ée]\s+([A-Za-zÀ-ÿ]+)/i.exec(seg);
    const sit = /(c[ée]libataire|mari[ée]e?|divorc[ée]e?|veuf|veuve|pacs[ée]e?)/i.exec(seg);
    const rawName = m[2].trim().replace(/\s+/g, " ");
    const key = rawName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      civilite: /Madame|Mme/i.test(m[1]) ? "Madame" : "Monsieur",
      rawName: rawName,
      adresse: m[6].replace(/\s+/g, " ").trim(),
      dateNaissance: m[3],
      lieuNaissanceVille: m[4].trim(),
      cpNaissance: m[5],
      nationalite: nat ? nat[1] : "",
      situationMatrimoniale: sit ? sit[1] : "",
    });
  }
  return out;
}

const _MOIS = { janvier: "01", fevrier: "02", mars: "03", avril: "04", mai: "05", juin: "06", juillet: "07", aout: "08", septembre: "09", octobre: "10", novembre: "11", decembre: "12" };
// Normalise une date FR ("16 novembre 1971" ou "16/11/1971") -> "16/11/1971".
function _dateFr(s) {
  let m = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(s);
  if (m) { let y = m[3].length === 2 ? (parseInt(m[3], 10) > 30 ? "19" : "20") + m[3] : m[3]; return ("0" + m[1]).slice(-2) + "/" + ("0" + m[2]).slice(-2) + "/" + y; }
  m = /\b(\d{1,2})(?:er|ème|eme)?\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})\b/.exec(s);
  if (m) { const k = m[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); if (_MOIS[k]) return ("0" + m[1]).slice(-2) + "/" + _MOIS[k] + "/" + m[3]; }
  return "";
}

// Extraction CIBLÉE par regex (OCR), ancrée sur le nom du représentant.
// Robuste aux formats : dates en lettres, "demeurant à VILLE (CP), N rue" inversé, etc.
// L'adresse brute est laissée à la BAN pour normalisation. Renvoie null si rien trouvé.
function parseTargetIdentity(text, nom, prenom) {
  if (!nom || !text) return null;
  const t = text.replace(/\s+/g, " ");
  const tok = nom.split(/[\s-]+/).filter((x) => x.length >= 4).sort((a, b) => b.length - a.length)[0] || nom;
  // Ancrage : une occurrence du nom IMMÉDIATEMENT suivie (<=100 car.) d'un marqueur
  // d'état civil -> c'est bien l'état civil de CETTE personne (évite d'attribuer par
  // erreur l'identité d'un tiers cité juste à côté).
  const re = new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const markerRe = /n[ée]e?\s+le|demeurant|domicili/i;
  let mm, i = -1;
  while ((mm = re.exec(t))) {
    const after = t.slice(mm.index + mm[0].length, mm.index + mm[0].length + 100);
    if (markerRe.test(after)) { i = mm.index; break; }
  }
  if (i === -1) return null;
  const win = t.slice(i, i + 450);        // fenêtre APRÈS le nom (état civil de cette personne)
  const pre = t.slice(Math.max(0, i - 30), i);

  const bd = /n[ée]e?\s+le\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}(?:er|ème|eme)?\s+[A-Za-zÀ-ÿ]+\s+\d{4})/i.exec(win);
  const dateNaissance = bd ? _dateFr(bd[1]) : "";
  const bp = /n[ée]e?\s+(?:le\s+[^à]*?)?à\s+([A-Za-zÀ-ÿ'’\-\. ]+?)\s*(?:\((\d{2,5})\)|,|\bde nationalit)/i.exec(win);
  const lieu = bp ? bp[1].trim() : "";
  const cpN = bp && bp[2] ? bp[2] : "";
  const ad = /demeurant\s+(?:[àa]\s+)?([^.]+?)(?:\s*,?\s*(?:n[ée]e?\s+le|de nationalit|propri[ée]taire|associ|g[ée]rant|pr[ée]sident)|\.|$)/i.exec(win);
  const adresse = ad ? ad[1].replace(/\s+/g, " ").trim().replace(/[,;]+$/, "") : "";
  const nat = /de nationalit[ée]\s+([A-Za-zÀ-ÿ]+)/i.exec(win);
  const sit = /(c[ée]libataire|mari[ée]e?|divorc[ée]e?|veuf|veuve|pacs[ée]e?)/i.exec(win);
  // Filiation (rare dans les actes publics) : "fils/fille de <père> et de <mère>"
  const fil = /(?:fils|fille)\s+de\s+([A-Za-zÀ-ÿ'’\- ]{3,50}?)\s+et\s+(?:de\s+)?([A-Za-zÀ-ÿ'’\- ]{3,50}?)(?:\s*[,;.]|\s+n[ée]|\s+demeurant|\s+de nationalit)/i.exec(win);
  // Régime matrimonial : "marié(e) sous le régime de la séparation de biens / communauté universelle / participation aux acquêts"
  const reg = /sous le r[ée]gime (?:de la?\s+|matrimonial\s+(?:de la?\s+)?)?(s[ée]paration de biens|communaut[ée] universelle|communaut[ée] (?:l[ée]gale|r[ée]duite aux acqu[êe]ts)|participation (?:r[ée]duite )?aux acqu[êe]ts)/i.exec(win);
  if (!dateNaissance && !adresse) return null;

  let civilite = "";
  if (/Madame|Mme/i.test(pre)) civilite = "Madame";
  else if (/Monsieur|M\./i.test(pre)) civilite = "Monsieur";
  else if (/\b(née|mariée|divorcée|veuve|pacsée)\b/i.test(win)) civilite = "Madame";
  else if (/\b(né|marié|divorcé|veuf|pacsé)\b/i.test(win)) civilite = "Monsieur";

  return {
    civilite,
    rawName: ((prenom || "") + " " + nom).trim(),
    nom, prenoms: prenom || "",
    adresse, dateNaissance, lieuNaissanceVille: lieu, cpNaissance: cpN,
    nationalite: nat ? nat[1] : "",
    situationMatrimoniale: sit ? sit[1] : "",
    pere: fil ? fil[1].trim() : "",
    mere: fil ? fil[2].trim() : "",
    regimeMatrimonial: reg ? reg[1].trim() : "",
  };
}

// Détecte la forme juridique depuis le texte d'un acte (source fiable quand le code
// INSEE est générique/non mappé, ex. 6599). Ordre important (SASU avant SAS, etc.).
function detectForme(text) {
  const t = (text || "").replace(/\s+/g, " ");
  // Normalise les abréviations pointées/espacées pour une détection fiable :
  // "S.A.S." -> "SAS", "S. A. R. L." -> "SARL".
  const t2 = t
    .replace(/([A-Za-z])\.(?=\s*[A-Za-z])/g, "$1")
    .replace(/\b([A-Za-z](?:\s[A-Za-z]\b){1,5})/g, (s) => s.replace(/\s/g, ""));
  const ABBR = "(SASU|SAS|SARL|EURL|SCIC|SCI|SELAS|SELARL|SELAFA|SELCA|SNC|SCA|SCS|SCP|SCM|SC|SA)";
  // Le plus fiable : l'abréviation de forme juste avant "au capital" OU juste après "STATUTS"
  let m = new RegExp("\\b" + ABBR + "\\b\\s+(?:unipersonnelle\\s+)?au capital", "i").exec(t2);
  if (m) return m[1].toUpperCase();
  m = new RegExp("statuts\\s+(?:de la soci[ée]t[ée]\\s+)?[A-Z0-9'’&\\-\\. ]{2,60}?\\s+" + ABBR + "\\b", "i").exec(t2);
  if (m) return m[1].toUpperCase();
  if (/soci[ée]t[ée] par actions simplifi[ée]e?\s+(?:unipersonnelle|[àa] associ[ée] unique)/i.test(t) || /\bSASU\b/.test(t2)) return "SASU";
  if (/soci[ée]t[ée] par actions simplifi[ée]e?/i.test(t) || /\bSAS\b/.test(t)) return "SAS";
  if (/entreprise unipersonnelle [àa] responsabilit[ée] limit[ée]e?/i.test(t) || /\bEURL\b/.test(t)) return "EURL";
  if (/soci[ée]t[ée] [àa] responsabilit[ée] limit[ée]e?/i.test(t) || /\bSARL\b/.test(t)) return "SARL";
  if (/soci[ée]t[ée] civile immobili[èe]re/i.test(t) || /\bSCI\b/.test(t)) return "SCI";
  if (/soci[ée]t[ée] d.exercice lib[ée]ral par actions simplifi[ée]e?/i.test(t) || /\bSELAS\b/.test(t)) return "SELAS";
  if (/soci[ée]t[ée] d.exercice lib[ée]ral [àa] responsabilit[ée] limit[ée]e?/i.test(t) || /\bSELARL\b/.test(t)) return "SELARL";
  if (/soci[ée]t[ée] en nom collectif/i.test(t) || /\bSNC\b/.test(t)) return "SNC";
  if (/soci[ée]t[ée] anonyme/i.test(t) || /\bS\.?A\.?\b/.test(t)) return "SA";
  if (/soci[ée]t[ée] civile/i.test(t)) return "SC";
  return "";
}

module.exports = {
  inpiJson,
  httpsBuffer,
  getToken,
  findCapital,
  extractRepresentants,
  validateAddressBAN,
  extractIdentitiesAI,
  // Employées par l'ancien routeur : exposées pour qu'il n'en garde pas de copie.
  cleanLabel,
  nameNearMarker,
  repCacheGet,
  repCacheSet,
};
