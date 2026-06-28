/**
 * docx.js — DOCX generation, signature injection, template cache
 * Dependencies: pizzip, docxtemplater
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const TEMPLATES = path.join(__dirname, "..", "templates");
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

/** Enrich data with derived fields for DOCX rendering */
function enrichData(data) {
  const civPres = (data.CIVILITE || data.CIVILITE_NOM_PRENOM || "").toString().toLowerCase();
  data.EST_HOMME = civPres.indexOf("monsieur") >= 0 || civPres.indexOf("mr") >= 0;
  data.EST_FEMME = !data.EST_HOMME;

  for (let n = 1; n <= 3; n++) {
    const prefix = "DG_" + n + "_";
    if (data[prefix + "CIVILITE"] && !data["HAS_DG_" + n]) {
      data["HAS_DG_" + n] = true;
    }
    if (data[prefix + "CIVILITE"] && !data[prefix + "CIVILITE_NOM_PRENOM"]) {
      data[prefix + "CIVILITE_NOM_PRENOM"] = ((data[prefix + "CIVILITE"] || "") + " " + (data[prefix + "NOM"] || "") + " " + (data[prefix + "PRENOM"] || "")).trim();
    }
    const civDg = (data[prefix + "CIVILITE"] || "").toString().toLowerCase();
    data[prefix + "EST_HOMME"] = civDg.indexOf("monsieur") >= 0 || civDg.indexOf("mr") >= 0;
    data[prefix + "EST_FEMME"] = !data[prefix + "EST_HOMME"];
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
    // not section headings — they shouldn't get keepNext (which forces them
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
    if (isTitle(p)) {
      // Title gets keepNext so it stays bound to its body paragraph.
      // Do NOT add keepNext to the body itself — that would create overly-long chains
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
        const before = isSectionTitle ? 480 : 360;
        // If next paragraph is also centered (document title + subtitle), use tight after-spacing.
        const after = isSectionTitle
          ? (nextIsCentered ? 0 : 600)
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
          p = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="' + before + '" w:after="' + after + '" w:line="312" w:lineRule="auto"/>');
        }
        // Long ALL CAPS section title → bump font size to 30 (15pt)
        if (isSectionTitle) {
          p = p.replace(/<w:sz w:val="\d+"\s*\/>/g, '<w:sz w:val="30"/>');
          p = p.replace(/<w:szCs w:val="\d+"\s*\/>/g, '<w:szCs w:val="30"/>');
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

function generateDocxFromBuffer(buf, data) {
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

  // Fix "né(e)" → "né" or "née" based on civility in same paragraph
  {
    let xml = doc.getZip().file("word/document.xml").asText();
    xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(para) {
      if (para.indexOf("né(e)") === -1 && para.indexOf("né(e)") === -1) return para;
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
    // "d'<consonne>" → "de <consonne>" — apostrophe française avant voyelles uniquement.
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
    if (n > 240 && n !== 600 && n !== 720 && n !== 800 && n !== 1200) return 'w:after="120"';
    return m;
  });
  // Force uniform line spacing on every spacing element so titles & bodies look consistent
  // (some paragraphs had no w:line; others had 276 or 240). w:line="312" ≈ 1.2x with 13pt font.
  docXml = docXml.replace(/<w:spacing\b([^/]*?)\/>/g, function(m, attrs) {
    // Strip any existing w:line / w:lineRule (could be missing or duplicated)
    let a = attrs.replace(/\s*w:line="\d+"/g, '').replace(/\s*w:lineRule="[^"]+"/g, '');
    return '<w:spacing' + a + ' w:line="312" w:lineRule="auto"/>';
  });
  // Ensure consistent gap below ARTICLE titles by bumping their w:after to 240 (12pt)
  // and removing any redundant empty paragraph that follows
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const texts = [];
    p.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(_, t) { texts.push(t); });
    const txt = texts.join('').trim();
    if (/^(ARTICLE|TITRE|ANNEXE)\b/i.test(txt)) {
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
        '<w:pPr>' + pageBreak + '<w:keepLines/><w:keepNext/><w:spacing w:before="360" w:after="240" w:line="312" w:lineRule="auto"/>' +
        jc +
        '<w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:pPr>'
      );
      // Strip empty trailing runs (no <w:t> inside) — these create phantom characters
      // that inflate the title's line height in LibreOffice, causing inconsistent gaps.
      q = q.replace(/<w:r\b[^>]*>(?:(?!<w:t[ >])[\s\S])*?<\/w:r>/g, '');
      // Strip TRAILING soft line breaks (<w:br/> right before </w:r>) — some templates have a
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
  // Default-justify body paragraphs: paragraphs without any <w:jc> alignment get w:jc="both".
  // (Title paragraphs typically already have <w:jc w:val="center"/>, so they're not affected.)
  // EXCEPTION: short introducer lines ending with ":" (ex: "Représentant la totalité des actions
  // afin de participer à :", "Sont présents :", "Le Cédant :") get left-aligned, because
  // justification spreads single-line text and creates huge ugly gaps between words.
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    if (/<w:jc\b/.test(p)) return p;
    const texts = [];
    p.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(_, t) { texts.push(t); });
    const txt = texts.join('').trim();
    const endsWithColon = /[: ]\s*$/.test(txt) && txt.endsWith(':');
    const isShortIntroducer = endsWithColon && txt.length < 140;
    const startsWithResolution = /^R[ÉE]SOLUTION\b/i.test(txt);
    const align = (isShortIntroducer || startsWithResolution) ? 'left' : 'both';
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
      let trigger = false;
      let beforeVal = '1440';
      for (let j = i + 1; j <= i + 2 && j < partsSig.length; j++) {
        if (/Bon pour acceptation/i.test(txt(partsSig[j]))) { trigger = true; break; }
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
  // above (240 = 12pt = ~ a blank line) — but NO keepNext (otherwise they get
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
      p = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="240" w:after="120" w:line="312" w:lineRule="auto"/>');
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
      p = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="480" w:after="120" w:line="312" w:lineRule="auto"/>');
    }
    if (!/<w:keepNext\b/.test(p)) {
      p = p.replace(/<w:pPr>/, '<w:pPr><w:keepNext/>');
    }
    return p;
  });

  // If a "list" of dashed items (paragraphs starting with "- ") has only ONE element,
  // remove the dash — a single-person line shouldn't be bulleted. Empty paragraphs
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
          // Strip "- " (or "– "/"— ") from the FIRST <w:t> of the only dashed paragraph
          pParts[i] = pParts[i].replace(/(<w:t[^>]*>)([-–—])\s+/, '$1');
        }
        i = j;
      }
      docXml = bPrefix + pParts.join('</w:p>') + bSuffix;
    }
  }

  // Strip TRAILING empty runs (no <w:t> inside) from every paragraph — these phantom runs
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
        q = q.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="4000" w:after="240" w:line="312" w:lineRule="auto"/>');
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
  // "Fait à..." — these empty paragraphs are the SPACE for the user to sign by hand; we want
  // to keep them in the chain so the whole signature block (label + space + name) stays on the
  // same page.
  for (let i = 0; i < 2; i++) {
    docXml = docXml.replace(
      /(<w:t[^>]*>\s*(?:Signature\b|Fait\s+(?:à|le)\s)[^<]*<\/w:t>[\s\S]*?<\/w:p>(?:<w:p[ >][\s\S]*?<\/w:p>)*?)(<w:p[ >])((?:(?!<w:t[ >])[\s\S])*?<\/w:p>)/,
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
    /(<w:t[^>]*>\s*(?:Signature\b|Fait\s+(?:à|le)\s)[^<]*<\/w:t>[\s\S]*?<\/w:p>(?:<w:p[ >](?:(?!<w:t[ >])[\s\S])*?<\/w:p>)*?)(<w:p[ >][\s\S]*?<\/w:p>)/g,
    function(m, before, namePara) {
      // Check the name paragraph has text content (skip empty paragraphs)
      const txts = [];
      namePara.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txts.push(t); });
      const fullText = txts.join('').trim();
      if (!fullText) return m;
      // Skip paragraphs that look like the "Président" / "Gérant" role label, the underscore line,
      // OR the "Signature" label itself (otherwise "Fait à..." triggers border above "Signature").
      if (/^_+$/.test(fullText) || /^(Pr[ée]sident|G[ée]rant|Directeur|Signature)/i.test(fullText)) return m;
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
      if (/<w:ind\b/.test(newPara)) {
        newPara = newPara.replace(/<w:ind\b[^/]*\/>/, indent);
      } else {
        newPara = newPara.replace(/<w:pPr>/, '<w:pPr>' + indent);
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
        '<w:p><w:pPr><w:keepLines/><w:spacing w:before="240" w:after="240" w:line="312" w:lineRule="auto"/>' +
        '<w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>' +
        '<w:b w:val="0"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:pPr>' +
        '<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>' +
        '<w:b w:val="0"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>' +
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
    const dateNaiss = (cleanData.DATE_NAISSANCE_1 || cleanData.DATE_NAISSANCE || '').trim();
    const lieuNaiss = (cleanData.LIEU_NAISSANCE_1 || cleanData.LIEU_NAISSANCE || '').trim();
    const nationalite = (cleanData.NATIONALITE_1 || cleanData.NATIONALITE || '').trim();
    const nomPere = (cleanData.NOM_PERE_1 || cleanData.NOM_PERE || '').trim();
    const nomMere = (cleanData.NOM_MERE_1 || cleanData.NOM_MERE || '').trim();
    const nomJeune = (cleanData.NOM_JEUNE_FILLE || '').trim();
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

    let finalText;
    if (isAttestationDomicile) {
      // Attestation de domiciliation: include "agissant en qualité de Président..." and "déclare domicilier..."
      const parts = ['Je soussigné, ' + civNomPrenom + ','];
      if (dateNaiss) parts.push('né le ' + dateNaiss + (lieuNaiss ? ' à ' + lieuNaiss : '') + ',');
      if (nationalite) parts.push('de nationalité ' + nationalite + ',');
      if (adresse) parts.push('demeurant ' + adresse + ',');
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
      const parts = ['Je soussigné, ' + civNomPrenom + ','];
      if (dateNaiss) parts.push('né le ' + dateNaiss + (lieuNaiss ? ' à ' + lieuNaiss : '') + ',');
      if (nationalite) parts.push('de nationalité ' + nationalite + ',');
      if (nomPere || nomMere) {
        let parents = '';
        if (nomPere) parents += 'fils de ' + nomPere;
        if (nomPere && nomMere) parents += ' et de ';
        else if (nomMere) parents += 'fils de ';
        if (nomMere) {
          parents += nomMere;
          if (nomJeune) parents += ' née ' + nomJeune;
        }
        parts.push(parents);
      }
      if (adresse) parts.push('et demeurant ' + adresse + ',');
      finalText = parts.join(' ');
    }

    // Rewrite the Je soussigné paragraph (+ following intro paragraphs) into a single justified one.
    // We only consume following paragraphs that match intro keywords; stop at the first non-matching one.
    const introKeywords = isAttestationDomicile
      ? ['demeurant', 'né le', 'née le', 'à ', 'de nationalité', 'monsieur', 'madame', 'mademoiselle',
         'agissant', 'déclare domicilier', 'declare domicilier']
      : ['demeurant', 'né le', 'née le', 'à ', 'de nationalité', 'fils de', 'fille de', 'et de', 'née ', 'né ',
         'monsieur', 'madame', 'mademoiselle'];
    docXml = docXml.replace(
      /(<w:p[ >][^<]*(?:<(?!w:p[ >])[^<]*)*?<w:t[^>]*>Je soussigné[\s\S]*?<\/w:p>)((?:<w:p[ >][\s\S]*?<\/w:p>){0,12})/,
      function(_, soussignePara, followingParas) {
        // Build a fresh paragraph with our text, justified, not bold
        const newPara =
          '<w:p><w:pPr><w:keepLines/><w:spacing w:before="240" w:after="240" w:line="312" w:lineRule="auto"/>' +
          '<w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>' +
          '<w:b w:val="0"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:pPr>' +
          '<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>' +
          '<w:b w:val="0"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>' +
          '<w:t xml:space="preserve">' + fnEsc(finalText) + '</w:t></w:r></w:p>';
        // Walk through followingParas, consume those matching intro keywords.
        // SKIP empty paragraphs (residual Mustache control tags become empty after render)
        // so they don't break the chain.
        const paras = followingParas.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
        let consumed = 0;
        for (const fp of paras) {
          const textsArr = [];
          fp.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_m, t) { textsArr.push(t); });
          const fullText = textsArr.join('').trim().toLowerCase();
          if (!fullText) {
            // Empty paragraph (control tag remnant) → consume and continue
            consumed++;
            continue;
          }
          if (introKeywords.some(kw => fullText.startsWith(kw.toLowerCase()))) {
            consumed++;
          } else {
            break;
          }
        }
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
        // of t anywhere in m — including the space inside `<w:t xml:space="preserve">`).
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
      let q = p.replace(/<w:spacing\b[^/]*\/>/, '<w:spacing w:before="240" w:after="240" w:line="312" w:lineRule="auto"/>');
      // If no spacing existed, inject one
      if (q === p) {
        q = p.replace(/<w:pPr>/, '<w:pPr><w:spacing w:before="240" w:after="240" w:line="312" w:lineRule="auto"/>');
      }
      return q;
    }
    return p;
  });

  // Also remove single empty paragraphs that immediately precede article titles
  // (otherwise the empty para's line height stacks with the title's w:before, creating an extra gap).
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
  // Also strip TRAILING <w:br/> (right before </w:r>) from body paragraphs that immediately
  // follow article titles. We must NOT touch <w:br/> between two <w:t> (legitimate line break).
  docXml = docXml.replace(
    /(<w:p[ >][\s\S]*?<w:t[^>]*>(?:ARTICLE|TITRE|ANNEXE)[^<]*<\/w:t>[\s\S]*?<\/w:p>)(<w:p[ >][\s\S]*?<\/w:p>)/g,
    function(_, title, body) {
      return title + body.replace(/<w:br\b[^/]*\/>(\s*<\/w:r>)/g, '$1');
    }
  );
  doc.getZip().file("word/document.xml", docXml);

  // Bump default font size 11pt → 13pt and line spacing to 312 (1.3x) for readability
  const stylesFile = doc.getZip().file("word/styles.xml");
  if (stylesFile) {
    let stylesXml = stylesFile.asText();
    stylesXml = stylesXml.replace(
      /(<w:rPrDefault>[\s\S]*?<\/w:rPrDefault>)/,
      function(block) {
        return block
          .replace(/<w:sz w:val="22"\/>/g, '<w:sz w:val="26"/>')
          .replace(/<w:szCs w:val="22"\/>/g, '<w:szCs w:val="26"/>');
      }
    );
    // Normalize pPrDefault: line=312 (1.3x) and w:after=0 so paragraphs without their own
    // <w:spacing> don't inherit a large gap.
    stylesXml = stylesXml.replace(
      /(<w:pPrDefault>[\s\S]*?<\/w:pPrDefault>)/,
      function(block) {
        return block.replace(/<w:spacing\b[^/]*\/>/,
          '<w:spacing w:after="0" w:line="312" w:lineRule="auto"/>'
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
      if (!/<w:numPr\b/.test(result)) {
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
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
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
  docXml = docXml.replace(
    /(Nombre d['’]actions souscrites\s*:\s*\d+)(?!\s*actions)/g,
    '$1 actions'
  );
  // Remove "- Reste à libérer : 0 euros" line (nothing left to release → useless line)
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txt = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
    const full = txt.join('').trim();
    if (/^-\s*Reste à libérer\s*:\s*0\s*euros?\s*\.?$/i.test(full)) return '';
    return p;
  });
  // Remove the legacy signature underline (paragraph containing only "____...") OR
  // an empty paragraph with a bottom-border — both are redundant now that we draw the line
  // ABOVE the bold name paragraph.
  docXml = docXml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function(p) {
    const txt = [];
    p.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, function(_, t) { txt.push(t); });
    const full = txt.join('').trim();
    // Pure underscores line
    if (/^_+$/.test(full) && full.length >= 5) return '';
    // Empty paragraph with bottom border (signature underline placeholder)
    if (!full && /<w:pBdr\b[\s\S]*?<w:bottom\b/.test(p)) return '';
    return p;
  });
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

  // LibreOffice fallback: inject <w:sz w:val="26"/> in every <w:rPr> that lacks one
  // and bump any "small" sizes (between 4 and 25 = 2-12pt) → 13pt (sz=26) for body-text consistency.
  // We keep <w:sz w:val="2"/> (hidden markers) and 28+ (titles) as-is.
  docXml = doc.getZip().file("word/document.xml").asText();
  docXml = docXml.replace(/<w:sz w:val="(\d+)"\s*\/>/g, function(m, v) {
    const n = parseInt(v);
    return (n >= 4 && n <= 25) ? '<w:sz w:val="26"/>' : m;
  });
  docXml = docXml.replace(/<w:szCs w:val="(\d+)"\s*\/>/g, function(m, v) {
    const n = parseInt(v);
    return (n >= 4 && n <= 25) ? '<w:szCs w:val="26"/>' : m;
  });
  docXml = docXml.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, function(m, inner) {
    if (/<w:sz\b/.test(inner)) return m; // already has a size
    return '<w:rPr>' + inner + '<w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr>';
  });
  doc.getZip().file("word/document.xml", docXml);

  return doc.getZip().generate({ type: "nodebuffer" });
}

function generateDocx(templateName, data) {
  const buf = loadTemplate(templateName);
  return generateDocxFromBuffer(buf, data);
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

module.exports = { templateCache, loadTemplate, loadAllTemplates, generateDocx, generateDocxFromBuffer, injectSignature };
