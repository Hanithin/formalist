/**
 * docx.cjs - génération DOCX, injection de signature, cache de gabarits.
 *
 * Déplacé depuis lib/docx.js sans être réécrit : 1 199 lignes où sont enfouis des
 * cas particuliers accumulés au fil des mois. Seul le chemin des gabarits change.
 * L'ancien lib/docx.js réexporte ce fichier, pour qu'il n'existe qu'une source.
 *
 * Dépendances : pizzip, docxtemplater
 */

/**
 * Le corps d'un acte, en demi-points : vingt-quatre valent douze points.
 *
 * La valeur est reprise du modèle repassé par le cabinet. Elle vaut pour tous les
 * documents produits : ils sortent de la même chaîne, et deux corps différents d'un
 * dossier à l'autre se verraient.
 */
const CORPS = 24;

/**
 * L'interligne, en vingtièmes de ligne : 276 valent 1,15.
 *
 * Il valait 312 - un tiers de ligne en plus - et le commentaire d'origine le calibrait
 * « ≈ 1.2x with 13pt font ». Le corps est passé à douze points : le même chiffre y vaut
 * 1,3, et l'acte respirait au point de ne plus paraître tenu. Un procès-verbal se
 * compose serré ; c'est ce qui le distingue d'une note.
 */
const INTERLIGNE = 276;

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

/**
 * Emplacement des gabarits.
 *
 * On ne peut pas s'appuyer sur __dirname : Next le réécrit en /ROOT/ dans le
 * paquet produit, et le chemin ne tient plus à l'exécution. On essaie donc les
 * emplacements possibles et on garde celui qui existe - la racine du dépôt selon
 * qu'on est lancé depuis elle ou depuis web/.
 */
const TEMPLATES = (() => {
  const candidats = [
    process.env.FORMALIST_TEMPLATES,
    path.join(process.cwd(), "templates"),
    path.join(process.cwd(), "..", "templates"),
    path.join(__dirname, "..", "..", "..", "..", "templates"),
  ].filter(Boolean);

  for (const candidat of candidats) {
    if (fs.existsSync(path.join(candidat, "sasu-statuts.docx"))) return candidat;
  }
  // Aucun trouvé : on rend le premier, l'erreur d'ouverture dira lequel manque.
  return candidats[0];
})();
const templateCache = {};

function loadTemplate(name) {
  templateCache[name] = fs.readFileSync(path.join(TEMPLATES, name));
  return templateCache[name];
}

function loadAllTemplates() {
  const templates = fs.readdirSync(TEMPLATES).filter(f => f.endsWith(".docx"));
  templates.forEach(t => loadTemplate(t));
  return templates;
}

/** Une civilité renseignée, par opposition au tiret qui marque une absence. */
function civiliteRenseignee(valeur) {
  const v = String(valeur == null ? "" : valeur).trim();
  return v !== "" && v !== "-";
}

/** Homme, femme, ou ni l'un ni l'autre quand personne n'est désigné. */
function genreDe(civilite) {
  const v = String(civilite == null ? "" : civilite).toLowerCase();
  return {
    homme: /monsieur|\bmr\b|\bm\./.test(v),
    femme: /madame|mademoiselle|\bmme\b|\bmlle\b/.test(v),
  };
}

/**
 * Complète les données pour le rendu.
 *
 * Cette fonction servait au serveur d'origine, dont les données ne portaient pas ces
 * indicateurs. Le domaine les calcule désormais : elle ne les recouvre donc plus
 * quand ils sont déjà là, sous peine de défaire un calcul juste.
 *
 * Deux règles y étaient fausses. « EST_FEMME = !EST_HOMME » rendait femme toute
 * absence de personne, si bien qu'un dirigeant inexistant était déclaré au féminin ;
 * les deux se lisent maintenant séparément sur la civilité. Et « HAS_DG_n » se
 * déduisait de la présence d'une civilité, or le domaine y écrit un tiret pour les
 * rangs vides : chaque société à gérant unique produisait une seconde déclaration de
 * non-condamnation, vide, à destination du greffe.
 */
function enrichData(data) {
  const civPres = data.CIVILITE || data.CIVILITE_NOM_PRENOM || "";
  const genrePres = genreDe(civPres);
  if (typeof data.EST_HOMME !== "boolean") data.EST_HOMME = genrePres.homme;
  if (typeof data.EST_FEMME !== "boolean") data.EST_FEMME = genrePres.femme;

  for (let n = 1; n <= 3; n++) {
    const prefix = "DG_" + n + "_";
    if (
      typeof data["HAS_DG_" + n] !== "boolean" &&
      civiliteRenseignee(data[prefix + "CIVILITE"])
    ) {
      data["HAS_DG_" + n] = true;
    }
    if (data[prefix + "CIVILITE"] && !data[prefix + "CIVILITE_NOM_PRENOM"]) {
      data[prefix + "CIVILITE_NOM_PRENOM"] = ((data[prefix + "CIVILITE"] || "") + " " + (data[prefix + "NOM"] || "") + " " + (data[prefix + "PRENOM"] || "")).trim();
    }
    const genreDg = genreDe(data[prefix + "CIVILITE"]);
    if (typeof data[prefix + "EST_HOMME"] !== "boolean") data[prefix + "EST_HOMME"] = genreDg.homme;
    if (typeof data[prefix + "EST_FEMME"] !== "boolean") data[prefix + "EST_FEMME"] = genreDg.femme;
    if (!data[prefix + "NOM_PERE"]) data[prefix + "NOM_PERE"] = "-";
    if (!data[prefix + "NOM_MERE"]) data[prefix + "NOM_MERE"] = "-";
    if (!data[prefix + "NOM_JEUNE_FILLE"]) data[prefix + "NOM_JEUNE_FILLE"] = "-";
  }
  return data;
}

