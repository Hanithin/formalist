/**
 * vivibot.js — VIVIBOT: Audit & fix DOCX template formatting
 *
 * Rules:
 * 1. keepNext on ALL article titles (ARTICLE X - ...) → never orphaned at page bottom
 * 2. keepNext on ALL sub-section titles (8.1, I - Nomination, Durée, RÉSOLUTION, DÉCISION, etc.)
 * 3. keepNext chain: empty paragraphs between title and content also get keepNext
 * 4. Consistent spacing: article titles before=360 after=120, sub-titles before=200-240 after=80
 * 5. Content paragraphs: after=120 line=276
 * 6. Collapse empty paragraphs (zero-height) in article area — no visual gaps
 * 7. Page break before ETAT DES ACTES / annexes
 * 8. LES SOUSSIGNÉES / ONT ÉTABLI: proper spacing
 * 9. No title ever isolated at bottom of page without its content
 * 10. ALL documents: any bold+underline title gets keepNext (PV, actes, etc.)
 * 11. ALL documents: any bold section header followed by content gets keepNext
 * 12. Conjoint/short docs: add default line spacing if missing
 * 13. RÉSOLUTION UNIQUE: when only 1 resolution exists, use "RÉSOLUTION UNIQUE" (post-render in docx.js)
 * 14. Ordre du jour titles (Nomination de la gérance/présidence): centered + spaced (before=360 after=360)
 * 15. Signature area: underscore lines get before=480, "Signature des associés" gets before=240 after=240
 */

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");

// --- Helpers ---

function getTexts(p) {
  const texts = [];
  p.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (m, t) => texts.push(t));
  return texts.join("");
}

function isBold(p) {
  return p.includes('<w:b w:val="1"') || p.includes("<w:b/>");
}

function isUnderline(p) {
  return p.includes("<w:u ");
}

function hasKeepNext(p) {
  return p.includes("<w:keepNext");
}

function hasPPr(p) {
  return p.includes("<w:pPr>");
}

function hasSpacing(p) {
  return /<w:spacing[^/]*\/>/.test(p);
}

function hasPageBreak(p) {
  return p.includes('type="page"') || p.includes("<w:pageBreakBefore");
}

function ensurePPr(p) {
  if (hasPPr(p)) return p;
  // Insert <w:pPr></w:pPr> after <w:p...>
  return p.replace(/(<w:p[^>]*>)/, "$1<w:pPr></w:pPr>");
}

function addKeepNext(p) {
  if (hasKeepNext(p)) return p;
  p = ensurePPr(p);
  return p.replace("<w:pPr>", "<w:pPr><w:keepNext/>");
}

function setSpacing(p, before, after, line) {
  const tag =
    '<w:spacing w:before="' + before + '" w:after="' + after +
    '" w:line="' + line + '" w:lineRule="auto"/>';
  p = ensurePPr(p);
  if (hasSpacing(p)) return p.replace(/<w:spacing[^/]*\/>/, tag);
  return p.replace("<w:pPr>", "<w:pPr>" + tag);
}

function addSpacingIfMissing(p, before, after, line) {
  if (hasSpacing(p)) return p;
  p = ensurePPr(p);
  const tag =
    '<w:spacing w:before="' + before + '" w:after="' + after +
    '" w:line="' + line + '" w:lineRule="auto"/>';
  return p.replace("<w:pPr>", "<w:pPr>" + tag);
}

function setZeroHeight(p) {
  const zeroSpacing = '<w:spacing w:before="0" w:after="0" w:line="0" w:lineRule="auto"/>';
  p = ensurePPr(p);
  if (p.includes("<w:spacing")) {
    p = p.replace(/<w:spacing[^/]*\/>/, zeroSpacing);
  } else {
    p = p.replace("<w:pPr>", "<w:pPr>" + zeroSpacing);
  }
  return p;
}

function setCenter(p) {
  if (p.includes('<w:jc w:val="center"')) return p;
  p = ensurePPr(p);
  return p.replace("<w:pPr>", '<w:pPr><w:jc w:val="center"/>');
}

