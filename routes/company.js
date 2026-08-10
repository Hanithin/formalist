/**
 * routes/company.js - proxy INPI pour le serveur d'origine.
 *
 *   GET /api/company/:siren                       -> { siren, capital }   (auth)
 *   GET /api/company/:siren/documents             -> { actes, bilans }    (avocat/admin)
 *   GET /api/company/:siren/document?kind&id&name -> flux PDF             (avocat/admin)
 *
 * Les fonctions d'accès et d'extraction ont été déplacées dans
 * web/src/infrastructure/inpi/inpi.cjs : Next ne sait pas charger un fichier hors
 * de son projet. On les réimporte ici plutôt que d'en garder deux versions.
 *
 * Ce fichier disparaît avec le serveur d'origine.
 */

const { authGuard } = require("../middleware/auth-guard");
const { jsonResponse, errorResponse } = require("../lib/router");
const {
  inpiJson,
  httpsBuffer,
  getToken,
  findCapital,
  extractRepresentants,
  validateAddressBAN,
  extractIdentitiesAI,
  cleanLabel,
  nameNearMarker,
  repCacheGet,
  repCacheSet,
} = require("../web/src/infrastructure/inpi/inpi.cjs");

module.exports = async function companyRoutes(pathname, req, res, url) {
  const mBase = pathname.match(/^\/api\/company\/(\d{9})$/);
  const mDocs = pathname.match(/^\/api\/company\/(\d{9})\/documents$/);
  const mDoc = pathname.match(/^\/api\/company\/(\d{9})\/document$/);
  const mRep = pathname.match(/^\/api\/company\/(\d{9})\/representants-details$/);

  // --- Capital (autofill création) : tout utilisateur connecté ---
  if (mBase && req.method === "GET") {
    const user = authGuard(req, res);
    if (!user) return true;
    try {
      const r = await inpiJson("/api/companies/" + mBase[1]);
      if (r.status !== 200 || !r.json) return jsonResponse(res, 200, { siren: mBase[1], capital: null, representants: [] });
      return jsonResponse(res, 200, {
        siren: mBase[1],
        capital: findCapital(r.json, 0),
        representants: extractRepresentants(r.json),
      });
    } catch (e) {
      return jsonResponse(res, 200, { capital: null, representants: [], reason: e.message });
    }
  }

  // --- Liste des actes + bilans : avocat/admin ---
  if (mDocs && req.method === "GET") {
    const user = authGuard(req, res, "avocat", "admin");
    if (!user) return true;
    try {
      const r = await inpiJson("/api/companies/" + mDocs[1] + "/attachments");
      if (r.status !== 200 || !r.json) return errorResponse(res, 502, "INPI indisponible");
      const a = r.json;
      const actes = (a.actes || []).filter((x) => !x.deleted).map((x) => ({
        id: x.id, kind: "acte", label: cleanLabel(x), date: x.dateDepot || "", confidentiality: x.confidentiality || "",
      }));
      const bilans = (a.bilans || []).filter((x) => !x.deleted).map((x) => ({
        id: x.id, kind: "bilan", label: "Comptes annuels", date: x.dateDepot || "", confidentiality: x.confidentiality || "",
      }));
      return jsonResponse(res, 200, { siren: mDocs[1], actes, bilans });
    } catch (e) {
      return errorResponse(res, 502, e.message === "INPI_CREDENTIALS_MISSING" ? "Identifiants INPI manquants" : "INPI indisponible");
    }
  }

  // --- Identité civile complète des représentants, extraite des statuts (texte/OCR) : avocat/admin ---
  if (mRep && req.method === "GET") {
    const user = authGuard(req, res, "avocat", "admin");
    if (!user) return true;
    const targetNom = (url.searchParams.get("nom") || "").trim();
    const targetPrenom = (url.searchParams.get("prenom") || "").trim();
    const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
    try {
      const att = await inpiJson("/api/companies/" + mRep[1] + "/attachments");
      if (att.status !== 200 || !att.json) return jsonResponse(res, 200, { siren: mRep[1], representants: [], source: null });
      const all = (att.json.actes || [])
        .filter((x) => !x.deleted && /public/i.test(x.confidentiality || ""))
        .map((x) => ({ id: x.id, label: cleanLabel(x), date: x.dateDepot || "", isStatut: /statut/i.test(cleanLabel(x)) }));

      let token = await getToken(false);
      const download = async (id) => {
        let r = await httpsBuffer("/api/actes/" + id + "/download", { Authorization: "Bearer " + token, Accept: "application/pdf" });
        if (r.status === 401) { token = await getToken(true); r = await httpsBuffer("/api/actes/" + id + "/download", { Authorization: "Bearer " + token, Accept: "application/pdf" }); }
        if (r.status !== 200 || !/pdf/i.test(r.contentType)) return null;
        return r.buffer;
      };
      const MARKER = /demeurant|domicili|n[ée]e?\s+le|n[ée]e?\s+à/i;
      const identitiesOf = async (text) => {
        if (!MARKER.test(text)) return [];
        let ids = await extractIdentitiesAI(text);
        if (!ids || !ids.length) ids = parseIdentities(text);
        return ids || [];
      };
      const tn = norm(targetNom);
      const hasName = (t) => !targetNom || norm(t).indexOf(tn) !== -1;
      // Sélectionne dans une liste d'identités celle qui correspond au représentant ciblé.
      const pickTarget = (ids) => {
        if (!ids.length) return null;
        if (!targetNom) return ids[0];
        const tp = norm(targetPrenom).split(" ")[0] || "";
        return ids.filter((p) => {
          const pn = norm(p.nom || p.rawName);
          return tn && (pn.indexOf(tn) !== -1 || tn.indexOf(pn) !== -1) && (!tp || norm(p.rawName + " " + (p.prenoms || "")).indexOf(tp) !== -1);
        })[0] || null;
      };
      const IMMUT = ["civilite", "dateNaissance", "lieuNaissanceVille", "cpNaissance", "nationalite", "situationMatrimoniale"];
      const acc = {};
      const fill = (hit, withAddress) => {
        if (!hit) return;
        acc.nom = acc.nom || hit.nom || "";
        acc.prenoms = acc.prenoms || hit.prenoms || "";
        acc.rawName = acc.rawName || hit.rawName || "";
        IMMUT.forEach((k) => { if (!acc[k] && hit[k]) acc[k] = hit[k]; });
        ["pere", "mere", "regimeMatrimonial"].forEach((k) => { if (!acc[k] && hit[k]) acc[k] = hit[k]; }); // best-effort, hors complétude
        if (withAddress && !acc.adresse && hit.adresse) acc.adresse = hit.adresse;
      };
      const immutComplete = () => IMMUT.every((k) => acc[k]);

      // OCR/regex d'abord ; l'IA (Gemini) seulement en DERNIER RECOURS et plafonnée
      // (quota limité). parseTargetIdentity gère déjà la plupart des formats.
      const AI_CAP = 3; let aiCalls = 0;
      const getTarget = async (text) => {
        const r = parseTargetIdentity(text, targetNom, targetPrenom);
        if (r) return r;
        if (aiCalls < AI_CAP) {
          aiCalls++;
          let ids = await extractIdentitiesAI(text);
          if (!ids || !ids.length) ids = parseIdentities(text);
          return pickTarget(ids || []);
        }
        return null;
      };

      let source = null;
      if (targetNom) {
        const cacheKey = mRep[1] + "|" + norm(targetNom) + "|" + norm(targetPrenom);
        const cached = repCacheGet(cacheKey);
        if (cached) return jsonResponse(res, 200, cached);

        // Pré-scan : télécharge tous les actes + couche texte (rapide, sans OCR)
        const docs = [];
        for (const a of all.slice(0, 25)) {
          const buf = await download(a.id);
          if (!buf) continue;
          const text = pdfTextLayer(buf);
          docs.push({ id: a.id, label: a.label, date: a.date, isStatut: a.isStatut, buf, text, scanned: text.replace(/\s/g, "").length < 200 });
        }
        // Phase 1 : actes texte-natif où le nom est PROCHE d'un marqueur, récents d'abord -> tout (adresse incluse)
        const p1 = docs.filter((d) => !d.scanned && nameNearMarker(d.text, targetNom))
          .sort((a, b) => (b.isStatut - a.isStatut) || String(b.date).localeCompare(String(a.date)));
        for (const d of p1) {
          if (acc.adresse && immutComplete()) break;
          const hit = await getTarget(d.text);
          if (hit) { fill(hit, true); if (!source) source = { id: d.id, label: d.label, date: d.date }; }
        }
        // Phase 2 : si l'état civil reste incomplet -> OCR des actes scannés où le nom est
        // proche d'une NAISSANCE (cible l'acte fondateur). État civil immuable uniquement
        // (pas l'adresse, potentiellement obsolète sur un acte de création).
        if (!immutComplete()) {
          const scanned = docs.filter((d) => d.scanned).slice(0, 12);
          for (const d of scanned) {
            if (immutComplete()) break;
            const text = pdfText(d.buf); // pdftotext + OCR
            if (!nameNearMarker(text, targetNom, BIRTH_MARKER)) continue;
            const hit = await getTarget(text);
            if (hit) { fill(hit, true); if (!source) source = { id: d.id, label: d.label, date: d.date }; }
          }
        }
        // Cohérence de l'adresse des statuts avec le domicile COURANT de l'INPI : si la
        // commune/CP diffèrent, l'adresse des statuts est probablement obsolète (cas d'un
        // acte fondateur ancien) -> on l'efface pour garder l'adresse INPI à jour côté front.
        if (acc.adresse) {
          try {
            const comp = await inpiJson("/api/companies/" + mRep[1]);
            const inpiReps = comp.status === 200 && comp.json ? extractRepresentants(comp.json) : [];
            const ir = inpiReps.filter((p) => { const pn = norm(p.nom); return tn && (pn.indexOf(tn) !== -1 || tn.indexOf(pn) !== -1); })[0];
            if (ir && (ir.codePostal || ir.commune)) {
              const a = norm(acc.adresse);
              const okCp = ir.codePostal && a.indexOf(ir.codePostal.toLowerCase()) !== -1;
              const okVille = ir.commune && a.indexOf(norm(ir.commune)) !== -1;
              if (!okCp && !okVille) acc.adresse = "";
            }
          } catch (e) { /* en cas d'échec, on garde l'adresse des statuts */ }
        }
        if (acc.adresse) {
          acc.adresseStatuts = acc.adresse;
          const g = await validateAddressBAN(acc.adresse);
          if (g && g.formatted) { acc.adresse = g.formatted; acc.adresseConfiance = g.confiance; acc.adresseScore = g.score; }
          else acc.adresseConfiance = "non_verifiee";
        }
        // Forme juridique des statuts -> fiable à chaque fois.
        // 1) couche texte de tous les actes ; 2) sinon OCR d'un acte (statut en priorité)
        // pour lire l'en-tête "<FORME> au capital de …".
        let forme = "";
        for (const d of docs) { if (forme) break; forme = detectForme(d.text); }
        if (!forme) {
          const cand = docs.filter((d) => d.scanned && d.isStatut)[0] || docs.filter((d) => d.scanned)[0] || docs[0];
          if (cand) forme = detectForme(pdfText(cand.buf));
        }
        const reps = (acc.nom || acc.dateNaissance || acc.adresse) ? [acc] : [];
        const payload = { siren: mRep[1], representants: reps, source, forme };
        if (reps.length || forme) repCacheSet(cacheKey, payload);
        return jsonResponse(res, 200, payload);
      }

      // Mode simple (sans cible) : statuts d'abord puis plus récents, 1er acte avec identités
      const actes = all.sort((a, b) => (b.isStatut - a.isStatut) || String(b.date).localeCompare(String(a.date))).slice(0, 6);
      for (const a of actes) {
        const buf = await download(a.id); if (!buf) continue;
        const text = pdfText(buf); if (!text) continue;
        const ids = await identitiesOf(text);
        if (ids.length) {
          await Promise.all(ids.map(async (p) => {
            p.adresseStatuts = p.adresse;
            const g = await validateAddressBAN(p.adresse);
            if (g && g.formatted) { p.adresse = g.formatted; p.adresseConfiance = g.confiance; p.adresseScore = g.score; }
            else p.adresseConfiance = "non_verifiee";
          }));
          return jsonResponse(res, 200, { siren: mRep[1], representants: ids, source: { id: a.id, label: a.label, date: a.date } });
        }
      }
      return jsonResponse(res, 200, { siren: mRep[1], representants: [], source: null });
    } catch (e) {
      return jsonResponse(res, 200, { siren: mRep[1], representants: [], reason: e.message });
    }
  }

  // --- Téléchargement d'un document (flux PDF) : avocat/admin ---
  if (mDoc && req.method === "GET") {
    const user = authGuard(req, res, "avocat", "admin");
    if (!user) return true;
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id");
    const name = (url.searchParams.get("name") || "document").replace(/[^\w\-À-ÿ ]+/g, "_").slice(0, 80);
    const disposition = url.searchParams.get("disposition") === "inline" ? "inline" : "attachment";
    if ((kind !== "acte" && kind !== "bilan") || !/^[a-f0-9]{8,}$/i.test(id || "")) {
      return errorResponse(res, 400, "Paramètres invalides");
    }
    try {
      let token = await getToken(false);
      const path = "/api/" + (kind === "acte" ? "actes" : "bilans") + "/" + id + "/download";
      let r = await httpsBuffer(path, { Authorization: "Bearer " + token, Accept: "application/pdf" });
      if (r.status === 401) {
        token = await getToken(true);
        r = await httpsBuffer(path, { Authorization: "Bearer " + token, Accept: "application/pdf" });
      }
      if (r.status !== 200 || !/pdf/i.test(r.contentType)) {
        return errorResponse(res, 502, "Document indisponible");
      }
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition + '; filename="' + name + '.pdf"',
        "Content-Length": r.buffer.length,
        "Cache-Control": "private, max-age=600",
      });
      res.end(r.buffer);
      return true;
    } catch (e) {
      return errorResponse(res, 502, "Erreur de récupération");
    }
  }

  return false;
};