/** Improve page layout: collapse empty paragraphs, prevent orphans/widows */
function improveLayout(docXml) {
  // Split body into paragraphs while keeping structure
  const bodyMatch = docXml.match(/^([\s\S]*?<w:body>)([\s\S]*?)(<\/w:body>[\s\S]*)$/);
  /* Le premier intitulé de l'acte porte un blanc plus large que les suivants. */
  let titreVu = false;
  if (!bodyMatch) return docXml;
  const [, prefix, body, suffix] = bodyMatch;

  // Tokenize body into top-level elements (paragraphs, tables, sectPr, etc.)
  const tokens = [];
  const re = /<w:(p|tbl|sectPr|sdt)\b[^>]*\/?>[\s\S]*?<\/w:\1>|<w:(p|tbl|sectPr|sdt)\b[^>]*\/>/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIndex) tokens.push({ type: 'raw', xml: body.slice(lastIndex, m.index) });
    tokens.push({ type: m[1] || m[2], xml: m[0] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < body.length) tokens.push({ type: 'raw', xml: body.slice(lastIndex) });

  function getText(p) {
    let t = '';
    p.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(_, x) { t += x; });
    return t.trim();
  }

  function isEmpty(p) { return getText(p).length === 0; }

  function isTitle(p) {
    const t = getText(p);
    if (!t) return false;
    if (/^(ARTICLE|TITRE|ANNEXE|STATUTS|CHAPITRE)\b/i.test(t)) return true;
    // EXCLUSION: closing markers like "CETTE RÉSOLUTION EST ADOPTÉE…" or
    // "CETTE DÉCISION EST ADOPTÉE…" are bold ALL-CAPS but are closing lines,
    // not section headings - they shouldn't get keepNext (which forces them
    // to glue to the next paragraph, often pushing them to the next page).
    if (/^CETTE\s+(R[ÉE]SOLUTION|D[ÉE]CISION)\b/i.test(t)) return false;
    // Short paragraph whose RUNS (not pPr/rPr) have bold or underline → section header.
    // Strip out the pPr block before checking, so the paragraph-mark style doesn't fool us.
    if (t.length < 120) {
      const runs = p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/g, '');
      const hasBold = /<w:b\s*\/>|<w:b\s+w:val="(1|true|on)"/i.test(runs);
      const hasUnderline = /<w:u\s+w:val="(?!none)[^"]*"/i.test(runs);
      // Also detect bold via paragraph style (Title, Heading1-9 etc.)
      const hasHeadingStyle = /<w:pStyle\s+w:val="(Title|Heading\d|Subtitle)"/i.test(p);
      if (hasBold || hasUnderline || hasHeadingStyle) return true;
    }
    return false;
  }

  function ensurePPr(p) {
    if (/<w:pPr>/.test(p)) return p;
    // Insert empty pPr right after opening <w:p ...>
    return p.replace(/^(<w:p\b[^>]*>)/, '$1<w:pPr></w:pPr>');
  }

  function addPara(p, prop) {
    p = ensurePPr(p);
    if (new RegExp('<w:' + prop + '\\s*/?>').test(p)) return p;
    // Insert prop at the start of <w:pPr>
    return p.replace(/<w:pPr>/, '<w:pPr><w:' + prop + '/>');
  }

  // 1) Add keepLines on every paragraph; keepNext on titles
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (tk.type !== 'p') continue;
    let p = tk.xml;
    p = addPara(p, 'keepLines');
    /*
     * Une phrase qui annonce ne se sépare pas de ce qu'elle annonce.
     *
     * « La Société a pour objet en France et dans tous autres pays : » restait au bas
     * d'une page, et la liste des activités commençait sur la suivante. Le titre de
     * l'article était déjà lié à cette phrase : c'est donc l'article entier qui aurait
     * dû changer de page, et il se coupait en deux.
     *
     * Le critère est celui qui sert déjà à l'alignement - une ligne courte qui finit par
     * deux-points - et le lien ne porte que sur le paragraphe suivant, pas au-delà.
     */
    if (!isTitle(p)) {
      const t = getText(p);
      if (t.length < 140 && t.endsWith(':')) p = addPara(p, 'keepNext');
    }

    if (isTitle(p)) {
      // Title gets keepNext so it stays bound to its body paragraph.
      // Do NOT add keepNext to the body itself - that would create overly-long chains
      // (title → body → next title → next body...) that LibreOffice can't fit, leaving
      // big empty spaces before page breaks.
      p = addPara(p, 'keepNext');
      // Ensure breathing room above every title (w:before >= 360 = 18pt)
      // unless the title is explicitly suppressed (page-break-before titles).
      const t = getText(p);
      const isMainTitle = /^(ARTICLE|TITRE|ANNEXE|STATUTS|CHAPITRE)\b/i.test(t);
      if (!isMainTitle) {
        // ALL CAPS bold = section header (e.g. "LISTE DES SOUSCRIPTEURS") → bigger breathing room
        // Otherwise (inline subheading like "Libération des apports") → smaller
        // Treat as "section title" (big breathing room) only if ALL CAPS AND long enough (>12 chars).
        // Short ALL CAPS like "ZS CAR" (company name on title page) keep modest spacing.
        const isAllCaps = t === t.toUpperCase() && /[A-ZÀ-Ÿ]/.test(t) && t.length < 80;
        const isSectionTitle = isAllCaps && t.length > 12;
        const isShortAllCaps = isAllCaps && !isSectionTitle;
        // Check if next paragraph is also centered (suggests title+subtitle pattern → tight gap)
        let nextIsCentered = false;
        for (let j = i + 1; j < tokens.length && j < i + 3; j++) {
          if (tokens[j].type === 'p' && !isEmpty(tokens[j].xml)) {
            nextIsCentered = /<w:jc w:val="center"/.test(tokens[j].xml);
            break;
          }
        }
        // Deux poids de titre, selon qu'il ouvre l'acte ou une de ses parties.
        //
        // Le premier titre sépare l'en-tête du corps : il prend vingt-quatre points.
        // Ceux qui suivent découpent le corps sans le rompre, et dix-huit suffisent -
        // au-delà, chaque partie flotte dans sa page. Le critère est le rang, non
        // l'alignement : « ORDRE DU JOUR » est centré lui aussi, et prenait le blanc
        // du titre principal au milieu d'une page.
        const before = isSectionTitle ? (titreVu ? 360 : 480) : 360;
        if (isSectionTitle) titreVu = true;

        // Un titre se tient plus près de son texte que de celui qu'il quitte.
        //
        // Il respirait trente points dessous et vingt-quatre dessus : l'intitulé
        // flottait entre deux blocs sans qu'on voie lequel il annonçait. Son écart
        // dessous vaut maintenant celui de deux paragraphes ; c'est l'écart d'avant
        // qui dit la coupure, et une seule valeur donne le rythme.
        const after = isSectionTitle
          ? (nextIsCentered ? 0 : 120)
          : (isShortAllCaps ? 0 : 120);
        if (/<w:spacing\b/.test(p)) {
          p = p.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
            // Always reset to our canonical values (template may have absurd defaults)
            const cleaned = attrs
              .replace(/\s*w:before="\d+"/g, '')
              .replace(/\s*w:after="\d+"/g, '');
            return '<w:spacing w:before="' + before + '" w:after="' + after + '"' + cleaned + '/>';
          });
        } else {
          p = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="' + before + '" w:after="' + after + '" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>');
        }
        /*
         * Un titre qui ne dit pas sa taille en reçoit une ; celui qui la dit la garde.
         *
         * Toute ligne en capitales de plus de douze caractères passait à 15 points : le
         * nom de la société, le titre de l'acte et chaque intertitre de résolution s'y
         * retrouvaient à la même taille, et la hiérarchie du document disparaissait. Les
         * gabarits portent désormais leur propre échelle - société 13 pt, titre 12,5 pt,
         * intertitres 11 pt - et c'est elle qui décide. Le repli ne sert plus qu'aux
         * gabarits muets.
         */
        if (isSectionTitle && !/<w:sz w:val="\d+"/.test(p)) {
          p = p.replace(/<w:rPr>/g, '<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/>');
        }
      }
    }
    tk.xml = p;
  }

  // 1.5) Remove a single empty paragraph that immediately precedes a title (any title kind).
  //      We already control the title's w:before, so an extra empty para just adds noise.
  for (let i = tokens.length - 1; i >= 1; i--) {
    const tk = tokens[i];
    const prev = tokens[i - 1];
    if (tk.type !== 'p' || prev.type !== 'p') continue;
    if (!isTitle(tk.xml)) continue;
    if (!isEmpty(prev.xml)) continue;
    // Remove previous empty paragraph
    tokens.splice(i - 1, 1);
  }

  // 2) Collapse consecutive empty paragraphs (max 1 in a row)
  const collapsed = [];
  let emptyRun = 0;
  for (const tk of tokens) {
    if (tk.type === 'p' && isEmpty(tk.xml)) {
      emptyRun++;
      if (emptyRun <= 1) collapsed.push(tk);
    } else {
      emptyRun = 0;
      collapsed.push(tk);
    }
  }

  // 3) Trim trailing empty paragraphs before sectPr
  while (collapsed.length > 1) {
    const last = collapsed[collapsed.length - 1];
    const prev = collapsed[collapsed.length - 2];
    if (last.type === 'sectPr' && prev.type === 'p' && isEmpty(prev.xml)) {
      collapsed.splice(collapsed.length - 2, 1);
    } else {
      break;
    }
  }

  const newBody = collapsed.map(t => t.xml).join('');
  return prefix + newBody + suffix;
}

/**
 * Les gabarits dont les intitulés « ARTICLE n » sont ceux de statuts.
 *
 * La normalisation qui suit - Cambria, douze points d'écart dessous, paragraphe suivant
 * collé - a été écrite pour les statuts d'une société, où les articles se suivent en
 * cascade. Une déclaration de confidentialité en a aussi, quatre, mais ce sont ceux du
 * modèle de l'annexe 1-5 : ils prenaient la police et l'espacement des statuts au milieu
 * d'un acte composé autrement, et leur premier paragraphe se collait au titre.
 */
function articlesDeStatuts(nom) {
  return !nom || /statuts/i.test(nom);
}