function isOdjTitle(text, bold) {
  // Ordre du jour titles: "Nomination de la gérance", "Nomination de la présidence", etc.
  return bold && text.length < 100 && (
    /^Nomination de la (g[ée]rance|pr[ée]sidence|direction)/i.test(text) ||
    /^Transfert d[ue] si[eè]ge/i.test(text) ||
    /^Changement de d[ée]nomination/i.test(text) ||
    /^Modification de l.objet/i.test(text) ||
    /^Augmentation d[ue] capital/i.test(text) ||
    /^R[ée]duction d[ue] capital/i.test(text) ||
    /^Cession de parts/i.test(text) ||
    /^Prorogation/i.test(text)
  );
}

function addPageBreakBefore(p) {
  if (hasPageBreak(p)) return p;
  p = ensurePPr(p);
  return p.replace("<w:pPr>", "<w:pPr><w:pageBreakBefore/>");
}

// --- Title detection patterns ---

function isArticleTitle(text, bold, underline) {
  return /^ARTICLE\s*\d+/.test(text) && (bold || underline);
}

function isResolutionTitle(text, bold, underline) {
  return (bold || underline) && (
    /^R[ÉE]SOLUTION/i.test(text) ||
    /^D[ÉE]CISION/i.test(text) ||
    /^PROC[ÈE]S-VERBAL/i.test(text) ||
    /^ASSEMBL[ÉE]E/i.test(text)
  );
}

function isDocumentMainTitle(text, bold, underline) {
  return (bold || underline) && (
    /^ACTE DE CESSION/.test(text) ||
    /^ATTESTATION/.test(text) ||
    /^D[ÉE]CLARATION/.test(text) ||
    /^LISTE DES SOUSCRIPTEURS/.test(text) ||
    /^INTERVENTION/.test(text) ||
    /^MISE [ÀA] DISPOSITION/.test(text) ||
    /^ETAT DES ACTES/.test(text) ||
    /^IL A [ÉE]T[ÉE] CONVENU/.test(text) ||
    /^ENTRE LES SOUSSIGN/.test(text) ||
    /^LES SOUSSIGN/.test(text)
  );
}

function isSectionHeader(text, bold) {
  // Bold headers that introduce a section (should stay with next paragraph)
  return bold && text.length < 120 && (
    /^(Le C[ée]dant|Le Cessionnaire|Sont pr[ée]sents|EN DATE DU)/i.test(text) ||
    /^(Je soussign|Nature des apports|Lib[ée]ration|Capital total|Signatures)/i.test(text) ||
    /^RÉSOLUTION N/i.test(text) ||
    /^(d[ée]clare domicilier|d[ée]clare accepter)/i.test(text) ||
    /^Article \d+/i.test(text)
  );
}

function isSubSectionTitle(text, bold, underline, firstArticleIdx, i) {
  if (firstArticleIdx === -1) return false;
  if (i <= firstArticleIdx) return false;
  // Bold-only numbered sub-sections (8.1Forme, etc.)
  if (bold && !underline && /^\d+\.\d+/.test(text)) return true;
  // Underline-only sub-sections (Durée, I - Nomination, etc.)
  if (underline && text.length < 80 && (
    /^(I|II|III|IV|V|VI|VII|VIII|IX|X)\s*[-–]\s/.test(text) ||
    /^(Dur|Prorog|Dissolut|Nominat|D[eé]mission|R[eé]vocation|Publicit|Pouvoirs|Retrait|Transmission|Liquid|Revendic)/i.test(text) ||
    /^En cas de pluralit/i.test(text)
  )) return true;
  return false;
}

/**
 * Apply VIVIBOT rules to a DOCX buffer.
 * Returns { buffer, stats }.
 */