function generateDocxFromBuffer(buf, data, nomDuGabarit) {
  const zip = new PizZip(buf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: function() { return ""; },
  });
  data = enrichData(data);
  const cleanData = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "boolean" || Array.isArray(value)) {
      cleanData[key] = value;
    } else {
      cleanData[key] = value == null ? "" : String(value);
    }
  }
  doc.render(cleanData);

  /* Une seule forme Unicode, avant toute règle qui lit le texte. */
  doc.getZip().file(
    "word/document.xml",
    normaliserLeTexte(doc.getZip().file("word/document.xml").asText())
  );

  // Fix "né(e)" → "né" or "née" based on civility in same paragraph
  {
    let xml = doc.getZip().file("word/document.xml").asText();
    xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(para) {
      /* Le texte est normalisé en amont : une seule forme à chercher. */
      if (para.indexOf("né(e)") === -1) return para;
      var texts = [];
      para.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { texts.push(t); });
      var fullText = texts.join('');
      var hasFemme = /\b(Madame|Mme|Mademoiselle|Mlle)\b/i.test(fullText);
      var hasHomme = /\b(Monsieur|Mr\.?|M\.)\s+[A-ZÀ-Ÿ]/.test(fullText);
      var replacement = hasFemme && !hasHomme ? "née" : "né";
      return para.replace(/(<w:t[^>]*>)([^<]*né\(e\)[^<]*)(<\/w:t>)/g, function(m, open, content, close) {
        return open + content.replace(/né\(e\)/g, replacement) + close;
      });
    });
    doc.getZip().file("word/document.xml", xml);
  }

  // a) "euro(s)" → "euros" (clean up the parenthesized hedge form)
  // b) "0/1 euros" → "0/1 euro" (French: singular pour 0 et 1)
  // Substring-specific so on n'écrase pas "3 400 euros" quand "0 euros" coexiste dans le même para.
  let docXml = doc.getZip().file("word/document.xml").asText();
  docXml = docXml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, function(m, attrs, content) {
    let c = content;
    c = c.replace(/euros?\(s\)/g, 'euros');
    c = c.replace(/((?:^|[^0-9])[01])(\s+)euros(?=[^a-zA-Z]|$)/g, '$1$2euro');
    c = c.replace(/\b(un[e]?|z[ée]ro)(\s+)euros\b/gi, '$1$2euro');
    // "d'<consonne>" → "de <consonne>" - apostrophe française avant voyelles uniquement.
    // Couvre les cas du template "d'cent" / "d'mille" / "d'deux" etc.
    c = c.replace(/\bd['’]([bcçdfghjklmnpqrstvwxz])/gi, 'de $1');
    return '<w:t' + attrs + '>' + c + '</w:t>';
  });
  doc.getZip().file("word/document.xml", docXml);

  // Fix "RÉSOLUTION 1" → "RÉSOLUTION UNIQUE" when only one resolution exists
  docXml = doc.getZip().file("word/document.xml").asText();
  var resolutionParas = [];
  docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(para) {
    var texts = [];
    para.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { texts.push(t); });
    var t = texts.join('').trim();
    if (/^R[ÉE]SOLUTION\s*(N°\s*)?1\b/i.test(t)) resolutionParas.push(t);
    if (/^R[ÉE]SOLUTION\s*(N°\s*)?2\b/i.test(t)) resolutionParas.push(t);
    if (/^R[ÉE]SOLUTION\s*(N°\s*)?3\b/i.test(t)) resolutionParas.push(t);
  });
  // Only one numbered resolution → rename to RÉSOLUTION UNIQUE
  if (resolutionParas.length === 1 && /1/.test(resolutionParas[0])) {
    docXml = docXml.replace(/(<w:t[^>]*>)([^<]*)(R[ÉE]SOLUTION\s*(?:N°\s*)?1)([^<]*)(<\/w:t>)/g, function(m, open, before, res, after, close) {
      return open + before + 'RÉSOLUTION UNIQUE' + after + close;
    });
    doc.getZip().file("word/document.xml", docXml);
  }

  // Layout pass: collapse empty paragraphs + keepLines/keepNext to avoid orphans
  docXml = doc.getZip().file("word/document.xml").asText();
  docXml = improveLayout(docXml);
  // Cap excessive w:after values (template body paragraphs sometimes have 480 = 24pt that adds
  // unwanted gap before the next subtitle). Skip 600 (our explicit section-title after value)
  // and other small/medium values.
  docXml = docXml.replace(/w:after="(\d+)"/g, function(m, v) {
    const n = parseInt(v);
    if (n > 240 && n !== 720 && n !== 800 && n !== 1200) return 'w:after="120"';
    return m;
  });
  // Force uniform line spacing on every spacing element so titles & bodies look consistent
  // (some paragraphs had no w:line; others had 276 or 240).
  docXml = docXml.replace(/<w:spacing\b([^/]*?)\/>/g, function(m, attrs) {
    // Strip any existing w:line / w:lineRule (could be missing or duplicated)
    let a = attrs.replace(/\s*w:line="\d+"/g, '').replace(/\s*w:lineRule="[^"]+"/g, '');
    return '<w:spacing' + a + ' w:line="' + INTERLIGNE + '" w:lineRule="auto"/>';
  });
  // Ensure consistent gap below ARTICLE titles by bumping their w:after to 240 (12pt)
  // and removing any redundant empty paragraph that follows
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const texts = [];
    p.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(_, t) { texts.push(t); });
    const txt = texts.join('').trim();
    if (articlesDeStatuts(nomDuGabarit) && /^(ARTICLE|TITRE|ANNEXE)\b/i.test(txt)) {
      // Normalize the entire pPr block to a canonical form so every title
      // renders identically. TITRE/ANNEXE = centered; ARTICLE = left.
      const isCentered = /^(TITRE|ANNEXE)\b/i.test(txt);
      const isAnnexe = /^ANNEXE\b/i.test(txt);
      // Preserve original page break intent: ANNEXE always breaks, plus any
      // TITRE/ARTICLE that already had <w:pageBreakBefore/> or a hard
      // <w:br w:type="page"/> in its first run (VIVIBOT inserts the latter
      // for TITRE II+). The subsequent run-strip below removes the hard break,
      // so we re-encode the intent as pageBreakBefore in the canonical pPr.
      const hadPageBreak = /<w:pageBreakBefore\s*\/?>/i.test(p) || /<w:br\s+w:type="page"\s*\/?>/i.test(p);
      const jc = isCentered ? '<w:jc w:val="center"/>' : '';
      const pageBreak = (isAnnexe || hadPageBreak) ? '<w:pageBreakBefore/>' : '';
      let q = p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/,
        '<w:pPr>' + pageBreak + '<w:keepLines/><w:keepNext/><w:spacing w:before="360" w:after="240" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>' +
        jc +
        '<w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>'
      );
      // Strip empty trailing runs (no <w:t> inside) - these create phantom characters
      // that inflate the title's line height in LibreOffice, causing inconsistent gaps.
      q = q.replace(/<w:r\b[^>]*>(?:(?!<w:t[ >])[\s\S])*?<\/w:r>/g, '');
      // Strip TRAILING soft line breaks (<w:br/> right before </w:r>) - some templates have a
       // stray <w:br w:type="textWrapping"/> after the title text that adds a phantom empty line.
       // We must NOT touch <w:br/> placed between two <w:t> runs (legitimate multi-line titles).
      q = q.replace(/<w:br\b[^/]*\/>(\s*<\/w:r>)/g, '$1');
      return q;
    }
    return p;
  });
  // Remove single empty paragraphs that immediately follow article titles
  // (Use [ >] after `<w:t` so we don't confuse <w:tabs>/<w:tab> for actual text runs.)
  docXml = docXml.replace(
    /(<w:p[ >][\s\S]*?<w:t[^>]*>(?:ARTICLE|TITRE|ANNEXE)[^<]*<\/w:t>[\s\S]*?<\/w:p>)(<w:p[ >](?:(?!<w:t[ >])[\s\S])*?<\/w:p>)/g,
    '$1'
  );
  /*
   * Les paragraphes de corps se justifient.
   *
   * C'est la forme d'un acte, et le bord droit régulier se lit comme tel. Un titre
   * porte déjà w:jc="center" : il n'est pas concerné.
   *
   * Ce qui avait fait renoncer à la justification - une ligne terminée par un retour
   * manuel étalée d'un bord à l'autre - est réglé à la source par le réglage
   * `doNotExpandShiftReturn`, posé sur le document produit. Il n'y a donc plus
   * d'exception à faire ici.
   */
  const align = 'both';
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    if (/<w:jc\b/.test(p)) return p;
    if (/<w:pPr>/.test(p)) {
      return p.replace(/<w:pPr>/, '<w:pPr><w:jc w:val="' + align + '"/>');
    }
    return p.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr><w:jc w:val="' + align + '"/></w:pPr>');
  });

  // Signature name lines (bold paragraph that:
  //   a) is followed within 1-2 paras by "Bon pour acceptation"  → DG name in PV
  //   b) is preceded within 1-2 paras by "Signée électroniquement" → signing name in declarations
  // need extra breathing room above. improveLayout otherwise forces before=360
  // for any bold short paragraph it considers a title.
  {
    const partsSig = docXml.split('</w:p>');
    function txt(s) {
      const m = s.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      return m.map(x => x.replace(/<[^>]+>/g, '')).join('').trim();
    }
    for (let i = 0; i < partsSig.length; i++) {
      const t = txt(partsSig[i]);
      if (!t) continue;
      // a) "Bon pour acceptation" follows (DG name in PV)
      //
      // Le paragraphe qui précède immédiatement, et lui seul.
      //
      // La fenêtre portait sur deux paragraphes : dans une lettre, où le nom suit la
      // formule de politesse, elle posait un pouce de blanc avant « Je vous prie
      // d'agréer » autant qu'avant la signature - deux trous au milieu d'une page.
      // Le blanc est là pour signer : il revient au nom, non à ce qui le précède.
      let trigger = false;
      let beforeVal = '1440';
      if (i + 1 < partsSig.length && /Bon pour acceptation/i.test(txt(partsSig[i + 1]))) {
        trigger = true;
      }
      // b) "Signée électroniquement" precedes (signing name in déclaration de non-condamnation)
      if (!trigger) {
        for (let j = i - 1; j >= i - 3 && j >= 0; j--) {
          if (/Sign[ée]e\s+(électroniquement|electroniquement)/i.test(txt(partsSig[j]))) {
            trigger = true;
            beforeVal = '960'; // 2 lignes
            break;
          }
        }
      }
      // c) Consecutive signature names: bold short "Monsieur/Madame/Mademoiselle X Y"
      //    where a previous paragraph (skipping empties AND signature underline `___`) is
      //    also a signature name → blank line between
      if (!trigger && /^(Monsieur|Madame|Mademoiselle|Mr\.?|Mme|Mlle)\s+\S+/i.test(t) && t.length < 80) {
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const prevT = txt(partsSig[j]);
          if (!prevT) continue;
          if (/^_+$/.test(prevT)) continue; // Skip signature underline lines
          if (/^(Monsieur|Madame|Mademoiselle|Mr\.?|Mme|Mlle)\s+\S+/i.test(prevT) && prevT.length < 80) {
            trigger = true;
            beforeVal = '960'; // 2 lignes entre noms (1 ligne vide nette)
          }
          break;
        }
      }
      if (!trigger) continue;
      // Le gabarit qui a déjà choisi son blanc le garde.
      //
      // Un pouce sous la dernière ligne convient à une page de signatures, où il n'y a
      // rien d'autre. Dans une lettre, il pousse l'acceptation du bénéficiaire sur la
      // page suivante - le lecteur signe alors une page qui ne dit plus à quoi. Un
      // gabarit qui écrit son propre `w:before` sait ce qu'il fait.
      if (/<w:spacing\b[^/]*w:before="/.test(partsSig[i])) continue;
      if (!/<w:pPr>/.test(partsSig[i])) {
        partsSig[i] = partsSig[i].replace(/(<w:p\b[^>]*>)/, '$1<w:pPr></w:pPr>');
      }
      if (/<w:spacing\b/.test(partsSig[i])) {
        partsSig[i] = partsSig[i].replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
          const cleaned = attrs.replace(/\s*w:before="\d+"/g, '');
          return '<w:spacing w:before="' + beforeVal + '"' + cleaned + '/>';
        });
      } else {
        partsSig[i] = partsSig[i].replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="' + beforeVal + '" w:after="120" w:line="276" w:lineRule="auto"/>');
      }
    }
    docXml = partsSig.join('</w:p>');
  }

  // Standalone "Signature" label: blank line above AND below
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const texts = [];
    p.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(_, t) { texts.push(t); });
    const txt = texts.join('').trim();
    if (txt !== 'Signature') return p;
    if (!/<w:pPr>/.test(p)) {
      p = p.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr></w:pPr>');
    }
    if (/<w:spacing\b/.test(p)) {
      p = p.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
        const cleaned = attrs
          .replace(/\s*w:before="\d+"/g, '')
          .replace(/\s*w:after="\d+"/g, '');
        return '<w:spacing w:before="360" w:after="960"' + cleaned + '/>';
      });
    } else {
      p = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="360" w:after="960" w:line="276" w:lineRule="auto"/>');
    }
    return p;
  });

  // "CETTE RÉSOLUTION/DÉCISION EST ADOPTÉE…" closing lines need breathing room
  // above (240 = 12pt = ~ a blank line) - but NO keepNext (otherwise they get
  // glued to the next RÉSOLUTION and pushed to the next page).
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const texts = [];
    p.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(_, t) { texts.push(t); });
    const txt = texts.join('').trim();
    if (!/^CETTE\s+(R[ÉE]SOLUTION|D[ÉE]CISION)\b/i.test(txt)) return p;
    if (!/<w:pPr>/.test(p)) {
      p = p.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr></w:pPr>');
    }
    if (/<w:spacing\b/.test(p)) {
      p = p.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
        const cleaned = attrs.replace(/\s*w:before="\d+"/g, '');
        return '<w:spacing w:before="240"' + cleaned + '/>';
      });
    } else {
      p = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="240" w:after="120" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>');
    }
    return p;
  });

  // RÉSOLUTION title paragraphs (often contain body via <w:br/>) need breathing
  // room above (480 = 24pt before, equivalent to a blank line) and keepNext.
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const texts = [];
    p.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(_, t) { texts.push(t); });
    const txt = texts.join('').trim();
    if (!/^R[ÉE]SOLUTION\b/i.test(txt)) return p;
    if (!/<w:pPr>/.test(p)) {
      p = p.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr></w:pPr>');
    }
    if (/<w:spacing\b/.test(p)) {
      p = p.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
        const cleaned = attrs
          .replace(/\s*w:before="\d+"/g, '')
          .replace(/\s*w:after="\d+"/g, '');
        return '<w:spacing w:before="480" w:after="120"' + cleaned + '/>';
      });
    } else {
      p = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="480" w:after="120" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>');
    }
    if (!/<w:keepNext\b/.test(p)) {
      p = p.replace(/<w:pPr>/, '<w:pPr><w:keepNext/>');
    }
    return p;
  });

  // If a "list" of dashed items (paragraphs starting with "- ") has only ONE element,
  // remove the dash - a single-person line shouldn't be bulleted. Empty paragraphs
  // between dashed items don't break the run.
  {
    const bodyMatch = docXml.match(/^([\s\S]*?<w:body>)([\s\S]*?)(<\/w:body>[\s\S]*)$/);
    if (bodyMatch) {
      const [, bPrefix, body, bSuffix] = bodyMatch;
      const pParts = body.split('</w:p>');
      function pText(p) {
        const m = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        return m.map(x => x.replace(/<[^>]+>/g, '')).join('').trim();
      }
      const isDash = (p) => /^[-–—]\s/.test(pText(p));
      const isEmptyPara = (p) => pText(p).length === 0;
      let i = 0;
      while (i < pParts.length - 1) {
        if (!isDash(pParts[i])) { i++; continue; }
        // Walk forward, collecting dashed indices (skipping empties)
        const dashIdx = [i];
        let j = i + 1;
        while (j < pParts.length - 1) {
          if (isEmptyPara(pParts[j])) { j++; continue; }
          if (isDash(pParts[j])) { dashIdx.push(j); j++; continue; }
          break;
        }
        if (dashIdx.length === 1) {
          // Strip "- " (or "- "/"- ") from the FIRST <w:t> of the only dashed paragraph
          pParts[i] = pParts[i].replace(/(<w:t[^>]*>)([-–—])\s+/, '$1');
        }
        i = j;
      }
      docXml = bPrefix + pParts.join('</w:p>') + bSuffix;
    }
  }

  // Strip TRAILING empty runs (no <w:t> inside) from every paragraph - these phantom runs
  // can inflate line height in LibreOffice. We only target empty runs at the END of paragraphs.
  docXml = docXml.replace(/<w:r\b[^>]*>(?:(?!<w:t[ >])[\s\S])*?<\/w:r>(?=\s*<\/w:p>)/g, '');

  // Collapse runs of multiple consecutive <w:br/> into a single <w:br/>
  // (some templates have 2-3 line breaks creating excessive gaps, e.g. the title page).
  docXml = docXml.replace(
    /(<w:br\b[^/]*\/>\s*){2,}/g,
    '<w:br w:type="textWrapping"/>'
  );

  // Center "STATUTS CONSTITUTIFS" vertically on title page (large w:before) + bigger font
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txt = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
    const full = txt.join('').trim();
    if (full === 'STATUTS CONSTITUTIFS') {
      // Bump font size 36 → 48 (24pt) and add 4000 twips (~200pt) of before-spacing
      let q = p.replace(/<w:sz w:val="\d+"\s*\/>/g, '<w:sz w:val="48"/>');
      q = q.replace(/<w:szCs w:val="\d+"\s*\/>/g, '<w:szCs w:val="48"/>');
      // Add or replace w:before with a large value to push the title down
      if (/<w:spacing\b/.test(q)) {
        q = q.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
          const cleaned = attrs
            .replace(/\s*w:before="\d+"/g, '')
            .replace(/\s*w:after="\d+"/g, '');
          return '<w:spacing w:before="4000" w:after="240"' + cleaned + '/>';
        });
      } else {
        q = q.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="4000" w:after="240" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>');
      }
      return q;
    }
    return p;
  });

  // Bind signature labels ("Signature de...", "Fait à...") to the next paragraph (the signature name)
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txt = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
    const full = txt.join('').trim();
    if (/^(Signature\b|Fait\s+(?:à|le)\s)/i.test(full) && full.length < 200) {
      if (!/<w:keepNext\s*\/?>/.test(p)) {
        p = p.replace(/<w:pPr>/, '<w:pPr><w:keepNext/>');
      }
    }
    return p;
  });

  // Add keepNext to up-to-2 empty paragraphs that immediately follow "Signature de..." or
  // "Fait à..." - these empty paragraphs are the SPACE for the user to sign by hand; we want
  // to keep them in the chain so the whole signature block (label + space + name) stays on the
  // same page.
  for (let i = 0; i < 2; i++) {
    //
    // Chaque tour de la répétition prend un paragraphe, et un seul.
    //
    // `(?:<w:p[ >][\s\S]*?<\/w:p>)*?` en laissait passer plusieurs : la partie paresseuse
    // pouvait franchir une balise de fin pour aller à la suivante, si bien que N
    // paragraphes se découpaient de 2^N façons. Sur un acte à deux blocs de signature,
    // la mise au propre ne rendait plus la main - et c'est la lettre de renonciation,
    // qui écrit « Fait à ... » sous chaque acceptation, qui l'a montré.
    //
    // Interdire la balise de fin à l'intérieur ne laisse qu'un seul découpage possible.
    docXml = docXml.replace(
      /(<w:t[^>]*>\s*(?:Signature\b|Fait\s+(?:à|le)\s)[^<]*<\/w:t>(?:(?!<\/w:p>)[\s\S])*<\/w:p>(?:<w:p[ >](?:(?!<\/w:p>)[\s\S])*<\/w:p>)*?)(<w:p[ >])((?:(?!<w:t[ >])[\s\S])*?<\/w:p>)/,
      function(_, before, popen, rest) {
        if (/<w:keepNext/.test(popen + rest)) return _;
        if (/<w:pPr>/.test(rest)) {
          rest = rest.replace(/<w:pPr>/, '<w:pPr><w:keepNext/>');
        } else {
          rest = '<w:pPr><w:keepNext/></w:pPr>' + rest;
        }
        return before + popen + rest;
      }
    );
  }

  // Add a horizontal signature line ABOVE the bold name paragraph in signature blocks,
  // and FORCE the name to be bold. Pattern: "Signature de..." / "Fait à..." → (empties) → name.
  docXml = docXml.replace(
    /(<w:t[^>]*>\s*(?:Signature\b|Fait\s+(?:à|le)\s)[^<]*<\/w:t>(?:(?!<\/w:p>)[\s\S])*<\/w:p>(?:<w:p[ >](?:(?!<\/w:p>)(?!<w:t[ >])[\s\S])*<\/w:p>)*?)(<w:p[ >][\s\S]*?<\/w:p>)/g,
    function(m, before, namePara) {
      // Check the name paragraph has text content (skip empty paragraphs)
      const txts = [];
      namePara.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txts.push(t); });
      const fullText = txts.join('').trim();
      if (!fullText) return m;
      // Skip paragraphs that look like the "Président" / "Gérant" role label, the underscore line,
      // OR the "Signature" label itself (otherwise "Fait à..." triggers border above "Signature").
      //
      // Les intitulés d'un bloc de signature en font partie : « L'associé unique : » et
      // « Les associés : » annoncent le nom, ils ne le sont pas. Le trait se posait
      // au-dessus d'eux, pleine largeur, et le procès-verbal en portait deux - celui-ci
      // et celui que le gabarit dessine lui-même sous le libellé.
      if (
        /^_{5,}/.test(fullText) ||
        /^(Pr[ée]sident|G[ée]rant|Directeur|Signature)/i.test(fullText) ||
        /^(L['’]associ[ée]|Les associ[ée]s|Le[s]? soussign[ée]|Pour la soci[ée]t[ée])/i.test(fullText)
      ) return m;
      let newPara = namePara;
      // Add top border + right indent so the line is ~3 cm wide (not full page width)
      // + w:before=600 for vertical signing space.
      const border = '<w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>';
      const indent = '<w:ind w:right="7370"/>'; // text-width 9070 twips − 1700 (3 cm) = 7370
      // Always ensure border + indent are present
      if (!/<w:pBdr\b/.test(newPara)) {
        if (/<w:pPr>/.test(newPara)) {
          newPara = newPara.replace(/<w:pPr>/, '<w:pPr>' + border);
        } else {
          newPara = newPara.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr>' + border + '</w:pPr>');
        }
      }
      // Add or replace w:ind to constrain border width
      //
      // Seulement s'il en porte déjà un : le retrait borne le trait, mais il borne
      // aussi le texte, et un nom s'y coupait en trois lignes. Un gabarit qui veut un
      // trait court le dessine lui-même, en tirets bas - c'est ce que font les
      // procès-verbaux, et le paragraphe qui ne contient que des tirets est écarté
      // plus haut.
      if (/<w:ind\b/.test(newPara)) {
        newPara = newPara.replace(/<w:ind\b[^/]*\/>/, indent);
      }
      // Bump w:before to 600 for signing space
      if (/<w:spacing\b/.test(newPara)) {
        newPara = newPara.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
          const cleaned = attrs.replace(/\s*w:before="\d+"/g, '');
          return '<w:spacing w:before="600"' + cleaned + '/>';
        });
      } else {
        newPara = newPara.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="600"/>');
      }
      // Force bold on all runs of the name paragraph
      newPara = newPara.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, function(_m, inner) {
        // Strip any existing <w:b ...> first
        const cleaned = inner
          .replace(/<w:b\s*\/>/g, '')
          .replace(/<w:b\s+[^/]*\/>/g, '');
        return '<w:rPr><w:b w:val="1"/>' + cleaned + '</w:rPr>';
      });
      return before + newPara;
    }
  );

  // Conjoint template: merge "La soussignée : X" + "Épouse de Y." + "Tous deux mariés le Z..."
  // into a single flowing, justified, non-bold paragraph.
  docXml = docXml.replace(
    /(<w:p[ >][^<]*(?:<(?!w:p[ >])[^<]*)*?<w:t[^>]*>L[ae]\s+sousign[ée][\s\S]*?<\/w:p>)((?:<w:p[ >][\s\S]*?<\/w:p>){0,3})/i,
    function(_, soussigneePara, followingParas) {
      const allParas = [soussigneePara, ...(followingParas.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [])];
      const texts = [];
      let consumed = 0;
      for (const fp of allParas) {
        const txts = [];
        fp.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_m, t) { txts.push(t); });
        const full = txts.join('').trim();
        if (consumed === 0
            || /^(Épouse|Époux|Tous deux mariés|Tous deux pacsés|Pacsé)/i.test(full)
            || /^Déclare ne pas revendiquer/i.test(full)) {
          texts.push(full);
          consumed++;
        } else {
          break;
        }
      }
      // Build flowing sentence
      let combined = texts.join(' ');
      // "La soussignée :" → "La soussignée," / "Le soussigné :" → "Le soussigné,"
      combined = combined.replace(/^(La sousign[ée]e|Le sousign[ée])\s*:\s*/i, '$1, ');
      // Lowercase mid-sentence connectors
      combined = combined.replace(/\.\s+(Épouse|Époux|Tous deux)/g, ', $1');
      combined = combined.replace(/, (Épouse|Époux)/g, function(_m, w) { return ', ' + w.charAt(0).toLowerCase() + w.slice(1); });
      combined = combined.replace(/, (Tous deux)/g, function(_m, w) { return ', ' + w.charAt(0).toLowerCase() + w.slice(1); });
      // "sans contrat de mariage. Déclare ne pas..." → "sans contrat de mariage déclare ne pas..."
      combined = combined.replace(/\.\s+Déclare\b/g, ' déclare');
      combined = combined.replace(/,\s+Déclare\b/g, ' déclare');
      // Ensure ends with the expected colon (the "déclare ne pas revendiquer... société :" line) or period
      if (!/[.:]$/.test(combined)) combined += '.';
      // Build the canonical paragraph
      function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
      const newPara =
        '<w:p><w:pPr><w:keepLines/><w:spacing w:before="240" w:after="240" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>' +
        '<w:jc w:val="left"/><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>' +
        '<w:b w:val="0"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>' +
        '<w:b w:val="0"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>' +
        '<w:t xml:space="preserve">' + esc(combined) + '</w:t></w:r></w:p>';
      // Remaining paragraphs not consumed
      const remaining = allParas.slice(consumed).join('');
      return newPara + remaining;
    }
  );

  // DNC template: rewrite the "Je soussigné..." block as a single justified, non-bold paragraph.
  // Order: civilité+nom, naissance, nationalité, parents (mère née), demeurant.
  {
    const civNomPrenom = (cleanData.CIVILITE_NOM_PRENOM_1 || cleanData.CIVILITE_NOM_PRENOM || '').trim();

    /*
     * Une personne morale n'a ni naissance, ni filiation, ni nationalité.
     *
     * Un président qui est une société sortait « né le - à - (-), de nationalité
     * Française, fils de - et de - » : quatre mentions à trous, et une personne physique
     * inventée de toutes pièces. Sa désignation - forme, capital, siège, immatriculation,
     * représentant - a déjà été composée par le gabarit, et elle tient lieu de tout cela.
     */
    const estMorale = cleanData.ASSOC_1_EST_MORALE === true
      || cleanData.DIRIGEANT_EST_MORALE === true;
    const dateNaiss = (cleanData.DATE_NAISSANCE_1 || cleanData.DATE_NAISSANCE || '').trim();
    const lieuNaiss = (cleanData.LIEU_NAISSANCE_1 || cleanData.LIEU_NAISSANCE || '').trim();
    const nationalite = (cleanData.NATIONALITE_1 || cleanData.NATIONALITE || '').trim();
    const nomPere = (cleanData.NOM_PERE_1 || cleanData.NOM_PERE || '').trim();
    const nomMere = (cleanData.NOM_MERE_1 || cleanData.NOM_MERE || '').trim();
    /*
     * Le nom de jeune fille ne se déduit plus : c'est le champ lui-même.
     *
     * La phrase écrivait « et de Anne BERGER née BERGER » - le nom de naissance était
     * tiré du même champ que le nom de la mère, et le répétait donc toujours. Or c'est
     * précisément le nom de jeune fille que la déclaration doit porter, puisqu'il sert à
     * distinguer d'un homonyme : le formulaire le demande maintenant, sous ce nom.
     */
    const adresse = (cleanData.ADRESSE_ASSOCIE_1 || cleanData.ADRESSE_PERSO || cleanData.ADRESSE || '').trim();

    function fnEsc(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    // Detect document type by content:
    //   - "agissant en qualité de" + "déclare domicilier" → attestation de domiciliation
    //   - Otherwise → DNC-style (with parents)
    const isAttestationDomicile = /agissant\s+en\s+qualité/i.test(docXml) && /déclare\s+domicilier/i.test(docXml);
    const nomSociete = (cleanData.NOM_SOCIETE || '').trim();
    const formeDescription = (cleanData.FORME_DESCRIPTION || 'société par actions simplifiée').trim();
    const capital = (cleanData.MONTANT || cleanData.CAPITAL || '').trim();

    /*
     * L'accord se fait sur le nom qui est écrit.
     *
     * Cette phrase était figée au masculin - « Je soussigné », « né le », « fils
     * de » - alors qu'elle nomme juste avant « Madame X ». Une femme y était donc
     * désignée au masculin, dans un acte destiné au greffe.
     *
     * Le genre se lit sur la civilité effectivement rendue, et non sur un indicateur
     * séparé : ainsi la phrase ne peut pas se contredire elle-même.
     */
    const estFemme = /^\s*(madame|mademoiselle|mme)\b/i.test(civNomPrenom);
    const jeSoussigne = estFemme ? 'Je soussignée, ' : 'Je soussigné, ';
    const neLe = estFemme ? 'née le ' : 'né le ';
    const enfantDe = estFemme ? 'fille ' : 'fils ';

    /*
     * Cette passe ne vaut que pour les actes d'une création.
     *
     * Elle reconstruit la phrase entière à partir des clés d'un dossier de création -
     * CIVILITE_NOM_PRENOM_1, NOM_PERE_1, ADRESSE_ASSOCIE_1 - et remplace le paragraphe
     * d'origine par le résultat. Sur un acte d'un autre parcours, qui ne porte aucune de
     * ces clés, elle produisait « Je soussigné, , » et avalait les paragraphes suivants :
     * la déclaration du liquidateur d'une fermeture sortait sans nom ni date de naissance.
     *
     * Faute de civilité, il n'y a rien à reconstruire : on laisse le document tel que le
     * gabarit l'a rendu.
     */
    /*
     * Cette passe appartient aux déclarations, non à tout ce qui dit « Je soussigné ».
     *
     * Elle reconnaissait son paragraphe au seul mot « Je soussigné », et réécrivait le
     * premier qu'elle trouvait, où qu'il soit. La lettre de renonciation fait accepter le
     * souscripteur - « Je soussigné Marc BERTIN, 3 000 actions nouvelles, accepte la
     * renonciation qui précède » - et c'est cet engagement que la passe remplaçait par un
     * état civil vide : « Je soussigné, -, né le - à -, fils de - et de - ». La première
     * lettre du document, elle seule, et sans que rien ne le signale.
     *
     * Le nom du gabarit dit à qui elle s'adresse. Les quatre déclarations de non
     * condamnation sont les seuls actes qui portent cette phrase, et l'attestation de
     * domiciliation se reconnaît à son contenu comme avant.
     */
    const acteADeclarer =
      !nomDuGabarit || /non-condamnation|domicil/i.test(nomDuGabarit) || isAttestationDomicile;

    let finalText;
    if (!civNomPrenom || !acteADeclarer) {
      finalText = null;
    } else if (isAttestationDomicile) {
      // Attestation de domiciliation: include "agissant en qualité de Président..." and "déclare domicilier..."
      const parts = [jeSoussigne + civNomPrenom + ','];
      if (!estMorale && dateNaiss) {
        parts.push(neLe + dateNaiss + (lieuNaiss ? ' à ' + lieuNaiss : '') + ',');
      }
      if (!estMorale && nationalite) parts.push('de nationalité ' + nationalite + ',');
      if (adresse && !estMorale) parts.push('demeurant ' + adresse + ',');
      let agissant = 'agissant en qualité de Président de la société ' + nomSociete + ',';
      if (capital || formeDescription) {
        agissant = 'agissant en qualité de Président de la société ' + nomSociete + ', ' + formeDescription
          + (capital ? ' unipersonnelle au capital de ' + capital + ' euros' : '') + ',';
      }
      parts.push(agissant);
      parts.push('déclare domicilier le siège social de cette société à mon domicile personnel :');
      finalText = parts.join(' ');
    } else {
      // DNC-style sentence with parents
      const parts = [jeSoussigne + civNomPrenom + ','];
      if (!estMorale && dateNaiss) {
        parts.push(neLe + dateNaiss + (lieuNaiss ? ' à ' + lieuNaiss : '') + ',');
      }
      if (!estMorale && nationalite) parts.push('de nationalité ' + nationalite + ',');
      if (!estMorale && (nomPere || nomMere)) {
        /*
         * « fils de Paul MARCHAND et de Anne BERGER » : le second « de » se lisait
         * devant une voyelle. La préposition s'élide, comme partout ailleurs.
         */
        const de = (nom) =>
          /* L'apostrophe typographique, celle du reste des actes. */
          /^[aeiouyàâéèêëîïôöùûü]/i.test(nom.trim()) ? 'd\u2019' + nom : 'de ' + nom;

        let parents = '';
        if (nomPere) parents += enfantDe + de(nomPere);
        if (nomPere && nomMere) parents += ' et ' + de(nomMere);
        else if (nomMere) parents += enfantDe + de(nomMere);
        parts.push(parents);
      }
      /*
       * Une société n'habite pas, et sa désignation porte déjà son siège.
       *
       * La phrase l'écrivait deux fois : « …dont le siège social est 8 quai de la Gare
       * 75013 Paris, représentée par Monsieur Marc BERTIN, dont le siège social est 8
       * quai de la Gare ».
       */
      if (adresse && !estMorale) parts.push('et demeurant ' + adresse + ',');
      finalText = parts.join(' ');
    }

    // Rewrite the Je soussigné paragraph (+ following intro paragraphs) into a single justified one.
    // We only consume following paragraphs that match intro keywords; stop at the first non-matching one.
    const introKeywords = isAttestationDomicile
      ? ['demeurant', 'né le', 'née le', 'à ', 'de nationalité', 'monsieur', 'madame', 'mademoiselle',
         'agissant', 'déclare domicilier', 'declare domicilier']
      : ['demeurant', 'né le', 'née le', 'à ', 'de nationalité', 'fils de', 'fille de', 'et de', 'née ', 'né ',
         'monsieur', 'madame', 'mademoiselle'];
    if (finalText) docXml = docXml.replace(
      /(<w:p[ >][^<]*(?:<(?!w:p[ >])[^<]*)*?<w:t[^>]*>Je soussigné[\s\S]*?<\/w:p>)((?:<w:p[ >][\s\S]*?<\/w:p>){0,12})/,
      function(_, soussignePara, followingParas) {
        // Walk through followingParas, consume those matching intro keywords.
        // SKIP empty paragraphs (residual Mustache control tags become empty after render)
        // so they don't break the chain.
        const paras = followingParas.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
        let consumed = 0;
        let phrase = finalText;

        for (const fp of paras) {
          const textsArr = [];
          fp.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_m, t) { textsArr.push(t); });
          const brut = textsArr.join('').trim();
          const fullText = brut.toLowerCase();
          if (!fullText) {
            // Empty paragraph (control tag remnant) → consume and continue
            consumed++;
            continue;
          }
          /*
           * « déclare accepter les fonctions » achève la phrase, elle ne la recommence pas.
           *
           * L'état civil se termine par une virgule - « et demeurant 34 Rue Laugier, 75017
           * Paris, » - et le verbe qui la suit partait au paragraphe suivant, séparé par un
           * blanc. On lisait une phrase coupée en deux au milieu d'un acte : le sujet d'un
           * côté, le verbe de l'autre. Le texte rejoint donc la phrase qu'il termine.
           */
          if (fullText.startsWith('déclare') || fullText.startsWith('declare')) {
            phrase = phrase.replace(/\s*$/, '') + ' ' + brut;
            consumed++;
            break;
          }
          if (introKeywords.some(kw => fullText.startsWith(kw.toLowerCase()))) {
            consumed++;
          } else {
            break;
          }
        }

        // Build a fresh paragraph with our text, justified, not bold
        const newPara =
          '<w:p><w:pPr><w:keepLines/><w:spacing w:before="240" w:after="240" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>' +
          '<w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>' +
          '<w:b w:val="0"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>' +
          '<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>' +
          '<w:b w:val="0"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>' +
          '<w:t xml:space="preserve">' + fnEsc(phrase) + '</w:t></w:r></w:p>';

        const remaining = paras.slice(consumed).join('');
        return newPara + remaining;
      }
    );
  }

  // Signature date paragraph: ensure it reads "Fait à VILLE, le DATE," with breathing room
  const villeFromData = (cleanData.VILLE_SOCIETE || cleanData.VILLE_SIGNATURE || '').replace(/^-$/, '').trim();
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txt = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
    const full = txt.join('');
    // Match ONLY the signature date line. Must start with "A " (capital A + space) followed by
    // an optional ville and ", le <date>", OR "Le <date>" (when ville is empty).
    // We do NOT want to match "né le <date>" or other intra-text date patterns.
    const trimmed = full.trim();
    const startsWithA = /^A\s+[^,]*,\s*le\s+\d{1,2}\s+\w+\s+\d{4}\.?\s*$/.test(trimmed);
    const startsWithLe = /^Le\s+\d{1,2}\s+\w+\s+\d{4}\.?\s*$/.test(trimmed);
    if (startsWithA || startsWithLe) {
      // Extract date
      const dateMatch = full.match(/le\s+(\d{1,2}\s+\w+\s+\d{4})/i);
      const villeMatch = full.match(/^A\s+([^,]+?)\s*,/);
      // Prefer ville from form data; fall back to extracting from the rendered text.
      const extractedVille = villeMatch ? villeMatch[1].trim().replace(/^-$/, '') : '';
      const ville = villeFromData || extractedVille;
      const date = dateMatch ? dateMatch[1] : '';
      if (date) {
        const newText = ville
          ? `Fait à ${ville}, le ${date},`
          : `Fait le ${date},`;
        // Rebuild paragraph: put newText in the first <w:t>, empty all others.
        // Use captured groups (not m.replace(t, …) which replaces the first occurrence
        // of t anywhere in m - including the space inside `<w:t xml:space="preserve">`).
        let firstReplaced = false;
        let q = p.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, function(_m, open, _t, close) {
          if (!firstReplaced) {
            firstReplaced = true;
            return open + newText + close;
          }
          return open + close;
        });
        // Inject before/after spacing
        q = q.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
          const cleaned = attrs.replace(/\s*w:before="\d+"/g, '').replace(/\s*w:after="\d+"/g, '');
          return '<w:spacing w:before="360" w:after="720"' + cleaned + '/>';
        });
        return q;
      }
    }
    return p;
  });

  // Add double-line-break spacing before "ouverture d'un compte bancaire." (first ANNEXE bullet)
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txt = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
    const full = txt.join('').trim();
    if (/^ouverture d['’]un compte bancaire/i.test(full)) {
      return p.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
        const cleaned = attrs.replace(/\s*w:before="\d+"/g, '');
        return '<w:spacing w:before="480"' + cleaned + '/>';
      });
    }
    return p;
  });

  // Add breathing room above + below the centered "« SOCIETE »" line
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txt = [];
    p.replace(/<w:t[ >][^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
    const full = txt.join('').trim();
    if (full.length < 60 && /^«[\s ]*\S/.test(full) && /»\s*$/.test(full)) {
      // Replace spacing on this paragraph
      let q = p.replace(/<w:spacing\b[^/]*\/>/, '<w:spacing w:before="240" w:after="240" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>');
      // If no spacing existed, inject one
      if (q === p) {
        q = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="240" w:after="240" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>');
      }
      return q;
    }
    return p;
  });

  // Also remove single empty paragraphs that immediately precede article titles
  // (otherwise the empty para's line height stacks with the title's w:before, creating an extra gap).
  //
  // Ces deux passes appartiennent aux statuts, comme la normalisation des intitulés
  // plus haut : elles collent au titre le paragraphe qui le suit, ce qui convient à un
  // article de statuts et ferme la respiration d'un acte composé autrement.
  if (articlesDeStatuts(nomDuGabarit)) {
  docXml = docXml.replace(
    /(<w:p[ >](?:(?!<w:t[ >])[\s\S])*?<\/w:p>)(<w:p[ >][\s\S]*?<w:t[^>]*>(?:ARTICLE|TITRE|ANNEXE)[^<]*<\/w:t>)/g,
    '$2'
  );
  // Force w:before="0" AND normalize w:after on every paragraph that immediately follows an
  // article title. Without forcing both, LibreOffice can render different gaps across articles
  // depending on inherited spacing from the body paragraph's local w:after value.
  docXml = docXml.replace(
    /(<w:p[ >][\s\S]*?<w:t[^>]*>(?:ARTICLE|TITRE|ANNEXE)[^<]*<\/w:t>[\s\S]*?<\/w:p>)(<w:p[ >][\s\S]*?<\/w:p>)/g,
    function(_, title, body) {
      let b = body;
      b = b.replace(/<w:spacing\b([^/]*?)\/>/, function(_m, attrs) {
        const cleaned = attrs
          .replace(/\s*w:before="\d+"/g, '')
          .replace(/\s*w:after="\d+"/g, '');
        return '<w:spacing w:before="0" w:after="0"' + cleaned + '/>';
      });
      // KEEP keepLines/keepNext on the body so it stays bound to the title across page breaks.
      return title + b;
    }
  );
  }
  // Also strip TRAILING <w:br/> (right before </w:r>) from body paragraphs that immediately
  // follow article titles. We must NOT touch <w:br/> between two <w:t> (legitimate line break).
  docXml = docXml.replace(
    /(<w:p[ >][\s\S]*?<w:t[^>]*>(?:ARTICLE|TITRE|ANNEXE)[^<]*<\/w:t>[\s\S]*?<\/w:p>)(<w:p[ >][\s\S]*?<\/w:p>)/g,
    function(_, title, body) {
      return title + body.replace(/<w:br\b[^/]*\/>(\s*<\/w:r>)/g, '$1');
    }
  );
  doc.getZip().file("word/document.xml", docXml);

  // Bump default font size and line spacing for readability
  const stylesFile = doc.getZip().file("word/styles.xml");
  if (stylesFile) {
    let stylesXml = stylesFile.asText();
    stylesXml = stylesXml.replace(
      /(<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>)/,
      function(block) {
        return block
          .replace(/<w:sz w:val="22"\/>/g, '<w:sz w:val="24"/>')
          .replace(/<w:szCs w:val="22"\/>/g, '<w:szCs w:val="26"/>');
      }
    );
    // Normalize pPrDefault: interligne courant et w:after=0, pour que les paragraphes
    // sans <w:spacing> propre n'héritent pas d'un grand écart.
    stylesXml = stylesXml.replace(
      /(<w:pPrDefault>[\s\S]*?<\/w:pPrDefault>)/,
      function(block) {
        return block.replace(/<w:spacing\b[^/]*\/>/,
          '<w:spacing w:after="0" w:line="' + INTERLIGNE + '" w:lineRule="auto"/>'
        );
      }
    );
    doc.getZip().file("word/styles.xml", stylesXml);
  }

  // Strip numbering prefixes "1- / 2 - ..." in articles 20-25
  // + flush every non-bulleted paragraph to the left (no hanging indent / no left indent)
  docXml = doc.getZip().file("word/document.xml").asText();
  {
    let currentArticle = 0;
    docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(para) {
      const tags = [];
      para.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(_, t) { tags.push(t); });
      const full = tags.join('').trim();
      const headMatch = full.match(/^ARTICLE\s+(\d+)/);
      if (headMatch) { currentArticle = parseInt(headMatch[1]); return para; }

      let result = para;

      // Articles 20-25: strip leading "1- " / "2 -" digit prefix + ALL tabs
      // (continuation paragraphs without prefix also had leading tabs from the old numbering style)
      if (currentArticle >= 20 && currentArticle <= 25) {
        const prefixMatch = full.match(/^(\s*\d+\s*[-–]\s*)/);
        if (prefixMatch) {
          let remaining = prefixMatch[1].length;
          result = result.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) {
            if (remaining <= 0) return m;
            if (t.length <= remaining) { remaining -= t.length; return m.replace(t, ''); }
            const cleaned = t.slice(remaining);
            remaining = 0;
            return m.replace(t, cleaned);
          });
        }
        result = result.replace(/<w:tab\s*\/>/g, '');
      }

      // Strip <w:ind> from non-bulleted paragraphs (X.Y. items + continuations flush left)
      // Bulleted lists keep their indent because they have <w:numPr>.
      //
      // Une énumération écrite au tiret en est une aussi, sans porter de numérotation
      // Word : les postes d'affectation d'un procès-verbal - « - à la réserve légale :
      // 1 536,05 euros ; » - perdaient leur retrait et revenaient contre la marge, au
      // même rang que la phrase qui les annonce.
      const tiretEnTete = /^[-–—]\s+\S/.test(full);
      /*
       * Une énumération en « a) », « b) »… en est une aussi. Les attestations sur
       * l'honneur d'une déclaration de confidentialité s'écrivent ainsi, et la ligne
       * qui revenait à la ligne repartait contre la marge, sous la lettre au lieu du
       * texte.
       */
      const lettreEnTete = /^[a-z0-9]{1,3}\)(\s|$)/i.test(full);
      /* Le retrait d'un paragraphe bordé donne la largeur de son trait de signature. */
      const porteUnTrait = /<w:pBdr\b/.test(result);
      if (!/<w:numPr\b/.test(result) && !tiretEnTete && !lettreEnTete && !porteUnTrait) {
        result = result.replace(/<w:ind\b[^/]*\/>/g, '');
      }
      // X.Y. paragraphs ("8.1.", "10.3.", "19.1"...) often have a <w:tab/> after the prefix
      // (used with the hanging indent we just removed). Replace it with a single space so
      // text doesn't get glued to the number ("19.1Décisions" → "19.1 Décisions").
      if (/^\d+\.\d+\.?/.test(full)) {
        result = result.replace(/<w:tab\s*\/>/g, '<w:t xml:space="preserve"> </w:t>');
      }
      return result;
    });
  }
  doc.getZip().file("word/document.xml", docXml);

  // Text replacements (typos / capitalization fixes)
  docXml = doc.getZip().file("word/document.xml").asText();
  docXml = docXml.replace(/Etude Notariale De Maître/g, 'Etude Notariale de Maître');
  docXml = docXml.replace(/Quentin Fourez Notaires à/g, 'Quentin Fourez, Notaires situés');
  // Attestation de domiciliation: rephrase "à mon domicile personnel sis :" so it includes
  // the occupation status (propriétaire / locataire) inline, and remove the now-redundant
  // "dont je suis {STATUT}." paragraph below.
  docXml = docXml.replace(
    /(d[ée]clare\s+domicilier\s+le\s+siège\s+social\s+de\s+cette\s+société\s+à\s+mon\s+domicile\s+personnel)\s+sis\s*:/gi,
    'Déclare domicilier le siège social de cette société à mon domicile personnel dont je suis propriétaire à l’adresse suivante :'
  );
  // Remove redundant "dont je suis (propriétaire|locataire|...)." paragraph
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txts = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txts.push(t); });
    const full = txts.join('').trim();
    if (/^dont je suis\s+(propriétaire|locataire|usager|occupant)\s*\.?\s*$/i.test(full)) return '';
    return p;
  });
  // Center any short paragraph containing only an address (in attestation de domiciliation, etc.)
  //
  // Sauf là où le gabarit a déjà choisi de l'aligner à droite.
  //
  // La règle est née pour l'attestation de domiciliation, où l'adresse se pose seule
  // au milieu de la page. Dans une lettre, elle se range dans le bloc du destinataire,
  // à droite avec les lignes qui l'entourent - et la règle la ramenait au centre, une
  // ligne sur trois flottant entre deux autres. Un alignement écrit dans le gabarit est
  // une décision : on ne la reprend pas.
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    if (/<w:jc w:val="right"\s*\/>/.test(p)) return p;
    const txts = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txts.push(t); });
    const full = txts.join('').trim();
    // Address pattern: starts with digit(s) + space + street type, contains ZIP code (5 digits)
    if (/^\d+\s+(avenue|rue|route|place|boulevard|chemin|impasse|allée|cours|quai|esplanade|square|villa)/i.test(full)
        && /\b\d{5}\b/.test(full) && full.length < 150) {
      // Replace or set <w:jc w:val="center"/>
      if (/<w:jc\b/.test(p)) {
        return p.replace(/<w:jc\b[^/]*\/>/, '<w:jc w:val="center"/>');
      }
      return p.replace(/<w:pPr>/, '<w:pPr><w:jc w:val="center"/>');
    }
    return p;
  });
  // "Nombre d'actions souscrites : 100" → "Nombre d'actions souscrites : 100 actions"
  //
  // Le nombre est formaté à la française : au-delà de mille, il porte un séparateur
  // de milliers. Un \d+ s'arrêtait dessus et insérait le mot au milieu du nombre -
  // « 1 actions 000 ». Les trois espaces possibles sont donc acceptées : ordinaire,
  // insécable et fine insécable.
  docXml = docXml.replace(
    /(Nombre d['’]actions souscrites\s*:\s*\d[\d \u00a0\u202f]*)(?!\s*actions)/g,
    (_, capture) => capture.replace(/\s+$/, '') + ' actions'
  );
  // Remove "- Reste à libérer : 0 euros" line (nothing left to release → useless line)
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txt = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
    const full = txt.join('').trim();
    if (/^-\s*Reste à libérer\s*:\s*0\s*euros?\s*\.?$/i.test(full)) return '';
    return p;
  });
  /*
   * Le trait à signer ne se retire que s'il a été remplacé.
   *
   * Cette passe efface les lignes de soulignés des gabarits, parce que la passe
   * précédente en dessine une, en bordure, au-dessus du nom en gras. Encore faut-il
   * qu'elle l'ait dessinée : elle se déclenche sur « Signature » ou « Fait à », et la
   * liste des souscripteurs annonce « Signatures des actionnaires » - au pluriel, que
   * la limite de mot refuse. Les soulignés étaient donc retirés sans remplaçant, et une
   * pièce du dépôt qui se signe sortait sans une seule ligne où signer.
   *
   * On regarde maintenant le paragraphe suivant : s'il porte le trait, celui-ci fait
   * double emploi et s'efface ; sinon il est le seul qu'il y ait, et il reste. Les deux
   * passes parcourent les paragraphes dans le même ordre, d'où l'index partagé.
   */
  {
    const texteDu = (p) => {
      const txt = [];
      p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
      return txt.join('').trim();
    };
    const paragraphes = docXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    const aRetirer = new Set();
    for (let i = 0; i < paragraphes.length; i++) {
      const full = texteDu(paragraphes[i]);
      const souligne = /^_+$/.test(full) && full.length >= 5;
      const videBorde = !full && /<w:pBdr\b[\s\S]*?<w:bottom\b/.test(paragraphes[i]);
      if (!souligne && !videBorde) continue;
      /* Le placeholder à bordure basse s'efface toujours : il ne dessine rien. */
      if (videBorde) { aRetirer.add(i); continue; }
      const suivant = paragraphes[i + 1] || '';
      if (/<w:pBdr\b[\s\S]*?<w:top\b/.test(suivant)) aRetirer.add(i);
    }
    /*
     * Le trait qui reste ne se sépare pas du nom qu'il annonce.
     *
     * Une ligne à signer seule au bas d'une page, le nom au verso, c'est la même faute
     * que le « Bon pour acceptation » d'une page vierge : on signe sans savoir sous quoi.
     * Le bloc entier change de page plutôt que de se couper.
     */
    let rang = -1;
    docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
      rang++;
      if (aRetirer.has(rang)) return '';
      const full = texteDu(p);
      if (!/^_+$/.test(full) || full.length < 5) return p;
      if (/<w:keepNext\s*\/?>/.test(p)) return p;
      if (/<w:pPr>/.test(p)) return p.replace(/<w:pPr>/, '<w:pPr><w:keepNext/>');
      return p.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr><w:keepNext/></w:pPr>');
    });
  }
  doc.getZip().file("word/document.xml", docXml);

  // Remove bold from specific defined terms that shouldn't be bold
  docXml = doc.getZip().file("word/document.xml").asText();
  docXml = docXml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, function(run) {
    var t = (run.match(/<w:t[^>]*>([^<]*)<\/w:t>/) || [])[1];
    if (!t) return run;
    var trimmed = t.trim();
    if (trimmed === 'Demandeur' || trimmed === 'Société' || trimmed === 'Délai de Réponse') {
      return run
        .replace(/<w:b\s*\/?>/g, '')
        .replace(/<w:b\s+[^/]*\/>/g, '')
        .replace(/<w:bCs\s*\/?>/g, '')
        .replace(/<w:bCs\s+[^/]*\/>/g, '');
    }
    return run;
  });
  doc.getZip().file("word/document.xml", docXml);

  // Le corps d'un acte se compose en douze points.
  //
  // Cette normalisation portait tout ce qui était plus petit à treize, et posait treize
  // là où rien n'était dit : la taille écrite dans un gabarit ne survivait donc pas au
  // rendu, et le douze points repris par le cabinet ressortait en treize. Le seuil
  // s'arrête sous vingt-quatre, de sorte que douze points et les titres passent intacts.
  //
  // Les marqueurs cachés (sz=2) restent hors d'atteinte, comme avant.
  docXml = doc.getZip().file("word/document.xml").asText();
  docXml = docXml.replace(/<w:sz w:val="(\d+)"\s*\/>/g, function(m, v) {
    const n = parseInt(v);
    return (n >= 4 && n < CORPS) ? '<w:sz w:val="' + CORPS + '"/>' : m;
  });
  docXml = docXml.replace(/<w:szCs w:val="(\d+)"\s*\/>/g, function(m, v) {
    const n = parseInt(v);
    return (n >= 4 && n < CORPS) ? '<w:szCs w:val="' + CORPS + '"/>' : m;
  });
  docXml = docXml.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, function(m, inner) {
    if (/<w:sz\b/.test(inner)) return m; // already has a size
    return '<w:rPr>' + inner + '<w:sz w:val="' + CORPS + '"/><w:szCs w:val="' + CORPS + '"/></w:rPr>';
  });
  doc.getZip().file("word/document.xml", docXml);

  return uniformiserLaPolice(doc.getZip()).generate({ type: "nodebuffer" });
}

/**
 * Le fer à gauche, y compris là où le gabarit justifie en dur.
 *
 * Vingt-quatre gabarits portent `w:jc="both"` sur chacun de leurs paragraphes - les
 * statuts, les déclarations, les modèles du cabinet. Les reprendre un à un reviendrait à
 * poser le choix dans vingt-quatre fichiers binaires ; il tient ici, en un endroit, et
 * s'applique aussi aux modèles rendus par l'autre chemin.
 */
/**
 * Le texte du document, sous une seule forme Unicode.
 *
 * Un « é » s'écrit de deux façons : le caractère composé, ou un « e » suivi de l'accent.
 * Les deux s'affichent pareil et ne se comparent pas. Les statuts de SAS portaient la
 * seconde forme, et la règle qui accorde « né(e) » cherchait la première : dix mentions
 * par jeu de statuts sortaient donc « Monsieur Jean Dupont, né(e) le 12 avril 1980 »,
 * dans un acte déposé au greffe. La règle avait bien deux branches pour les deux formes,
 * mais la même chaîne écrite deux fois - le défaut ne pouvait pas se voir en la relisant.
 *
 * Normaliser une fois au départ vaut mieux que de dédoubler chaque comparaison : la
 * typographie, les accords et les recherches qui suivent portent tous sur du texte lu.
 */