function auditBuffer(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  let xml = zip.file("word/document.xml").asText();
  const parts = xml.split("</w:p>");

  const stats = { titles: 0, sub: 0, content: 0, collapsed: 0, pageBreaks: 0 };
  let firstArticleIdx = -1;
  let signatureAreaIdx = parts.length - 1;
  let hasArticles = false;

  // --- Find boundaries ---
  for (let i = 0; i < parts.length; i++) {
    const text = getTexts(parts[i]).trim();
    if (/^ARTICLE\s*1\b/.test(text) && firstArticleIdx === -1) {
      firstArticleIdx = i;
      hasArticles = true;
    }
    if (
      text.includes("DATE_SIGNATURE") ||
      text.includes("VILLE_SIGNATURE") ||
      text.includes("Fait à") ||
      text.includes("Fait le") ||
      text.includes("Fait en")
    ) {
      signatureAreaIdx = i;
    }
  }

  // For non-article documents, treat the whole document
  const contentStart = hasArticles ? firstArticleIdx : 0;

  // --- Pass 1: Titles & spacing ---
  let inTitreBlock = false; // tracks "TITRE I/II/..." + ALL-CAPS subtitles
  for (let i = 0; i < parts.length; i++) {
    const text = getTexts(parts[i]).trim();
    if (text.length === 0) continue;
    const bold = isBold(parts[i]);
    const underline = isUnderline(parts[i]);

    // Rule 7: ETAT DES ACTES → page break
    if (text === "ETAT DES ACTES" && bold) {
      inTitreBlock = false;
      parts[i] = addKeepNext(parts[i]);
      parts[i] = addPageBreakBefore(parts[i]);
      parts[i] = setSpacing(parts[i], "360", "120", "276");
      stats.pageBreaks++;
      continue;
    }

    // Rule 19: TITRE I/II/III/... section openers (statuts) — keepNext + glue subtitles
    if (bold && /^TITRE\s+[IVX]+\b/.test(text)) {
      const hadPageBreakBefore = hasPageBreak(parts[i]);
      parts[i] = addKeepNext(parts[i]);
      parts[i] = setSpacing(parts[i], "480", "120", "276");
      // LibreOffice ignore pageBreakBefore quand précédé d'empties keepNext.
      // On le remplace par un hard break inline (toujours respecté).
      if (hadPageBreakBefore) {
        parts[i] = parts[i].replace(/<w:pageBreakBefore\s*\/>/g, "");
        // Insère un run avec page break tout en haut, juste après </w:pPr>
        parts[i] = parts[i].replace(
          /(<\/w:pPr>)/,
          '$1<w:r><w:br w:type="page"/></w:r>'
        );
      }
      inTitreBlock = true;
      stats.titles++;
      continue;
    }
    // While inside a TITRE block, glue every following bold ALL-CAPS subtitle
    // until we hit an ARTICLE or non-bold paragraph
    if (inTitreBlock && bold && !/^ARTICLE\s*\d/.test(text) && text.length < 200) {
      parts[i] = addKeepNext(parts[i]);
      if (!hasSpacing(parts[i])) {
        parts[i] = setSpacing(parts[i], "0", "120", "276");
      }
      stats.titles++;
      continue;
    }
    // Anything else exits the titre block
    inTitreBlock = false;

    // Rule 1: Article titles (ARTICLE X - ...)
    if (isArticleTitle(text, bold, underline)) {
      parts[i] = addKeepNext(parts[i]);
      parts[i] = setSpacing(parts[i], "360", "120", "276");
      stats.titles++;
      continue;
    }

    // Rule 8: LES SOUSSIGNÉES / ONT ÉTABLI
    if (text.includes("LES SOUSSIGN") && bold) {
      parts[i] = addKeepNext(parts[i]);
      parts[i] = setSpacing(parts[i], "300", "200", "276");
      stats.titles++;
      continue;
    }
    if (/^ONT\s/.test(text) && bold) {
      parts[i] = setSpacing(parts[i], "400", "200", "276");
      stats.titles++;
      continue;
    }

    // Rule 10: RÉSOLUTION / DÉCISION / PROCÈS-VERBAL titles (PV documents)
    if (isResolutionTitle(text, bold, underline)) {
      parts[i] = addKeepNext(parts[i]);
      if (!hasSpacing(parts[i])) {
        parts[i] = setSpacing(parts[i], "300", "120", "276");
      }
      stats.titles++;
      continue;
    }

    // Rule 10: Document main titles (ACTE DE CESSION, ATTESTATION, etc.)
    if (isDocumentMainTitle(text, bold, underline)) {
      parts[i] = addKeepNext(parts[i]);
      if (!hasSpacing(parts[i])) {
        parts[i] = setSpacing(parts[i], "0", "240", "276");
      }
      stats.titles++;
      continue;
    }

    // Rule 2: Sub-section titles (statuts only)
    if (isSubSectionTitle(text, bold, underline, firstArticleIdx, i)) {
      parts[i] = addKeepNext(parts[i]);
      if (bold && !underline) {
        parts[i] = setSpacing(parts[i], "240", "80", "276");
      } else {
        parts[i] = setSpacing(parts[i], "200", "80", "276");
      }
      stats.sub++;
      continue;
    }

    // Rule 14: Ordre du jour titles (Nomination de la gérance, etc.) — centered + spaced
    if (isOdjTitle(text, bold)) {
      parts[i] = addKeepNext(parts[i]);
      parts[i] = setSpacing(parts[i], "360", "360", "276");
      parts[i] = setCenter(parts[i]);
      stats.titles++;
      continue;
    }

    // Rule 11: Bold section headers (Sont présents, Le Cédant, etc.)
    if (isSectionHeader(text, bold)) {
      parts[i] = addKeepNext(parts[i]);
      if (!hasSpacing(parts[i])) {
        parts[i] = setSpacing(parts[i], "0", "120", "276");
      }
      stats.sub++;
      continue;
    }

    // Rule 5/12: Content paragraphs — consistent spacing
    if (
      i >= contentStart &&
      i < signatureAreaIdx &&
      !bold && !underline &&
      text.length > 15 &&
      !text.startsWith("{{") &&
      !text.startsWith("{#") &&
      !text.startsWith("{/") &&
      !text.startsWith("{^")
    ) {
      parts[i] = addSpacingIfMissing(parts[i], "0", "120", "276");
      stats.content++;
    }
  }

  // --- Pass 2: Collapse empty paragraphs (statuts only — they have bloated empty paras) ---
  if (hasArticles) {
    const collapseStart = Math.max(firstArticleIdx - 3, 0);
    for (let i = collapseStart; i < signatureAreaIdx && i < parts.length; i++) {
      const text = getTexts(parts[i]).trim();
      if (text.length === 0 && !hasPageBreak(parts[i])) {
        parts[i] = setZeroHeight(parts[i]);
        stats.collapsed++;
      }
    }
  }

  // --- Pass 3: keepNext chain on ALL zero-height empty paragraphs ---
  for (let i = 0; i < parts.length; i++) {
    const text = getTexts(parts[i]).trim();
    if (text.length === 0 && parts[i].includes('w:line="0"') && !hasKeepNext(parts[i])) {
      if (hasPPr(parts[i])) {
        parts[i] = parts[i].replace("<w:pPr>", "<w:pPr><w:keepNext/>");
        stats.collapsed++;
      }
    }
  }

  // --- Pass 4: Signature area spacing (Rule 15) ---
  for (let i = 0; i < parts.length; i++) {
    const text = getTexts(parts[i]).trim();
    // Underscore signature lines — breathing room before each
    if (/^_{5,}/.test(text) && hasSpacing(parts[i])) {
      parts[i] = setSpacing(parts[i], "480", "0", "276");
    }
    // "Signature des associés" label
    if (/^Signature des associ/i.test(text) && hasSpacing(parts[i])) {
      parts[i] = setSpacing(parts[i], "240", "240", "276");
    }
  }

  xml = parts.join("</w:p>");
  zip.file("word/document.xml", xml);
  return { buffer: zip.generate({ type: "nodebuffer" }), stats };
}

/**
 * Apply VIVIBOT to a template file on disk.
 */
function auditTemplate(templateName) {
  const filePath = path.join(TEMPLATES, templateName);
  const buf = fs.readFileSync(filePath);
  const result = auditBuffer(buf);
  fs.writeFileSync(filePath, result.buffer);
  return result.stats;
}

/**
 * Apply VIVIBOT to ALL .docx templates.
 */
function auditAll() {
  const templates = fs.readdirSync(TEMPLATES).filter(f => f.endsWith(".docx"));
  const results = {};
  for (const t of templates) {
    try {
      results[t] = auditTemplate(t);
    } catch (e) {
      results[t] = { error: e.message };
    }
  }
  return results;
}

module.exports = { auditBuffer, auditTemplate, auditAll };