function normaliserLeTexte(xml) {
  return xml.normalize("NFC");
}





/**
 * Une seule police pour tous les documents que Formalist produit.
 *
 * Cinq gabarits venaient du cabinet avec sa feuille de styles : Garamond 11,5 points,
 * interligne 1,25. Les cinquante autres sont en Cambria 12, interligne 1,15. Un même
 * dossier mêlait donc deux typographies - le procès-verbal dans l'une, le rapport et les
 * bulletins dans l'autre - et cela se voyait au premier coup d'œil.
 *
 * La police se pose ici, comme l'alignement, plutôt que dans les fichiers : les gabarits
 * restent ceux que le cabinet a livrés, et revenir en arrière tient en une ligne. La
 * feuille de styles est touchée avec le document, sans quoi le corps par défaut - celui
 * des paragraphes qui ne déclarent rien - resterait à 11,5.
 *
 * Les corps de titres gardent leur échelle : seul le corps de texte est ramené au commun.
 */
const POLICE = "Cambria";
/* Ce que la feuille de styles du cabinet pose : 11,5 points, interligne 1,25. */
const CORPS_CABINET = "23";
const INTERLIGNE_CABINET = "300";

function uniformiserLaPolice(zip) {
  for (const nom of ["word/document.xml", "word/styles.xml", "word/fontTable.xml", "word/theme/theme1.xml"]) {
    const fichier = zip.file(nom);
    if (!fichier) continue;
    let xml = fichier.asText().replace(/Garamond/g, POLICE);
    if (nom === "word/document.xml" || nom === "word/styles.xml") {
      xml = xml
        .replace(new RegExp('<w:sz w:val="' + CORPS_CABINET + '"\\s*/>', "g"), '<w:sz w:val="' + CORPS + '"/>')
        .replace(new RegExp('<w:szCs w:val="' + CORPS_CABINET + '"\\s*/>', "g"), '<w:szCs w:val="' + CORPS + '"/>')
        .replace(new RegExp('w:line="' + INTERLIGNE_CABINET + '"', "g"), 'w:line="' + INTERLIGNE + '"');
    }
    zip.file(nom, xml);
  }

  return sansEtirerLesRetoursManuels(zip);
}

/**
 * Une ligne terminée par un retour manuel ne s'étire pas.
 *
 * C'est la règle qui manquait. Word justifie par défaut la ligne qui précède un retour
 * à la ligne - elle n'est pas la dernière du paragraphe, donc il l'étale d'un bord à
 * l'autre : « RÉSOLUTION UNIQUE : » occupait seize centimètres, et « une action ⟶
 * nouvelle » se séparait d'un grand vide.
 *
 * Le format prévoit ce cas : `doNotExpandShiftReturn` est le réglage de compatibilité
 * qui l'interdit. Le poser vaut mieux que de renoncer à justifier ces paragraphes -
 * l'acte reste justifié d'un bout à l'autre, et aucune ligne ne s'étale.
 */
function sansEtirerLesRetoursManuels(zip) {
  const fichier = zip.file("word/settings.xml");
  if (!fichier) return zip;

  let xml = fichier.asText();
  if (xml.includes("doNotExpandShiftReturn")) return zip;

  if (/<w:compat\s*\/>/.test(xml)) {
    xml = xml.replace(/<w:compat\s*\/>/, "<w:compat><w:doNotExpandShiftReturn/></w:compat>");
  } else if (/<w:compat>/.test(xml)) {
    xml = xml.replace("<w:compat>", "<w:compat><w:doNotExpandShiftReturn/>");
  } else {
    xml = xml.replace(
      /(<w:settings\b[^>]*>)/,
      "$1<w:compat><w:doNotExpandShiftReturn/></w:compat>"
    );
  }

  zip.file("word/settings.xml", xml);
  return zip;
}

function generateDocx(templateName, data) {
  const buf = loadTemplate(templateName);
  return generateDocxFromBuffer(buf, data, templateName);
}

/** Inject a signature image into a DOCX buffer near signer's name */
function injectSignature(docxBuffer, signatureBase64, signerName, sigIndex) {
  if (!signatureBase64) return docxBuffer;

  const idx = sigIndex || 1;
  const zip = new PizZip(docxBuffer);

  const imgData = Buffer.from(signatureBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
  zip.file(`word/media/signature${idx}.png`, imgData);

  let contentTypes = zip.file("[Content_Types].xml").asText();
  if (!contentTypes.includes('Extension="png"')) {
    contentTypes = contentTypes.replace("</Types>", '<Default ContentType="image/png" Extension="png"/></Types>');
    zip.file("[Content_Types].xml", contentTypes);
  }

  let rels = zip.file("word/_rels/document.xml.rels").asText();
  const relId = `rIdSig${idx}`;
  rels = rels.replace("</Relationships>",
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/signature${idx}.png"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", rels);

  const cx = "2160000";
  const cy = "900000";
  const sigImageParagraph =
    `<w:p><w:pPr><w:spacing w:before="120" w:after="0"/></w:pPr><w:r><w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">`
    + `<wp:extent cx="${cx}" cy="${cy}"/>`
    + `<wp:docPr id="999" name="Signature"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
    + `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:nvPicPr><pic:cNvPr id="0" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

  let docXml = zip.file("word/document.xml").asText();
  const paragraphs = docXml.split("</w:p>");

  const paraTexts = paragraphs.map(function(p) {
    const textParts = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (!textParts) return "";
    return textParts.map(tp => tp.replace(/<[^>]+>/g, "")).join("");
  });

  const signerParts = signerName ? signerName.toLowerCase().replace(/\s+/g, " ").trim().split(" ").filter(p => p.length > 1) : [];

  function matchesSignerName(text) {
    if (!signerParts.length) return true;
    const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
    return signerParts.every(part => norm.includes(part));
  }

  function looksLikeName(text) {
    return text.length > 0 && text.length < 60
      && !text.includes(".")
      && !/^\d/.test(text)
      && !/^(Article|ARTICLE|Chapitre|TITRE|ANNEXE)/.test(text);
  }

  let injected = false;

  for (let i = 0; i < paragraphs.length; i++) {
    const text = paraTexts[i];
    if (!text) continue;

    const isUnderscoreLine = /^[_\s]+$/.test(text.trim()) && text.trim().length >= 10;
    if (!isUnderscoreLine) continue;

    let nameText = null;
    let nextIdx = i + 1;
    while (nextIdx < paraTexts.length && !paraTexts[nextIdx].trim()) nextIdx++;
    if (nextIdx < paraTexts.length) {
      const nt = paraTexts[nextIdx].trim();
      if (looksLikeName(nt) && matchesSignerName(nt)) nameText = nt;
    }

    if (!nameText) {
      for (let back = 1; back <= 3 && (i - back) >= 0; back++) {
        const prevText = paraTexts[i - back].trim();
        if (!prevText) continue;
        if (looksLikeName(prevText) && matchesSignerName(prevText)) {
          nameText = prevText;
          break;
        }
      }
    }

    if (!nameText) continue;

    let pStartIdx = paragraphs[i].lastIndexOf("<w:p ");
    if (pStartIdx === -1) pStartIdx = paragraphs[i].lastIndexOf("<w:p>");
    if (pStartIdx !== -1) {
      const sigForSplit = sigImageParagraph.replace(/<\/w:p>$/, "");
      paragraphs[i] = paragraphs[i].substring(0, pStartIdx) + sigForSplit;
      injected = true;
    }
  }

  docXml = paragraphs.join("</w:p>");

  if (injected) {
    zip.file("word/document.xml", docXml);
  }

  return zip.generate({ type: "nodebuffer" });
}

module.exports = { TEMPLATES, templateCache, loadTemplate, loadAllTemplates, generateDocx, generateDocxFromBuffer, injectSignature, uniformiserLaPolice, normaliserLeTexte };
