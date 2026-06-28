const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

var srcPath = path.join(__dirname, '..', '..', 'Downloads', '1 - Statuts et Etat des actes SARL Formalist.docx');
var outDir = path.join(__dirname, '..', 'templates');

// ── Shared utilities ─────────────────────────────────────────

function mergeRunsWithSplitTags(xmlStr) {
  var changed = true;
  var iterations = 0;
  while (changed && iterations < 50) {
    changed = false;
    iterations++;
    xmlStr = xmlStr.replace(
      /(<w:t[^>]*>)([^<]*\{\{[^}<]*)(<\/w:t><\/w:r>\s*<w:r>(?:<w:rPr>[^]*?<\/w:rPr>)?<w:t[^>]*>)([^<]*)/g,
      function(match, openTag, text1, middle, text2) {
        var opens = (text1.match(/\{\{/g) || []).length;
        var closes = (text1.match(/\}\}/g) || []).length;
        if (opens > closes) {
          changed = true;
          return openTag + text1 + text2;
        }
        return match;
      }
    );
  }
  return xmlStr;
}

function findPlaceholders(xml) {
  var placeholders = xml.match(/\{\{[^}]+\}\}/g);
  if (!placeholders) return [];
  return [...new Set(placeholders)].sort();
}

function verifyAndSave(zip, xml, outPath, label) {
  zip.file('word/document.xml', xml);
  fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
  console.log('\n=== ' + label + ' ===');
  console.log('Saved to', outPath);

  var buf2 = fs.readFileSync(outPath);
  var zip2 = new PizZip(buf2);
  var xml2 = zip2.file('word/document.xml').asText();
  var phs = findPlaceholders(xml2);
  console.log('Placeholders found: ' + phs.length);
  phs.forEach(function(p) { console.log('  ' + p); });

  var broken = xml2.match(/\{\{[A-Z_0-9]+\}(?!\})/g);
  if (broken && broken.length > 0) {
    console.log('WARNING: Broken placeholders: ' + broken.join(', '));
  }
  return xml2;
}

// Paragraph builder helpers
var FONT = 'Cambria';
var rPr = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:rtl w:val="0"/></w:rPr>';
var rPrBold = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:rtl w:val="0"/></w:rPr>';
var rPrSmall = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="0"/></w:rPr>';
var rPrTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl w:val="0"/></w:rPr>';
var rPrSubtitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="0"/></w:rPr>';
var rPrSectionTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:caps/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rtl w:val="0"/></w:rPr>';
var rPrBoldUnderline = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:u w:val="single"/><w:rtl w:val="0"/></w:rPr>';
var hiddenPPr = '<w:pPr><w:spacing w:before="0" w:after="0" w:line="0" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:sz w:val="2"/></w:rPr></w:pPr>';

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function run(text, runProps) {
  runProps = runProps || rPr;
  return '<w:r>' + runProps + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
}

function para(opts) {
  var pPr = '<w:pPr>';
  var before = opts.before != null ? opts.before : 0;
  var after = opts.after != null ? opts.after : 40;
  var line = opts.line != null ? opts.line : 276;
  pPr += '<w:spacing w:before="' + before + '" w:after="' + after + '" w:line="' + line + '" w:lineRule="auto"/>';
  if (opts.center) pPr += '<w:jc w:val="center"/>';
  if (opts.both) pPr += '<w:jc w:val="both"/>';
  if (opts.pageBreakBefore) pPr += '<w:pageBreakBefore/>';
  if (opts.keepNext) pPr += '<w:keepNext/>';
  pPr += '</w:pPr>';
  return '<w:p>' + pPr + (opts.runs || '') + '</w:p>';
}

function p(text, runProps, opts) {
  opts = opts || {};
  opts.runs = run(text, runProps);
  return para(opts);
}

function tag(text) {
  return '<w:p>' + hiddenPPr + run(text, rPr) + '</w:p>';
}

function findParagraphContaining(xml, searchText, startFrom) {
  startFrom = startFrom || 0;
  var idx = xml.indexOf(searchText, startFrom);
  if (idx < 0) return null;
  var pStart = idx;
  while (pStart > 0) {
    if (xml[pStart] === '<' && xml.substring(pStart, pStart + 4) === '<w:p' && xml[pStart + 4] !== 'P' && xml[pStart + 4] !== 'r') break;
    pStart--;
  }
  var pEnd = xml.indexOf('</w:p>', idx) + '</w:p>'.length;
  return { start: pStart, end: pEnd };
}

// Article title helper with keepNext for VIVIBOT compliance
function articleTitle(text, opts) {
  opts = opts || {};
  return p(text, rPrBoldUnderline, { before: opts.before || 360, after: opts.after || 120, both: true, keepNext: true });
}

// Content paragraph with standard spacing
function content(text, opts) {
  opts = opts || {};
  return p(text, rPr, { before: opts.before || 0, after: opts.after || 120, both: true });
}

// Section title (TITRE I, II, etc.)
function sectionTitle(text, opts) {
  opts = opts || {};
  return p(text, rPrSectionTitle, { center: true, before: opts.before || 480, after: opts.after || 120, keepNext: true });
}


// ════════════════════════════════════════════════════════════
// FILE 1: SARL STATUTS
// ════════════════════════════════════════════════════════════
(function buildStatuts() {
  console.log('\n########################################');
  console.log('# Processing: SARL Statuts');
  console.log('########################################');

  var buf = fs.readFileSync(srcPath);
  var zip = new PizZip(buf);
  var origXml = zip.file('word/document.xml').asText();

  var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
  var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

  var body = '';

  // ─── PAGE DE GARDE (structure identique SCI : vides avec sz=22 pour remplir) ───
  var rPrEmpty22 = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl w:val="0"/></w:rPr>';
  var rPrCoverName = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b w:val="1"/><w:rtl w:val="0"/></w:rPr>';
  // P0: empty paragraph (no spacing, like SCI)
  body += '<w:p><w:pPr><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b w:val="1"/></w:rPr></w:pPr><w:r><w:rPr><w:rtl w:val="0"/></w:rPr></w:r></w:p>';
  // P1: Company info centered — single paragraph with <w:br/> line breaks (exactly like SCI)
  var F = '<w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/>';
  var br = '<w:br w:type="textWrapping"/>';
  body += '<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr>' +
    F + '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>' +
    // NOM_SOCIETE in bold sz=36
    '<w:r><w:rPr>' + F + '<w:b w:val="1"/><w:sz w:val="36"/><w:szCs w:val="36"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">{{NOM_SOCIETE}}</w:t></w:r>' +
    // Two line breaks + forme label
    '<w:r><w:rPr>' + F + '<w:sz w:val="22"/><w:szCs w:val="22"/><w:rtl w:val="0"/></w:rPr>' +
    br + br + '<w:t xml:space="preserve">{{FORME_LABEL}} au capital de {{CAPITAL}} euros</w:t>' +
    // Two line breaks + siège
    br + br + '<w:t xml:space="preserve">Si\u00e8ge social : {{ADRESSE_SIEGE}}</w:t>' +
    br + br + '</w:r></w:p>';
  // P2-P10: 9 empty paragraphs (sz=22, after=200, line=276) to push title down
  for (var ei = 0; ei < 9; ei++) {
    body += '<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:rPr>' +
      '<w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr><w:r><w:rPr><w:rtl w:val="0"/></w:rPr></w:r></w:p>';
  }
  // P11: STATUTS CONSTITUTIFS (centered, bold, sz=36)
  var rPrStatutsTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b w:val="1"/><w:sz w:val="36"/><w:szCs w:val="36"/><w:rtl w:val="0"/></w:rPr>';
  body += '<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/><w:rPr>' +
    '<w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/>' +
    '<w:b w:val="1"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:pPr>' +
    run('STATUTS CONSTITUTIFS', rPrStatutsTitle) + '</w:p>';
  // P12-P21: 10 empty paragraphs to fill rest of page 1
  for (var ei2 = 0; ei2 < 10; ei2++) {
    body += '<w:p><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:rPr>' +
      '<w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/>' +
      '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr><w:r><w:rPr><w:rtl w:val="0"/></w:rPr></w:r></w:p>';
  }

  // ─── PAGE 2 : SOUSSIGNÉS (bold+souligné comme SCI, keepNext, before=300, after=200) ───
  body += tag('{{#IS_UNIPERSONNELLE}}');
  body += p('L\u2019ASSOCI\u00c9 UNIQUE SOUSSIGN\u00c9 :', rPrBoldUnderline, { before: 300, after: 200, keepNext: true, pageBreakBefore: true });
  body += tag('{{/IS_UNIPERSONNELLE}}');
  body += tag('{{#IS_PLURIPERSONNELLE}}');
  body += p('LES ASSOCI\u00c9S SOUSSIGN\u00c9S :', rPrBoldUnderline, { before: 300, after: 200, keepNext: true, pageBreakBefore: true });
  body += tag('{{/IS_PLURIPERSONNELLE}}');
  // Empty bold paragraph (like SCI P23)
  body += '<w:p><w:pPr><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b w:val="1"/></w:rPr></w:pPr><w:r><w:rPr><w:rtl w:val="0"/></w:rPr></w:r></w:p>';

  // Per-associate identity (up to 10)
  for (var n = 1; n <= 10; n++) {
    var spaceBefore = n === 1 ? '0' : '200';
    var aPPr = '<w:pPr><w:spacing w:before="' + spaceBefore + '" w:after="0" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>';

    body += tag('{{#HAS_ASSOC_' + n + '}}');

    // Personne morale
    body += tag('{{#ASSOC_' + n + '_EST_MORALE}}');
    body += '<w:p>' + aPPr + run('{{ASSOC_' + n + '_SOCIETE_NOM}}, {{ASSOC_' + n + '_SOCIETE_FORME}} au capital de {{ASSOC_' + n + '_SOCIETE_CAPITAL}} euros, dont le si\u00e8ge social est situ\u00e9 {{ASSOC_' + n + '_SOCIETE_ADRESSE}}, immatricul\u00e9e au registre du commerce et des soci\u00e9t\u00e9s de {{ASSOC_' + n + '_SOCIETE_RCS_VILLE}} sous le num\u00e9ro {{ASSOC_' + n + '_SOCIETE_SIREN}}, repr\u00e9sent\u00e9e par son dirigeant, {{ASSOC_' + n + '_SOCIETE_REP}}, d\u00fbment habilit\u00e9.', rPr) + '</w:p>';
    body += tag('{{/ASSOC_' + n + '_EST_MORALE}}');

    // Personne physique
    body += tag('{{#ASSOC_' + n + '_EST_PHYSIQUE}}');
    body += tag('{{#EST_HOMME_' + n + '}}');
    body += '<w:p>' + aPPr + run('{{CIVILITE_NOM_PRENOM_' + n + '}}, n\u00e9 le {{DATE_NAISSANCE_' + n + '}} \u00e0 {{LIEU_NAISSANCE_' + n + '}}, de nationalit\u00e9 {{NATIONALITE_' + n + '}}, {{SITUATION_MATRIMONIALE_' + n + '}}, demeurant {{ADRESSE_ASSOCIE_' + n + '}}.', rPr) + '</w:p>';
    body += tag('{{/EST_HOMME_' + n + '}}');
    body += tag('{{#EST_FEMME_' + n + '}}');
    body += '<w:p>' + aPPr + run('{{CIVILITE_NOM_PRENOM_' + n + '}}, n\u00e9e le {{DATE_NAISSANCE_' + n + '}} \u00e0 {{LIEU_NAISSANCE_' + n + '}}, de nationalit\u00e9 {{NATIONALITE_' + n + '}}, {{SITUATION_MATRIMONIALE_' + n + '}}, demeurant {{ADRESSE_ASSOCIE_' + n + '}}.', rPr) + '</w:p>';
    body += tag('{{/EST_FEMME_' + n + '}}');
    body += tag('{{/ASSOC_' + n + '_EST_PHYSIQUE}}');

    body += tag('{{/HAS_ASSOC_' + n + '}}');
  }

  // ONT ÉTABLI (structure SCI — before=400, after=200)
  body += tag('{{#IS_UNIPERSONNELLE}}');
  body += p('A \u00c9TABLI, AINSI QU\u2019IL SUIT, LES STATUTS D\u2019UNE SOCI\u00c9T\u00c9 \u00c0 RESPONSABILIT\u00c9 LIMIT\u00c9E QU\u2019IL A D\u00c9CID\u00c9 DE CONSTITUER :', rPrBold, { before: 400, after: 200, both: true });
  body += tag('{{/IS_UNIPERSONNELLE}}');
  body += tag('{{#IS_PLURIPERSONNELLE}}');
  body += p('ONT \u00c9TABLI, AINSI QU\u2019IL SUIT, LES STATUTS D\u2019UNE SOCI\u00c9T\u00c9 \u00c0 RESPONSABILIT\u00c9 LIMIT\u00c9E QU\u2019ILS ONT D\u00c9CID\u00c9 DE CONSTITUER :', rPrBold, { before: 400, after: 200, both: true });
  body += tag('{{/IS_PLURIPERSONNELLE}}');

  // ─── PAGE 3 : SUB-HEADER (saut de page, puis no-spacing centré comme SCI P105-P110) ───
  body += p('{{NOM_SOCIETE}}', rPrBold, { center: true, before: 0, after: 0, line: 240, pageBreakBefore: true });
  body += p('{{FORME_LABEL}} au capital de {{CAPITAL}} euros', rPr, { center: true, before: 0, after: 0, line: 240 });
  body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPr, { center: true, before: 0, after: 0, line: 240 });
  // Empty keepNext paragraphs (like SCI P108-P110 — transition before articles)
  for (var ek = 0; ek < 3; ek++) {
    body += para({ before: 0, after: 0, line: 0, center: true, keepNext: true });
  }

  // ════════════════════════════════════════════════════════════
  // TITRE I — FORME - DÉNOMINATION - SIÈGE - OBJET – DURÉE
  // ════════════════════════════════════════════════════════════
  body += sectionTitle('TITRE I');
  body += p('FORME - D\u00c9NOMINATION - SI\u00c8GE - OBJET \u2013 DUR\u00c9E', rPrBold, { center: true, before: 0, after: 240 });

  // Art 1 - Forme
  body += articleTitle('ARTICLE 1 - Forme');
  body += content('Il est form\u00e9, aux termes des pr\u00e9sents statuts, une soci\u00e9t\u00e9 \u00e0 responsabilit\u00e9 limit\u00e9e r\u00e9gie par les lois et r\u00e8glements en vigueur, notamment par les dispositions du Code de commerce, ainsi que par les pr\u00e9sents statuts (ci-apr\u00e8s la \u00ab Soci\u00e9t\u00e9 \u00bb).');
  body += content('Elle fonctionne indiff\u00e9remment sous la m\u00eame forme sociale, qu\u2019elle compte un ou plusieurs associ\u00e9s. En cas d\u2019associ\u00e9 unique, les pr\u00e9rogatives revenant aux associ\u00e9s aux termes des pr\u00e9sents statuts, sont exerc\u00e9es par l\u2019associ\u00e9 unique.');

  // Art 2 - Dénomination
  body += articleTitle('ARTICLE 2 - D\u00e9nomination sociale');
  body += content('La Soci\u00e9t\u00e9 a pour d\u00e9nomination sociale :');
  body += p('\u00ab {{NOM_SOCIETE}} \u00bb', rPrBold, { center: true, before: 0, after: 120 });
  body += content('Dans tous les actes et documents \u00e9manant de la soci\u00e9t\u00e9 et destin\u00e9s aux tiers, la d\u00e9nomination devra \u00eatre pr\u00e9c\u00e9d\u00e9e ou suivie imm\u00e9diatement des mots \u00ab soci\u00e9t\u00e9 \u00e0 responsabilit\u00e9 limit\u00e9e \u00bb ou des initiales \u00ab SARL \u00bb, du montant du capital social, ainsi que de l\u2019indication du lieu du si\u00e8ge social et du num\u00e9ro d\u2019immatriculation au Registre du Commerce et des Soci\u00e9t\u00e9s.');

  // Art 3 - Siège
  body += articleTitle('ARTICLE 3 - Si\u00e8ge social');
  body += content('Le si\u00e8ge social est fix\u00e9 : {{ADRESSE_SIEGE}}.');
  body += content('Il peut \u00eatre transf\u00e9r\u00e9 en tout autre lieu sur d\u00e9cision de la g\u00e9rance, sous r\u00e9serve de ratification par d\u00e9cision des associ\u00e9s repr\u00e9sentant plus de la moiti\u00e9 des parts sociales, conform\u00e9ment aux dispositions l\u00e9gales.');

  // Art 4 - Objet social
  body += articleTitle('ARTICLE 4 \u2013 Objet social');
  body += content('La Soci\u00e9t\u00e9 a pour objet en France et dans tous autres pays :');
  body += tag('{{#OBJET_SOCIAL_1}}');
  body += content('{{OBJET_SOCIAL_1}}');
  body += tag('{{/OBJET_SOCIAL_1}}');
  body += tag('{{#OBJET_SOCIAL_2}}');
  body += content('{{OBJET_SOCIAL_2}}');
  body += tag('{{/OBJET_SOCIAL_2}}');
  body += tag('{{#OBJET_SOCIAL_3}}');
  body += content('{{OBJET_SOCIAL_3}}');
  body += tag('{{/OBJET_SOCIAL_3}}');
  body += content('et, g\u00e9n\u00e9ralement, toutes op\u00e9rations financi\u00e8res, commerciales, industrielles, mobili\u00e8res ou immobili\u00e8res se rattachant directement ou indirectement \u00e0 l\u2019objet ci-dessus ou \u00e0 tous objets similaires ou connexes, ou susceptibles d\u2019en faciliter l\u2019application et le d\u00e9veloppement ou de le rendre plus r\u00e9mun\u00e9rateur.');

  // Art 5 - Durée
  body += articleTitle('ARTICLE 5 - Dur\u00e9e');
  body += content('La Soci\u00e9t\u00e9, sauf prorogation ou dissolution anticip\u00e9e, a une dur\u00e9e de {{DUREE}} ans qui commencera \u00e0 courir \u00e0 compter du jour de son immatriculation au Registre du Commerce et des Soci\u00e9t\u00e9s.');
  body += content('Les d\u00e9cisions de prorogation de la dur\u00e9e de la Soci\u00e9t\u00e9 ou de dissolution anticip\u00e9e sont prises par d\u00e9cision collective des associ\u00e9s.');

  // ════════════════════════════════════════════════════════════
  // TITRE II — APPORTS – CAPITAL SOCIAL – PARTS SOCIALES
  // ════════════════════════════════════════════════════════════
  body += sectionTitle('TITRE II');
  body += p('APPORTS \u2013 CAPITAL SOCIAL \u2013 FORMES ET DROITS ATTACH\u00c9S AUX PARTS', rPrBold, { center: true, before: 0, after: 240 });

  // Art 6 - Apports
  body += articleTitle('ARTICLE 6 - Apports');

  // Bank conditional sections
  body += tag('{{#BANQUE_SHINE}}');
  body += content('Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par chacun des associ\u00e9s, sur le compte ouvert au nom de la Soci\u00e9t\u00e9 en formation aupr\u00e8s de l\u2019\u00e9tude notariale de Ma\u00eetre Quentin Fourez, situ\u00e9e 1, place Mar\u00e9chal Gallieni, 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.');
  body += tag('{{/BANQUE_SHINE}}');

  body += tag('{{#BANQUE_REVOLUT}}');
  body += content('Lesdites parts souscrites sont toutes int\u00e9gralement lib\u00e9r\u00e9es, ainsi qu\u2019il r\u00e9sulte du certificat du d\u00e9positaire \u00e9tabli pr\u00e9alablement \u00e0 la date des pr\u00e9sents statuts par l\u2019\u00e9tude notariale de Ma\u00eetre Quentin Fourez, situ\u00e9e 1, place Mar\u00e9chal Gallieni - 27500 Pont-Audemer. Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par chacun des associ\u00e9s, sur le compte ouvert au nom de la Soci\u00e9t\u00e9 en formation aupr\u00e8s de l\u2019\u00e9tude notariale de Ma\u00eetre Quentin FOUREZ, situ\u00e9e 1 place Mar\u00e9chal Gallieni, 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.');
  body += tag('{{/BANQUE_REVOLUT}}');

  body += tag('{{#BANQUE_QONTO}}');
  body += content('Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par Qonto, soci\u00e9t\u00e9 Olinda SAS, d\u00fbment mandat\u00e9e \u00e0 cet effet par chacun des associ\u00e9s, sur le compte ouvert au nom de la soci\u00e9t\u00e9 en formation aupr\u00e8s de Etude Notariale De Ma\u00eetre Quentin Fourez Notaires \u00e0 1 Place Marechal Gallieni 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.');
  body += tag('{{/BANQUE_QONTO}}');

  body += tag('{{#BANQUE_AUTRE}}');
  body += content('Les soussign\u00e9s ont consenti \u00e0 la Soci\u00e9t\u00e9 un apport en num\u00e9raire d\u2019un montant de {{CAPITAL_LETTRES}} euros ({{CAPITAL}} \u20ac), lib\u00e9r\u00e9 en totalit\u00e9 \u00e0 la constitution. La somme de {{CAPITAL_LETTRES}} euros ({{CAPITAL}} \u20ac) correspondant \u00e0 la lib\u00e9ration de la totalit\u00e9 des apports, a \u00e9t\u00e9 d\u00e9pos\u00e9e au cr\u00e9dit d\u2019un compte ouvert au nom de la Soci\u00e9t\u00e9 en formation \u00e0 la Banque {{NOM_BANQUE}}, situ\u00e9e {{ADRESSE_BANQUE}}, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli conform\u00e9ment \u00e0 la loi et d\u00e9livr\u00e9 par ladite banque.');
  body += tag('{{/BANQUE_AUTRE}}');

  // Art 7 - Capital social
  body += articleTitle('ARTICLE 7 - Capital social');
  body += content('Le capital social est fix\u00e9 \u00e0 {{CAPITAL_LETTRES}} euros ({{CAPITAL}} \u20ac), divis\u00e9 en {{NB_PARTS_LETTRES}} ({{NB_PARTS}}) parts sociales d\u2019{{VALEUR_NOMINALE_LETTRES}} {{VALEUR_NOMINALE_UNITE}} ({{VALEUR_NOMINALE}} \u20ac) de valeur nominale, int\u00e9gralement lib\u00e9r\u00e9es.');

  // Per-associate distribution
  for (var n = 1; n <= 10; n++) {
    body += tag('{{#HAS_ASSOC_' + n + '}}');
    body += content('- {{CIVILITE_NOM_PRENOM_' + n + '}} : {{NB_PARTS_' + n + '}} parts sociales, num\u00e9rot\u00e9es de {{PARTS_DE_' + n + '}} \u00e0 {{PARTS_A_' + n + '}}.');
    body += tag('{{/HAS_ASSOC_' + n + '}}');
  }

  // Art 8 - Modifications du capital
  body += articleTitle('ARTICLE 8 - Modifications du capital social');
  body += content('8.1. Le capital social ne peut \u00eatre augment\u00e9 ou r\u00e9duit que par d\u00e9cision extraordinaire des associ\u00e9s, conform\u00e9ment aux dispositions l\u00e9gales et statutaires.');
  body += content('L\u2019augmentation du capital peut r\u00e9sulter :');
  body += content('d\u2019apports en num\u00e9raire (y compris par compensation avec des cr\u00e9ances liquides et exigibles sur la soci\u00e9t\u00e9),');
  body += content('d\u2019apports en nature,');
  body += content('de l\u2019incorporation de r\u00e9serves, b\u00e9n\u00e9fices ou primes,');
  body += content('ou encore d\u2019une op\u00e9ration de fusion ou de scission.');
  body += content('L\u2019augmentation peut se faire par \u00e9mission de parts sociales nouvelles ou par \u00e9l\u00e9vation de la valeur nominale des parts existantes.');
  body += content('8.2. Les associ\u00e9s peuvent d\u00e9l\u00e9guer \u00e0 un ou plusieurs g\u00e9rants les pouvoirs n\u00e9cessaires pour r\u00e9aliser, dans les conditions et d\u00e9lais pr\u00e9vus par la loi, l\u2019augmentation ou la r\u00e9duction du capital d\u00e9cid\u00e9e.');
  body += content('8.3. En cas d\u2019augmentation de capital par apports en num\u00e9raire, les associ\u00e9s disposent d\u2019un droit pr\u00e9f\u00e9rentiel de souscription, proportionnellement \u00e0 leur participation dans le capital social. Ils peuvent y renoncer individuellement.');
  body += content('Ce droit peut \u00e9galement \u00eatre supprim\u00e9 par d\u00e9cision unanime des associ\u00e9s ou \u00e0 la majorit\u00e9 requise, dans les conditions pr\u00e9vues par la loi.');
  body += content('8.4. Les parts sociales nouvelles \u00e0 souscrire en num\u00e9raire doivent \u00eatre lib\u00e9r\u00e9es, lors de la souscription, d\u2019au moins un cinqui\u00e8me (1/5) de leur valeur nominale. Le solde doit \u00eatre lib\u00e9r\u00e9 dans les cinq ann\u00e9es de l\u2019augmentation du capital. Toute prime \u00e9ventuelle doit \u00eatre int\u00e9gralement lib\u00e9r\u00e9e lors de la souscription.');

  // Art 9 - Forme des parts sociales
  body += articleTitle('ARTICLE 9 - Forme des parts sociales');
  body += content('Les parts sociales ne sont pas repr\u00e9sent\u00e9es par des titres physiques. Elles sont nominatives et font l\u2019objet d\u2019une inscription sur un registre des mouvements de parts sociales, tenu au si\u00e8ge social par la g\u00e9rance, dans les conditions pr\u00e9vues par la loi.');
  body += content('\u00c0 la demande d\u2019un associ\u00e9, une attestation de participation pourra lui \u00eatre d\u00e9livr\u00e9e par la g\u00e9rance, mentionnant le nombre de parts d\u00e9tenues.');

  // Art 10 - Droits et obligations attachés aux parts sociales (CORRECTED: no "actions")
  body += articleTitle('ARTICLE 10 - Droits et obligations attach\u00e9s aux parts sociales');
  body += content('10.1. Toute part sociale donne droit dans les b\u00e9n\u00e9fices et l\u2019actif social \u00e0 une part nette proportionnelle \u00e0 la quotit\u00e9 de capital qu\u2019elle repr\u00e9sente. Pour y parvenir, il est fait masse, le cas \u00e9ch\u00e9ant, de toutes exon\u00e9rations fiscales comme de toutes taxations pouvant \u00eatre prises en charge par la Soci\u00e9t\u00e9 et auxquelles les r\u00e9partitions au profit des parts sociales pourraient donner lieu.');
  body += content('10.2. Les associ\u00e9s ne supportent les pertes qu\u2019\u00e0 concurrence de leurs apports.');
  body += content('10.3. Les parts sociales sont indivisibles \u00e0 l\u2019\u00e9gard de la Soci\u00e9t\u00e9. Les copropri\u00e9taires indivis doivent se faire repr\u00e9senter aupr\u00e8s de la Soci\u00e9t\u00e9 par l\u2019un d\u2019entre eux ou par un mandataire unique d\u00e9sign\u00e9 en justice en cas de d\u00e9saccord.');
  body += content('10.4. Le droit de vote attach\u00e9 aux parts sociales d\u00e9membr\u00e9es appartient au nu-propri\u00e9taire pour toutes les d\u00e9cisions collectives, sauf pour celles concernant l\u2019affectation des b\u00e9n\u00e9fices de l\u2019exercice o\u00f9 il est r\u00e9serv\u00e9 \u00e0 l\u2019usufruitier.');
  body += content('10.5. Chaque fois qu\u2019il est n\u00e9cessaire de poss\u00e9der plusieurs parts sociales pour exercer un droit quelconque, les propri\u00e9taires de parts isol\u00e9es ou en nombre inf\u00e9rieur \u00e0 celui requis ne pourront exercer ce droit qu\u2019\u00e0 condition d\u2019avoir fait leur affaire personnelle du groupement et, \u00e9ventuellement de l\u2019achat ou de la vente du nombre de parts n\u00e9cessaires.');

  // ════════════════════════════════════════════════════════════
  // TITRE III — CESSION DES PARTS SOCIALES (CORRECTED)
  // ════════════════════════════════════════════════════════════
  body += sectionTitle('TITRE III');
  body += p('TRANSMISSION \u2013 CESSION DES PARTS SOCIALES', rPrBold, { center: true, before: 0, after: 240 });

  // Art 11 - Cession des parts sociales (REPLACED: was "Négociabilité des actions")
  body += articleTitle('ARTICLE 11 - Cession des parts sociales');
  body += content('Les parts sociales sont librement cessibles entre associ\u00e9s.');
  body += content('Elles ne peuvent \u00eatre c\u00e9d\u00e9es \u00e0 des tiers \u00e9trangers \u00e0 la soci\u00e9t\u00e9, \u00e0 quelque titre que ce soit, qu\u2019avec le consentement de la majorit\u00e9 des associ\u00e9s repr\u00e9sentant au moins la moiti\u00e9 des parts sociales, conform\u00e9ment aux dispositions de l\u2019article L.223-14 du Code de commerce.');
  body += content('Le projet de cession est notifi\u00e9 \u00e0 la soci\u00e9t\u00e9 et \u00e0 chacun des associ\u00e9s par lettre recommand\u00e9e avec accus\u00e9 de r\u00e9ception ou par acte extrajudiciaire. La soci\u00e9t\u00e9 dispose d\u2019un d\u00e9lai de trois mois \u00e0 compter de la derni\u00e8re notification pour faire conna\u00eetre sa d\u00e9cision. \u00c0 d\u00e9faut de r\u00e9ponse dans ce d\u00e9lai, le consentement est r\u00e9put\u00e9 acquis.');
  body += content('En cas de refus d\u2019agr\u00e9ment, les associ\u00e9s sont tenus, dans le d\u00e9lai de trois mois \u00e0 compter du refus, de faire acqu\u00e9rir les parts soit par un associ\u00e9, soit par un tiers agr\u00e9\u00e9, soit par la soci\u00e9t\u00e9 elle-m\u00eame en vue de leur annulation et r\u00e9duction corr\u00e9lative du capital social. Le prix de rachat est fix\u00e9 d\u2019un commun accord entre les parties ou, \u00e0 d\u00e9faut, par un expert d\u00e9sign\u00e9 conform\u00e9ment aux dispositions de l\u2019article 1843-4 du Code civil.');

  // Art 12 - Transmission des parts sociales (CORRECTED: acte écrit, not virement de compte)
  body += articleTitle('ARTICLE 12 - Transmission des parts sociales');
  body += content('La cession des parts sociales doit \u00eatre constat\u00e9e par un acte \u00e9crit, conform\u00e9ment aux dispositions de l\u2019article L.223-17 du Code de commerce.');
  body += content('Elle n\u2019est opposable \u00e0 la soci\u00e9t\u00e9 qu\u2019apr\u00e8s avoir \u00e9t\u00e9 signifi\u00e9e \u00e0 la soci\u00e9t\u00e9 ou accept\u00e9e par elle dans un acte authentique, conform\u00e9ment \u00e0 l\u2019article 1690 du Code civil. Elle n\u2019est opposable aux tiers qu\u2019apr\u00e8s accomplissement de ces formalit\u00e9s et, en outre, apr\u00e8s d\u00e9p\u00f4t en annexe au Registre du Commerce et des Soci\u00e9t\u00e9s d\u2019un exemplaire des statuts mis \u00e0 jour.');
  body += content('Les frais de transfert des parts sociales sont \u00e0 la charge des cessionnaires, sauf convention contraire entre c\u00e9dants et cessionnaires.');

  // ════════════════════════════════════════════════════════════
  // TITRE IV — GÉRANCE (CORRECTED: was Président + DG)
  // ════════════════════════════════════════════════════════════
  body += sectionTitle('TITRE IV');
  body += p('ADMINISTRATION DE LA SOCI\u00c9T\u00c9 \u2013 G\u00c9RANCE \u2013 CONTR\u00d4LE', rPrBold, { center: true, before: 0, after: 240 });

  // Art 13 - Gérance (REPLACED: was Président + DG in two articles)
  body += articleTitle('ARTICLE 13 \u2013 G\u00e9rance');
  body += content('La Soci\u00e9t\u00e9 est g\u00e9r\u00e9e par une ou plusieurs personnes physiques, associ\u00e9es ou non, nomm\u00e9es parmi les personnes physiques, conform\u00e9ment aux dispositions de l\u2019article L.223-18 du Code de commerce.');
  body += content('Le ou les g\u00e9rants sont nomm\u00e9s par d\u00e9cision des associ\u00e9s repr\u00e9sentant plus de la moiti\u00e9 des parts sociales. \u00c0 d\u00e9faut, ils sont nomm\u00e9s \u00e0 la majorit\u00e9 des votes \u00e9mis.');
  body += content('Le g\u00e9rant est investi des pouvoirs les plus \u00e9tendus pour agir en toute circonstance au nom de la Soci\u00e9t\u00e9, dans la limite de l\u2019objet social et des pouvoirs que la loi attribue express\u00e9ment aux associ\u00e9s.');
  body += content('Dans les rapports avec les tiers, le g\u00e9rant engage la Soci\u00e9t\u00e9 m\u00eame par les actes qui ne rel\u00e8vent pas de l\u2019objet social, \u00e0 moins que la Soci\u00e9t\u00e9 ne prouve que le tiers savait que l\u2019acte d\u00e9passait cet objet ou qu\u2019il ne pouvait l\u2019ignorer compte tenu des circonstances.');
  body += content('Le g\u00e9rant est nomm\u00e9 pour une dur\u00e9e ind\u00e9termin\u00e9e. Il est r\u00e9vocable par d\u00e9cision des associ\u00e9s repr\u00e9sentant plus de la moiti\u00e9 des parts sociales. Si la r\u00e9vocation est d\u00e9cid\u00e9e sans juste motif, elle peut donner lieu \u00e0 dommages et int\u00e9r\u00eats, conform\u00e9ment \u00e0 l\u2019article L.223-25 du Code de commerce.');
  body += content('{{REMUNERATION_GERANT}}');

  // Art 14 - Conventions réglementées (CORRECTED: L.223-19 à L.223-22)
  body += articleTitle('ARTICLE 14 - Conventions entre la Soci\u00e9t\u00e9 et ses dirigeants');
  body += content('Toute convention intervenant, directement ou par personne interpos\u00e9e, entre la Soci\u00e9t\u00e9 et l\u2019un de ses g\u00e9rants ou associ\u00e9s, doit \u00eatre soumise \u00e0 l\u2019approbation de l\u2019assembl\u00e9e des associ\u00e9s, conform\u00e9ment aux dispositions des articles L.223-19 \u00e0 L.223-22 du Code de commerce.');
  body += content('Le g\u00e9rant ou, s\u2019il en existe un, le commissaire aux comptes, pr\u00e9sente \u00e0 l\u2019assembl\u00e9e ou joint aux documents communiqu\u00e9s aux associ\u00e9s en cas de consultation \u00e9crite, un rapport sur les conventions intervenues.');
  body += content('Les conventions non approuv\u00e9es produisent n\u00e9anmoins leurs effets, \u00e0 charge pour le g\u00e9rant et, s\u2019il y a lieu, pour l\u2019associ\u00e9 contractant, d\u2019en supporter les cons\u00e9quences dommageables pour la Soci\u00e9t\u00e9.');
  body += content('Il est interdit aux g\u00e9rants ou associ\u00e9s personnes physiques de contracter, sous quelque forme que ce soit, des emprunts aupr\u00e8s de la soci\u00e9t\u00e9, de se faire consentir par elle un d\u00e9couvert, en compte courant ou autrement, ainsi que de faire cautionner ou avaliser par elle leurs engagements envers les tiers, conform\u00e9ment \u00e0 l\u2019article L.223-21 du Code de commerce.');

  // Art 15 - Commissaires aux comptes
  body += articleTitle('ARTICLE 15 - Commissaires aux comptes');
  body += content('Un ou plusieurs commissaires aux comptes titulaire et suppl\u00e9ant peuvent \u00eatre d\u00e9sign\u00e9s par les associ\u00e9s.');
  body += content('Cette d\u00e9signation est obligatoire lorsque la Soci\u00e9t\u00e9 d\u00e9passe les seuils fix\u00e9s par d\u00e9cret.');
  body += content('Le ou les commissaires aux comptes exercent leurs fonctions et sont r\u00e9mun\u00e9r\u00e9s conform\u00e9ment \u00e0 la loi.');

  // ════════════════════════════════════════════════════════════
  // TITRE V — DÉCISIONS COLLECTIVES DES ASSOCIÉS
  // ════════════════════════════════════════════════════════════
  body += sectionTitle('TITRE V');
  body += p('D\u00c9CISIONS COLLECTIVES DES ASSOCI\u00c9S', rPrBold, { center: true, before: 0, after: 240 });

  // Art 16 - Forme des décisions
  body += articleTitle('ARTICLE 16 - Forme des d\u00e9cisions');
  body += content('Les d\u00e9cisions des associ\u00e9s sont prises, au choix de la personne \u00e0 l\u2019origine de la convocation concern\u00e9e, en assembl\u00e9e g\u00e9n\u00e9rale ou r\u00e9sultent du consentement des associ\u00e9s exprim\u00e9 dans un acte sous seing priv\u00e9. Elles peuvent \u00e9galement faire l\u2019objet d\u2019une consultation \u00e9crite.');
  body += content('Sauf autrement stipul\u00e9 aux pr\u00e9sentes, les d\u00e9cisions collectives ordinaires sont celles qui sont appel\u00e9es \u00e0 prendre toutes d\u00e9cisions qui ne modifient pas les statuts, \u00e0 savoir notamment :');
  body += content('approbation des comptes sociaux annuels et affectation des r\u00e9sultats ;');
  body += content('nomination et r\u00e9vocation de la g\u00e9rance ;');
  body += content('approbation des conventions r\u00e9glement\u00e9es.');
  body += content('Sauf autrement stipul\u00e9 aux pr\u00e9sentes, les d\u00e9cisions collectives extraordinaires sont celles appel\u00e9es \u00e0 d\u00e9cider ou \u00e0 autoriser les modifications directes ou indirectes des statuts.');
  body += content('Les d\u00e9cisions collectives obligent tous les associ\u00e9s, m\u00eame absents.');

  // Art 17 - Convocation
  body += articleTitle('ARTICLE 17 - Convocation et r\u00e9union des d\u00e9cisions collectives');
  body += content('Les d\u00e9cisions collectives sont prises \u00e0 l\u2019initiative soit de la g\u00e9rance, soit du commissaire aux comptes (s\u2019il en existe), soit d\u2019un ou plusieurs associ\u00e9s r\u00e9unissant au moins le dixi\u00e8me des parts sociales ou le dixi\u00e8me du nombre des associ\u00e9s (un \u00ab Demandeur \u00bb), conform\u00e9ment \u00e0 l\u2019article L.223-27 du Code de commerce.');
  body += content('17.1 D\u00e9cisions prises en assembl\u00e9e g\u00e9n\u00e9rale');
  body += content('Les assembl\u00e9es g\u00e9n\u00e9rales sont convoqu\u00e9es par le Demandeur. Les assembl\u00e9es g\u00e9n\u00e9rales sont r\u00e9unies au si\u00e8ge social ou en tout autre lieu indiqu\u00e9 dans l\u2019avis de convocation.');
  body += content('La convocation est faite quinze (15) jours au moins avant la date de l\u2019assembl\u00e9e g\u00e9n\u00e9rale par lettre recommand\u00e9e, ou par tous moyens \u00e9crits, en ce compris par transmission \u00e9lectronique (e-mail), adress\u00e9s \u00e0 chaque associ\u00e9, conform\u00e9ment \u00e0 l\u2019article R.223-20 du Code de commerce.');
  body += content('17.2 D\u00e9cisions prises par consultation \u00e9crite');
  body += content('En cas de consultation \u00e9crite, le texte des r\u00e9solutions propos\u00e9es ainsi que les documents n\u00e9cessaires sont adress\u00e9s par le Demandeur \u00e0 chaque associ\u00e9 et \u00e0 la g\u00e9rance, si celle-ci n\u2019est pas le Demandeur, par tous moyens \u00e9crits. Les associ\u00e9s disposent d\u2019un d\u00e9lai de quinze (15) jours pour \u00e9mettre leur vote.');
  body += content('17.3 Acte unanime');
  body += content('Toute d\u00e9cision de la comp\u00e9tence des associ\u00e9s peut \u00e9galement r\u00e9sulter, en l\u2019absence d\u2019assembl\u00e9e, du consentement de tous les associ\u00e9s exprim\u00e9 dans un acte \u00e9crit et sign\u00e9 par tous les associ\u00e9s.');

  // Art 18 - Ordre du jour
  body += articleTitle('ARTICLE 18 - Ordre du jour');
  body += content('L\u2019ordre du jour des d\u00e9cisions collectives est arr\u00eat\u00e9 par le Demandeur.');
  body += content('Les associ\u00e9s ne peuvent d\u00e9lib\u00e9rer sur une question qui n\u2019est pas inscrite \u00e0 l\u2019ordre du jour, lequel ne peut \u00eatre modifi\u00e9 sur deuxi\u00e8me convocation.');

  // Art 19 - Admission aux décisions
  body += articleTitle('ARTICLE 19 - Admission aux d\u00e9cisions collectives - pouvoirs');
  body += content('Tout associ\u00e9 a le droit de participer aux d\u00e9cisions collectives personnellement ou par mandataire, quel que soit le nombre de ses parts sociales, sur simple justification de son identit\u00e9.');
  body += content('Un associ\u00e9 ne peut se faire repr\u00e9senter que par son conjoint ou par un autre associ\u00e9 justifiant d\u2019un mandat, \u00e0 l\u2019exclusion de toute autre personne, conform\u00e9ment \u00e0 l\u2019article L.223-28 du Code de commerce.');

  // Art 20 - Tenue de l'AG
  body += articleTitle('ARTICLE 20 - Tenue de l\u2019assembl\u00e9e g\u00e9n\u00e9rale \u2013 proc\u00e8s-verbaux');
  body += content('1 - Une feuille de pr\u00e9sence est \u00e9marg\u00e9e par les associ\u00e9s pr\u00e9sents et les mandataires. Elle est certifi\u00e9e exacte par le bureau de l\u2019assembl\u00e9e g\u00e9n\u00e9rale.');
  body += content('2 - Les assembl\u00e9es g\u00e9n\u00e9rales sont pr\u00e9sid\u00e9es par la g\u00e9rance ou, en son absence, par l\u2019associ\u00e9 repr\u00e9sentant le plus grand nombre de parts sociales et acceptant cette fonction.');
  body += content('3 - Les d\u00e9lib\u00e9rations des assembl\u00e9es g\u00e9n\u00e9rales sont constat\u00e9es par des proc\u00e8s-verbaux qui indiquent le mode, le lieu et la date de l\u2019assembl\u00e9e, les documents et rapports soumis \u00e0 discussion, un expos\u00e9 des d\u00e9bats ainsi que le texte des r\u00e9solutions et, sous chaque r\u00e9solution, le r\u00e9sultat du vote.');
  body += content('4 - Les d\u00e9cisions collectives des associ\u00e9s, quel qu\u2019en soit leur mode, sont constat\u00e9es par des proc\u00e8s-verbaux \u00e9tablis sur un registre cot\u00e9 et paraph\u00e9, tenu au si\u00e8ge de la Soci\u00e9t\u00e9.');

  // Art 21 - Quorum - vote
  body += articleTitle('ARTICLE 21 - Quorum - vote');
  body += content('1 - Le quorum est calcul\u00e9 sur l\u2019ensemble des parts sociales composant le capital social.');
  body += content('2 - Chaque part sociale donne droit \u00e0 une voix.');

  // Art 22 - Décisions collectives ordinaires (CORRECTED: >50% parts L.223-29)
  body += articleTitle('ARTICLE 22 \u2013 D\u00e9cisions collectives ordinaires');
  body += content('Les d\u00e9cisions collectives ordinaires sont adopt\u00e9es par un ou plusieurs associ\u00e9s repr\u00e9sentant plus de la moiti\u00e9 des parts sociales, conform\u00e9ment \u00e0 l\u2019article L.223-29 du Code de commerce.');
  body += content('Si cette majorit\u00e9 n\u2019est pas obtenue, les associ\u00e9s sont, sauf stipulation contraire des statuts, consult\u00e9s une seconde fois et les d\u00e9cisions sont prises \u00e0 la majorit\u00e9 des votes \u00e9mis, quel que soit le nombre des votants.');

  // Art 23 - Décisions collectives extraordinaires (CORRECTED: 2/3 parts, quorum 1/4 puis 1/5, L.223-30)
  body += articleTitle('ARTICLE 23 - D\u00e9cisions collectives extraordinaires');
  body += content('1 - Les associ\u00e9s peuvent modifier les statuts dans toutes leurs dispositions. Ils ne peuvent toutefois augmenter les engagements des associ\u00e9s sans leur consentement unanime.');
  body += content('2 - Les associ\u00e9s ne d\u00e9lib\u00e8rent valablement sur premi\u00e8re convocation que si les associ\u00e9s pr\u00e9sents ou repr\u00e9sent\u00e9s poss\u00e8dent au moins le quart des parts sociales. Sur deuxi\u00e8me convocation, le quorum est ramen\u00e9 au cinqui\u00e8me des parts sociales, conform\u00e9ment \u00e0 l\u2019article L.223-30 du Code de commerce.');
  body += content('Les d\u00e9cisions collectives extraordinaires sont prises \u00e0 la majorit\u00e9 des deux tiers des parts sociales d\u00e9tenues par les associ\u00e9s pr\u00e9sents ou repr\u00e9sent\u00e9s.');
  body += content('3 - Toutefois, la transformation de la Soci\u00e9t\u00e9 en soci\u00e9t\u00e9 en nom collectif, en commandite simple, en commandite par actions ou en soci\u00e9t\u00e9 par actions simplifi\u00e9e, ou le changement de nationalit\u00e9, n\u00e9cessitent l\u2019unanimit\u00e9 des associ\u00e9s.');
  body += content('En outre, toutes d\u00e9cisions visant \u00e0 augmenter les engagements des associ\u00e9s ne peuvent \u00eatre prises sans le consentement de ceux-ci.');

  // Art 24 - Droit d'information (CORRECTED: L.223-26, not L.225-115)
  body += articleTitle('ARTICLE 24 - Droit d\u2019information permanent');
  body += content('Le droit d\u2019information et de communication des associ\u00e9s est exerc\u00e9 dans les conditions l\u00e9gales des articles L.223-26 et suivants du Code de commerce.');

  // ════════════════════════════════════════════════════════════
  // TITRE VI — EXERCICE SOCIAL – COMPTES – RÉSULTAT
  // ════════════════════════════════════════════════════════════
  body += sectionTitle('TITRE VI');
  body += p('EXERCICE SOCIAL \u2013 COMPTES ANNUELS \u2013 AFFECTATION DU R\u00c9SULTAT', rPrBold, { center: true, before: 0, after: 240 });

  // Art 25 - Exercice social
  body += articleTitle('ARTICLE 25 - Exercice social');
  body += content('Chaque exercice social a une dur\u00e9e d\u2019une ann\u00e9e qui commence le {{DATE_DEBUT_EXERCICE}} et se termine le {{DATE_CLOTURE}} de chaque ann\u00e9e.');
  body += content('Par exception, le premier exercice social commence \u00e0 compter du jour de l\u2019immatriculation de la Soci\u00e9t\u00e9 au Registre du Commerce et des Soci\u00e9t\u00e9s et se terminera le {{DATE_CLOTURE_PREMIER_EXERCICE}}.');

  // Art 26 - Comptes annuels
  body += articleTitle('ARTICLE 26 - \u00c9tablissement et approbation des comptes annuels');
  body += content('La g\u00e9rance \u00e9tablit les comptes annuels de l\u2019exercice.');
  body += content('Les associ\u00e9s doivent statuer par d\u00e9cision collective sur les comptes annuels, au vu du rapport de gestion lorsque la loi le pr\u00e9voit, et des rapports du ou des commissaires aux comptes (si de tels commissaires sont nomm\u00e9s).');

  // Art 27 - Affectation des résultats
  body += articleTitle('ARTICLE 27 - Affectation et r\u00e9partition des r\u00e9sultats');
  body += content('27.1. Toute part sociale donne droit \u00e0 une part nette proportionnelle \u00e0 la quote-part du capital qu\u2019elle repr\u00e9sente, dans les b\u00e9n\u00e9fices et r\u00e9serves ou dans l\u2019actif social, au cours de l\u2019existence de la Soci\u00e9t\u00e9 comme en cas de liquidation. Chaque part sociale supporte les pertes sociales dans les m\u00eames proportions.');
  body += content('27.2. Apr\u00e8s approbation des comptes et constatation de l\u2019existence d\u2019un b\u00e9n\u00e9fice distribuable, les associ\u00e9s d\u00e9cident sa distribution, en totalit\u00e9 ou en partie, ou son affectation \u00e0 un ou plusieurs postes de r\u00e9serves dont ils r\u00e8glent l\u2019affectation et l\u2019emploi.');
  body += content('Un acompte \u00e0 valoir sur le dividende d\u2019un exercice peut \u00eatre mis en distribution dans les conditions pr\u00e9vues \u00e0 l\u2019article L.232-12 du Code de commerce.');
  body += content('27.3. La d\u00e9cision collective des associ\u00e9s peut d\u00e9cider la mise en distribution de toute somme pr\u00e9lev\u00e9e sur le report \u00e0 nouveau b\u00e9n\u00e9ficiaire ou sur les r\u00e9serves disponibles en indiquant express\u00e9ment les postes de r\u00e9serves sur lesquels ces pr\u00e9l\u00e8vements sont effectu\u00e9s. Toutefois, les dividendes sont pr\u00e9lev\u00e9s par priorit\u00e9 sur le b\u00e9n\u00e9fice distribuable de l\u2019exercice.');
  body += content('La d\u00e9cision collective des associ\u00e9s ou, \u00e0 d\u00e9faut, la g\u00e9rance fixe les modalit\u00e9s de paiement des dividendes.');

  // ════════════════════════════════════════════════════════════
  // TITRE VII — DISSOLUTION – LIQUIDATION – DISPOSITIONS DIVERSES
  // ════════════════════════════════════════════════════════════
  body += sectionTitle('TITRE VII');
  body += p('DISSOLUTION \u2013 LIQUIDATION \u2013 DISPOSITIONS DIVERSES', rPrBold, { center: true, before: 0, after: 240 });

  // Art 28 - Dissolution
  body += articleTitle('ARTICLE 28 - Dissolution - Liquidation de la Soci\u00e9t\u00e9');
  body += content('La Soci\u00e9t\u00e9 est dissoute dans les cas pr\u00e9vus par la loi ou en cas de dissolution anticip\u00e9e d\u00e9cid\u00e9e par d\u00e9cision collective des associ\u00e9s statuant \u00e0 la majorit\u00e9 requise pour les d\u00e9cisions collectives extraordinaires.');
  body += content('La d\u00e9cision collective des associ\u00e9s qui constate ou d\u00e9cide la dissolution nomme un ou plusieurs liquidateurs.');
  body += content('Le liquidateur, ou chacun d\u2019eux s\u2019ils sont plusieurs, repr\u00e9sente la Soci\u00e9t\u00e9. Il dispose des pouvoirs les plus \u00e9tendus pour r\u00e9aliser l\u2019actif m\u00eame \u00e0 l\u2019amiable. Il est habilit\u00e9 \u00e0 payer les cr\u00e9anciers sociaux et \u00e0 r\u00e9partir le solde disponible entre les associ\u00e9s.');
  body += content('Le produit net de la liquidation, apr\u00e8s apurement du passif, est employ\u00e9 au remboursement int\u00e9gral du capital lib\u00e9r\u00e9 et non amorti des parts sociales.');
  body += content('Le surplus, s\u2019il en existe, est r\u00e9parti entre les associ\u00e9s proportionnellement au nombre de parts de chacun d\u2019eux.');
  body += content('Les pertes, s\u2019il en existe, sont support\u00e9es par les associ\u00e9s jusqu\u2019\u00e0 concurrence du montant de leurs apports.');
  body += content('Si toutes les parts sont r\u00e9unies en une seule main, la dissolution de la Soci\u00e9t\u00e9 entra\u00eene, lorsque l\u2019associ\u00e9 unique est une personne morale, la transmission universelle du patrimoine \u00e0 l\u2019associ\u00e9 unique, sans qu\u2019il y ait lieu \u00e0 liquidation, conform\u00e9ment aux dispositions de l\u2019article 1844-5 du Code civil.');

  // Art 29 - Reprise des engagements
  body += articleTitle('ARTICLE 29 - Reprise des engagements ant\u00e9rieurs');
  body += content('Un \u00e9tat des actes accomplis \u00e0 ce jour pour le compte de la Soci\u00e9t\u00e9 en formation est joint en Annexe aux pr\u00e9sents statuts. L\u2019immatriculation de la Soci\u00e9t\u00e9 au Registre du commerce et des soci\u00e9t\u00e9s entra\u00eenera de plein droit reprise par la Soci\u00e9t\u00e9 desdits actes et engagements.');

  // Art 30 - Formalités
  body += articleTitle('ARTICLE 30 - Formalit\u00e9s de publicit\u00e9 - Immatriculation');
  body += content('Tous pouvoirs sont conf\u00e9r\u00e9s au porteur d\u2019un original des pr\u00e9sentes \u00e0 l\u2019effet d\u2019accomplir les formalit\u00e9s de publicit\u00e9, de d\u00e9p\u00f4t et autres n\u00e9cessaires pour parvenir \u00e0 l\u2019immatriculation de la Soci\u00e9t\u00e9 au Registre du Commerce et des Soci\u00e9t\u00e9s.');

  // ─── SIGNATURE ───
  body += p('A {{VILLE_SIGNATURE}}, le {{DATE_SIGNATURE}},', rPr, { before: 480, after: 240 });

  body += tag('{{#IS_UNIPERSONNELLE}}');
  body += p('Signature de l\u2019associ\u00e9 unique :', rPrBold, { before: 240, after: 240 });
  body += tag('{{/IS_UNIPERSONNELLE}}');
  body += tag('{{#IS_PLURIPERSONNELLE}}');
  body += p('Signature des associ\u00e9s :', rPrBold, { before: 240, after: 240 });
  body += tag('{{/IS_PLURIPERSONNELLE}}');

  for (var s = 1; s <= 10; s++) {
    var sigBefore = s === 1 ? 0 : 480;
    body += tag('{{#HAS_ASSOC_' + s + '}}');
    body += p('______________________________________', rPr, { before: sigBefore, after: 120 });
    body += p('{{ACTIONNAIRE_' + s + '}}', rPrBold, { before: 0, after: 0 });
    body += tag('{{/HAS_ASSOC_' + s + '}}');
  }

  // ─── ANNEXE: ETAT DES ACTES ───
  body += p('ANNEXE', rPrSectionTitle, { center: true, before: 480, after: 120, pageBreakBefore: true });
  body += p('\u00c9TAT DES ACTES ACCOMPLIS POUR LE COMPTE', rPrBold, { center: true, before: 0, after: 20 });
  body += p('DE LA SOCI\u00c9T\u00c9 EN FORMATION', rPrBold, { center: true, before: 0, after: 360 });

  body += content('ouverture d\u2019un compte bancaire.');

  body += tag('{{#BANQUE_QONTO}}');
  body += content('D\u00e9p\u00f4t du capital social aupr\u00e8s d\u2019une \u00e9tude notariale');
  body += content('Ouverture d\u2019un compte de transit \u00e0 leurs noms aupr\u00e8s de Olinda SAS (QONTO), \u00e9tablissement de paiement agr\u00e9\u00e9 aupr\u00e8s de l\u2019ACPR');
  body += content('Ouverture d\u2019un compte de paiement au nom de la Soci\u00e9t\u00e9 aupr\u00e8s de OLINDA SAS (Qonto), \u00e9tablissement de paiement agr\u00e9\u00e9 aupr\u00e8s de l\u2019ACPR');
  body += tag('{{/BANQUE_QONTO}}');

  body += tag('{{#BANQUE_SHINE}}');
  body += content('D\u00e9p\u00f4t du capital social aupr\u00e8s d\u2019un office notarial');
  body += content('Ouverture d\u2019un compte courant aupr\u00e8s de Shine, \u00c9tablissement de paiement agr\u00e9\u00e9 par l\u2019Autorit\u00e9 de Contr\u00f4le Prudentiel (ACPR) sous le num\u00e9ro 71758 (www.regafi.fr), agent de Treezor, \u00e9tablissement de paiement agr\u00e9\u00e9 sous le num\u00e9ro 63512. Interm\u00e9diaire en assurance enregistr\u00e9 \u00e0 l\u2019ORIAS sous le num\u00e9ro 19003103.');
  body += tag('{{/BANQUE_SHINE}}');

  body += tag('{{#BANQUE_REVOLUT}}');
  body += content('D\u00e9p\u00f4t du capital social aupr\u00e8s d\u2019une \u00e9tude notariale');
  body += content('Les parts repr\u00e9sentatives des apports ont \u00e9t\u00e9 lib\u00e9r\u00e9es \u00e0 hauteur d\u2019un montant total de {{CAPITAL}} euros ainsi qu\u2019il r\u00e9sulte de l\u2019attestation du d\u00e9positaire des fonds l\u2019\u00e9tude notariale de Ma\u00eetre Quentin Fourez, situ\u00e9e 1, place Mar\u00e9chal Gallieni - 27500 Pont-Audemer.');
  body += tag('{{/BANQUE_REVOLUT}}');

  body += tag('{{#BANQUE_AUTRE}}');
  body += content('D\u00e9p\u00f4t du capital social aupr\u00e8s de la Banque {{NOM_BANQUE}}, situ\u00e9e {{ADRESSE_BANQUE}}.');
  body += tag('{{/BANQUE_AUTRE}}');

  var newXml = beforeBody + body + afterBody;
  verifyAndSave(zip, newXml, path.join(outDir, 'sarl-statuts.docx'), 'SARL Statuts');
})();


// ════════════════════════════════════════════════════════════
// FILE 2: PV NOMINATION DU GÉRANT
// ════════════════════════════════════════════════════════════
(function buildPvNomination() {
  console.log('\n########################################');
  console.log('# Processing: SARL PV Nomination');
  console.log('########################################');

  var buf = fs.readFileSync(srcPath);
  var zip = new PizZip(buf);
  var origXml = zip.file('word/document.xml').asText();

  var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
  var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

  var body = '';

  // Header
  body += p('{{NOM_SOCIETE}}', rPrTitle, { center: true, before: 0, after: 40 });
  body += p('{{FORME_LABEL}} au capital de {{CAPITAL}} euros', rPrSmall, { center: true, before: 0, after: 40 });
  body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPrSmall, { center: true, before: 0, after: 600 });

  // Date & presents
  body += para({ before: 0, after: 240, runs: run('Le {{DATE_SIGNATURE}} \u00e0 14 heures, sont pr\u00e9sents au si\u00e8ge de la soci\u00e9t\u00e9, les soussign\u00e9s :', rPr) });

  for (var n = 1; n <= 10; n++) {
    body += tag('{{#HAS_ASSOC_' + n + '}}');
    body += tag('{{#EST_HOMME_' + n + '}}');
    body += p('- {{CIVILITE_NOM_PRENOM_' + n + '}}, n\u00e9 le {{DATE_NAISSANCE_' + n + '}} \u00e0 {{LIEU_NAISSANCE_' + n + '}}, de nationalit\u00e9 {{NATIONALITE_' + n + '}}, {{SITUATION_MATRIMONIALE_' + n + '}}, demeurant {{ADRESSE_ASSOCIE_' + n + '}}, titulaire de {{NB_PARTS_' + n + '}} parts sociales.', rPr, { before: 0, after: 200 });
    body += tag('{{/EST_HOMME_' + n + '}}');
    body += tag('{{#EST_FEMME_' + n + '}}');
    body += p('- {{CIVILITE_NOM_PRENOM_' + n + '}}, n\u00e9e le {{DATE_NAISSANCE_' + n + '}} \u00e0 {{LIEU_NAISSANCE_' + n + '}}, de nationalit\u00e9 {{NATIONALITE_' + n + '}}, {{SITUATION_MATRIMONIALE_' + n + '}}, demeurant {{ADRESSE_ASSOCIE_' + n + '}}, titulaire de {{NB_PARTS_' + n + '}} parts sociales.', rPr, { before: 0, after: 200 });
    body += tag('{{/EST_FEMME_' + n + '}}');
    body += tag('{{/HAS_ASSOC_' + n + '}}');
  }

  // AG ordinaire
  body += p('Repr\u00e9sentant la totalit\u00e9 des parts sociales afin de participer \u00e0 :', rPr, { before: 240, after: 240 });
  body += p('L\'ASSEMBL\u00c9E G\u00c9N\u00c9RALE ORDINAIRE', rPrSectionTitle, { center: true, before: 360, after: 360 });

  body += para({ before: 0, after: 240, runs: run('Dont l\'ordre du jour annonc\u00e9 par {{PRESIDENT_NOM}}, pr\u00e9sident de cette assembl\u00e9e est :', rPr) });
  body += para({ before: 240, after: 480, runs: run('Nomination de la g\u00e9rance{{#HAS_DG_1}} et de la co-g\u00e9rance{{/HAS_DG_1}}', rPrBold) });

  // Résolution 1: Gérant
  body += para({ before: 360, after: 240, runs: run('R\u00c9SOLUTION 1 :', rPrSectionTitle) });
  body += p('Nomination aux fonctions de g\u00e9rant telles que d\u00e9finies par la loi et les statuts de la soci\u00e9t\u00e9, \u00e0 compter de ce jour et pour une dur\u00e9e ind\u00e9termin\u00e9e :', rPr, { before: 0, after: 200 });
  body += tag('{{#GERANT_EST_HOMME}}');
  body += p('- {{GERANT_CIVILITE_NOM_PRENOM}}, n\u00e9 le {{GERANT_DATE_NAISSANCE}} \u00e0 {{GERANT_LIEU_NAISSANCE}}, de nationalit\u00e9 {{GERANT_NATIONALITE}}, {{GERANT_SITUATION_MATRIMONIALE}}, demeurant {{GERANT_ADRESSE}}.', rPr, { before: 0, after: 200 });
  body += tag('{{/GERANT_EST_HOMME}}');
  body += tag('{{#GERANT_EST_FEMME}}');
  body += p('- {{GERANT_CIVILITE_NOM_PRENOM}}, n\u00e9e le {{GERANT_DATE_NAISSANCE}} \u00e0 {{GERANT_LIEU_NAISSANCE}}, de nationalit\u00e9 {{GERANT_NATIONALITE}}, {{GERANT_SITUATION_MATRIMONIALE}}, demeurant {{GERANT_ADRESSE}}.', rPr, { before: 0, after: 200 });
  body += tag('{{/GERANT_EST_FEMME}}');
  body += p('{{REMUNERATION_GERANT}}', rPr, { before: 0, after: 200 });

  // Résolution 2: Co-gérant
  body += tag('{{#HAS_DG_1}}');
  body += p('Nomination de la co-g\u00e9rance', rPrBold, { before: 360, after: 240 });
  body += para({ before: 0, after: 240, runs: run('R\u00c9SOLUTION 2 :', rPrSectionTitle) });
  body += p('Nomination aux fonctions de g\u00e9rant telles que d\u00e9finies par la loi et les statuts de la soci\u00e9t\u00e9, \u00e0 compter de ce jour et pour une dur\u00e9e ind\u00e9termin\u00e9e :', rPr, { before: 0, after: 200 });
  body += tag('{{#DG_1_EST_HOMME}}');
  body += p('- {{DG_1_CIVILITE_NOM_PRENOM}}, n\u00e9 le {{DG_1_DATE_NAISSANCE}} \u00e0 {{DG_1_LIEU_NAISSANCE}}, de nationalit\u00e9 {{DG_1_NATIONALITE}}, {{DG_1_SITUATION_MATRIMONIALE}}, demeurant {{DG_1_ADRESSE}}.', rPr, { before: 0, after: 200 });
  body += tag('{{/DG_1_EST_HOMME}}');
  body += tag('{{#DG_1_EST_FEMME}}');
  body += p('- {{DG_1_CIVILITE_NOM_PRENOM}}, n\u00e9e le {{DG_1_DATE_NAISSANCE}} \u00e0 {{DG_1_LIEU_NAISSANCE}}, de nationalit\u00e9 {{DG_1_NATIONALITE}}, {{DG_1_SITUATION_MATRIMONIALE}}, demeurant {{DG_1_ADRESSE}}.', rPr, { before: 0, after: 200 });
  body += tag('{{/DG_1_EST_FEMME}}');
  body += p('{{REMUNERATION_CO_GERANT}}', rPr, { before: 0, after: 200 });
  body += tag('{{/HAS_DG_1}}');

  body += p('CETTE RESOLUTION EST ADOPTEE A L\'UNANIMITE', rPrBold, { before: 360, after: 480 });

  // Clôture
  body += p('Plus rien n\'\u00e9tant \u00e0 l\'ordre du jour, la s\u00e9ance est lev\u00e9e \u00e0 14 heures 30 minutes.', rPr, { before: 240, after: 200 });
  body += p('De tout ce que dessus, il est dress\u00e9 le pr\u00e9sent proc\u00e8s-verbal en 4 exemplaires originaux, qui seront sign\u00e9s par tous les intervenants susmentionn\u00e9s.', rPr, { before: 0, after: 360 });

  // Signature
  body += para({ before: 0, after: 360, runs: run('Fait \u00e0 {{VILLE_SIGNATURE}}, le {{DATE_SIGNATURE}}', rPr) });
  body += tag('{{#IS_UNIPERSONNELLE}}');
  body += p('Signature de l\u2019associ\u00e9 unique :', rPrBold, { before: 0, after: 120 });
  body += tag('{{/IS_UNIPERSONNELLE}}');
  body += tag('{{#IS_PLURIPERSONNELLE}}');
  body += p('Signature des associ\u00e9s :', rPrBold, { before: 0, after: 120 });
  body += tag('{{/IS_PLURIPERSONNELLE}}');

  for (var n = 1; n <= 10; n++) {
    var sigBefore = n === 1 ? 0 : 360;
    body += tag('{{#HAS_ASSOC_' + n + '}}');
    body += p('______________________________', rPr, { before: sigBefore, after: 0 });
    body += p('{{ACTIONNAIRE_' + n + '}}', rPrBold, { before: 0, after: 0 });
    body += tag('{{/HAS_ASSOC_' + n + '}}');
  }

  var newXml = beforeBody + body + afterBody;
  verifyAndSave(zip, newXml, path.join(outDir, 'sarl-pv-nomination.docx'), 'SARL PV Nomination');
})();


// ════════════════════════════════════════════════════════════
// FILE 3: DÉCLARATION DE NON-CONDAMNATION
// ════════════════════════════════════════════════════════════
(function buildDeclaration() {
  console.log('\n########################################');
  console.log('# Processing: SARL Declaration non-condamnation');
  console.log('########################################');

  var buf = fs.readFileSync(srcPath);
  var zip = new PizZip(buf);
  var origXml = zip.file('word/document.xml').asText();

  var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
  var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

  function buildDeclarationPage(fields, role, isFirst) {
    var body = '';
    var titleOpts = { center: true, before: 0, after: 20 };
    if (!isFirst) titleOpts.pageBreakBefore = true;

    body += p('D\u00c9CLARATION DE NON-CONDAMNATION', rPrTitle, titleOpts);
    body += p('souscrite en application de l\u2019article A.123-51 du Code de commerce', rPrSubtitle, { center: true, before: 0, after: 360 });

    var gH = fields.EST_HOMME;
    var gF = fields.EST_FEMME;

    body += tag('{{#' + gH + '}}');
    body += p('Je soussign\u00e9,', rPr, { before: 0, after: 120 });
    body += tag('{{/' + gH + '}}');
    body += tag('{{#' + gF + '}}');
    body += p('Je soussign\u00e9e,', rPr, { before: 0, after: 120 });
    body += tag('{{/' + gF + '}}');

    body += p(fields.CIVILITE_NOM_PRENOM + ',', rPrBold, { before: 0, after: 20 });
    body += p('demeurant ' + fields.ADRESSE + ',', rPr, { before: 0, after: 20 });

    body += tag('{{#' + gH + '}}');
    body += p('n\u00e9 le ' + fields.DATE_NAISSANCE + ' \u00e0 ' + fields.LIEU_NAISSANCE + ',', rPr, { before: 0, after: 20 });
    body += tag('{{/' + gH + '}}');
    body += tag('{{#' + gF + '}}');
    body += p('n\u00e9e le ' + fields.DATE_NAISSANCE + ' \u00e0 ' + fields.LIEU_NAISSANCE + ',', rPr, { before: 0, after: 20 });
    body += tag('{{/' + gF + '}}');

    body += p('de nationalit\u00e9 ' + fields.NATIONALITE + ',', rPr, { before: 0, after: 20 });

    body += tag('{{#' + gH + '}}');
    body += p('fils de ' + fields.NOM_PERE + ' et de ' + fields.NOM_MERE + ' n\u00e9e (' + fields.NOM_JEUNE_FILLE + '),', rPr, { before: 0, after: 240 });
    body += tag('{{/' + gH + '}}');
    body += tag('{{#' + gF + '}}');
    body += p('fille de ' + fields.NOM_PERE + ' et de ' + fields.NOM_MERE + ' n\u00e9e (' + fields.NOM_JEUNE_FILLE + '),', rPr, { before: 0, after: 240 });
    body += tag('{{/' + gF + '}}');

    body += p('d\u00e9clare accepter les fonctions de ' + role + ' de la soci\u00e9t\u00e9 :', rPr, { before: 0, after: 120 });
    body += p('{{NOM_SOCIETE}}', rPrBold, { before: 0, after: 20 });
    body += p('{{FORME_LABEL}} au capital de {{CAPITAL}} euros', rPr, { before: 0, after: 20 });
    body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPr, { before: 0, after: 240 });

    body += p('Je d\u00e9clare, en outre, conform\u00e9ment aux dispositions de l\u2019article A.123-51 du Code de commerce, n\u2019avoir jamais fait l\u2019objet d\u2019aucune condamnation p\u00e9nale ni de sanction civile ou administrative de nature \u00e0 m\u2019interdire, soit d\u2019exercer une activit\u00e9 commerciale, soit de g\u00e9rer, d\u2019administrer ou de diriger une personne morale.', rPr, { before: 0, after: 360, both: true });

    body += p('Sign\u00e9e \u00e9lectroniquement le {{DATE_SIGNATURE}} conform\u00e9ment aux dispositions des articles 1366 et suivants du Code civil.', rPr, { before: 0, after: 240 });
    body += p('______________________________', rPr, { before: 0, after: 0 });
    body += p(fields.CIVILITE_NOM_PRENOM, rPrBold, { before: 0, after: 360 });

    body += p('Rappel de L 123-5 du Code de Commerce, r\u00e9primant certaines infractions en mati\u00e8re de Registre du Commerce :', rPrSmall, { before: 0, after: 20 });
    body += p('Le fait de donner, de mauvaise foi, des indications inexactes ou incompl\u00e8tes en vue d\u2019une immatriculation, d\u2019une radiation ou d\u2019une mention compl\u00e9mentaire ou rectificative au registre du commerce et des soci\u00e9t\u00e9s est puni d\u2019une amende de 4 500 euros et d\u2019un emprisonnement de six mois.', rPrSmall, { before: 0, after: 20, both: true });
    body += p('Le tribunal comp\u00e9tent peut, en outre, priver l\u2019int\u00e9ress\u00e9, pendant un temps qui n\u2019exc\u00e8de pas cinq ans, du droit de vote et d\u2019\u00e9ligibilit\u00e9 aux \u00e9lections des tribunaux de commerce, chambres de commerce et d\u2019industrie et conseils de prud\u2019hommes.', rPrSmall, { before: 0, after: 0, both: true });

    return body;
  }

  var body = '';

  // Page 1: Gérant
  body += buildDeclarationPage({
    CIVILITE_NOM_PRENOM: '{{CIVILITE_NOM_PRENOM}}',
    ADRESSE: '{{ADRESSE_DIRIGEANT}}',
    DATE_NAISSANCE: '{{DATE_NAISSANCE}}',
    LIEU_NAISSANCE: '{{LIEU_NAISSANCE}}',
    NATIONALITE: '{{NATIONALITE}}',
    NOM_PERE: '{{NOM_PERE}}',
    NOM_MERE: '{{NOM_MERE}}',
    NOM_JEUNE_FILLE: '{{NOM_JEUNE_FILLE}}',
    EST_HOMME: 'EST_HOMME',
    EST_FEMME: 'EST_FEMME'
  }, 'g\u00e9rant', true);

  // Page 2: Co-gérant (conditional)
  body += tag('{{#HAS_DG_1}}');
  body += buildDeclarationPage({
    CIVILITE_NOM_PRENOM: '{{DG_1_CIVILITE_NOM_PRENOM}}',
    ADRESSE: '{{DG_1_ADRESSE}}',
    DATE_NAISSANCE: '{{DG_1_DATE_NAISSANCE}}',
    LIEU_NAISSANCE: '{{DG_1_LIEU_NAISSANCE}}',
    NATIONALITE: '{{DG_1_NATIONALITE}}',
    NOM_PERE: '{{DG_1_NOM_PERE}}',
    NOM_MERE: '{{DG_1_NOM_MERE}}',
    NOM_JEUNE_FILLE: '{{DG_1_NOM_JEUNE_FILLE}}',
    EST_HOMME: 'DG_1_EST_HOMME',
    EST_FEMME: 'DG_1_EST_FEMME'
  }, 'co-g\u00e9rant', false);
  body += tag('{{/HAS_DG_1}}');

  var newXml = beforeBody + body + afterBody;
  verifyAndSave(zip, newXml, path.join(outDir, 'sarl-declaration-non-condamnation.docx'), 'SARL Declaration non-condamnation');
})();


// ════════════════════════════════════════════════════════════
// FILE 4: ATTESTATION DOMICILE
// ════════════════════════════════════════════════════════════
(function buildAttestation() {
  console.log('\n########################################');
  console.log('# Processing: SARL Attestation domicile');
  console.log('########################################');

  var buf = fs.readFileSync(srcPath);
  var zip = new PizZip(buf);
  var origXml = zip.file('word/document.xml').asText();

  var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
  var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

  var body = '';

  body += p('MISE \u00c0 DISPOSITION DE LOCAUX SANS LIMITATION DE DUR\u00c9E', rPrTitle, { center: true, before: 0, after: 360 });

  body += tag('{{#EST_HOMME}}');
  body += p('Le soussign\u00e9 :', rPr, { before: 0, after: 120 });
  body += tag('{{/EST_HOMME}}');
  body += tag('{{#EST_FEMME}}');
  body += p('La soussign\u00e9e :', rPr, { before: 0, after: 120 });
  body += tag('{{/EST_FEMME}}');

  body += p('{{CIVILITE_NOM_PRENOM}},', rPrBold, { before: 0, after: 20 });
  body += tag('{{#EST_HOMME}}');
  body += p('n\u00e9 le {{DATE_NAISSANCE}} \u00e0 {{LIEU_NAISSANCE}},', rPr, { before: 0, after: 20 });
  body += tag('{{/EST_HOMME}}');
  body += tag('{{#EST_FEMME}}');
  body += p('n\u00e9e le {{DATE_NAISSANCE}} \u00e0 {{LIEU_NAISSANCE}},', rPr, { before: 0, after: 20 });
  body += tag('{{/EST_FEMME}}');
  body += p('de nationalit\u00e9 {{NATIONALITE}}, {{SITUATION_MATRIMONIALE}},', rPr, { before: 0, after: 20 });
  body += p('demeurant {{ADRESSE_DIRIGEANT}}.', rPr, { before: 0, after: 240 });

  body += p('Agissant en tant que {{STATUT_OCCUPATION}} de son domicile principal, atteste que celui-ci est mis \u00e0 disposition de :', rPr, { before: 0, after: 120, both: true });

  body += p('{{NOM_SOCIETE}}', rPrBold, { before: 0, after: 20 });
  body += p('{{FORME_LABEL}} au capital de {{CAPITAL}} euros', rPr, { before: 0, after: 20 });
  body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPr, { before: 0, after: 240 });

  body += p('dont il est dirigeant pour y installer son si\u00e8ge social d\u00e8s ce jour, sans limitation de dur\u00e9e afin d\u2019y exercer une activit\u00e9 ne n\u00e9cessitant pas le passage de client\u00e8le ou la r\u00e9ception de marchandises (Article L123-11 du code du commerce).', rPr, { before: 0, after: 360, both: true });

  body += para({ before: 0, after: 360, runs: run('Fait \u00e0 {{VILLE_SIGNATURE}}, le {{DATE_SIGNATURE}}', rPr) });
  body += p('______________________________', rPr, { before: 0, after: 0 });
  body += p('{{CIVILITE_NOM_PRENOM}}', rPrBold, { before: 0, after: 0 });

  var newXml = beforeBody + body + afterBody;
  verifyAndSave(zip, newXml, path.join(outDir, 'sarl-attestation-domicile.docx'), 'SARL Attestation domicile');
})();


// ════════════════════════════════════════════════════════════
// FILE 5: LISTE DES SOUSCRIPTEURS
// ════════════════════════════════════════════════════════════
(function buildListeSouscripteurs() {
  console.log('\n########################################');
  console.log('# Processing: SARL Liste souscripteurs');
  console.log('########################################');

  // Use SASU template for styles
  var saBuf = fs.readFileSync(path.join(outDir, 'sasu-liste-souscripteurs.docx'));
  var zip = new PizZip(saBuf);
  var origXml = zip.file('word/document.xml').asText();

  var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
  var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

  var SZ_NONE = 0, SZ_TINY = 20, SZ_SMALL = 40, SZ_MEDIUM = 120, SZ_LARGE = 240, SZ_XLARGE = 360, SZ_SECTION = 480;

  var body = '';

  // Header
  body += p('{{NOM_SOCIETE}}', rPrTitle, { center: true, before: SZ_NONE, after: SZ_TINY });
  body += p('{{FORME_LABEL}} au capital de {{CAPITAL}} euros', rPrSmall, { center: true, before: SZ_NONE, after: SZ_TINY });
  body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPrSmall, { center: true, before: SZ_NONE, after: SZ_SECTION });

  // Title
  body += p('LISTE DES SOUSCRIPTEURS', rPrSectionTitle, { center: true, before: SZ_NONE, after: SZ_LARGE });

  // Intro (CORRECTED: associés, not actionnaires)
  body += tag('{{#IS_UNIPERSONNELLE}}');
  body += p('L\u2019associ\u00e9 unique soussign\u00e9 :', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  body += tag('{{/IS_UNIPERSONNELLE}}');
  body += tag('{{#IS_PLURIPERSONNELLE}}');
  body += p('Les associ\u00e9s soussign\u00e9s :', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  body += tag('{{/IS_PLURIPERSONNELLE}}');

  // Loop
  body += tag('{{#ASSOCIES}}');

  body += p('{{CIVILITE_NOM_PRENOM}}', rPrBold, { before: SZ_LARGE, after: SZ_TINY });
  body += tag('{{#EST_HOMME}}');
  body += p('N\u00e9 le {{DATE_NAISSANCE}} \u00e0 {{LIEU_NAISSANCE}}, de nationalit\u00e9 {{NATIONALITE}}, {{SITUATION_MATRIMONIALE}}, demeurant {{ADRESSE}}.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  body += tag('{{/EST_HOMME}}');
  body += tag('{{#EST_FEMME}}');
  body += p('N\u00e9e le {{DATE_NAISSANCE}} \u00e0 {{LIEU_NAISSANCE}}, de nationalit\u00e9 {{NATIONALITE}}, {{SITUATION_MATRIMONIALE}}, demeurant {{ADRESSE}}.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  body += tag('{{/EST_FEMME}}');

  // CORRECTED: parts sociales, not actions
  body += p('A souscrit {{NB_PARTS}} parts sociales d\'une valeur nominale de {{VALEUR_NOMINALE}} euro(s), pour un montant total de {{MONTANT_SOUSCRIT}} euros, soit {{PCT_DETENTION}}% du capital.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

  body += p('Apports en num\u00e9raire : {{APPORT_NUMERAIRE}} euros', rPr, { before: SZ_NONE, after: SZ_TINY });

  body += tag('{{#HAS_APPORT_NATURE}}');
  body += p('Apports en nature : {{APPORTS_NATURE}} euros ({{DESC_APPORT_NATURE}})', rPr, { before: SZ_NONE, after: SZ_TINY });
  body += tag('{{/HAS_APPORT_NATURE}}');

  body += p('Lib\u00e9ration : {{PCT_LIBERATION}}% soit {{MONTANT_VERSE}} euros vers\u00e9s, reste \u00e0 lib\u00e9rer : {{RESTE_A_LIBERER}} euros.', rPr, { before: SZ_NONE, after: SZ_NONE });

  body += tag('{{/ASSOCIES}}');

  // Totals
  body += p('Capital total souscrit : {{CAPITAL}} euros', rPrBold, { before: SZ_LARGE, after: SZ_TINY });
  body += p('Total effectivement vers\u00e9 : {{TOTAL_VERSE}} euros', rPr, { before: SZ_NONE, after: SZ_TINY });
  body += p('Total restant \u00e0 lib\u00e9rer : {{TOTAL_RESTE}} euros', rPr, { before: SZ_NONE, after: SZ_LARGE });

  // Bank
  body += p('Le montant des apports en num\u00e9raire a \u00e9t\u00e9 d\u00e9pos\u00e9 aupr\u00e8s de {{NOM_BANQUE}}.', rPr, { before: SZ_NONE, after: SZ_XLARGE });

  // Signature (CORRECTED: associés, not actionnaires)
  body += p('Fait \u00e0 {{VILLE_SOCIETE}}, le {{DATE_SIGNATURE_COURTE}},', rPr, { before: SZ_NONE, after: SZ_XLARGE });
  body += tag('{{#IS_UNIPERSONNELLE}}');
  body += p('Signature de l\u2019associ\u00e9 unique :', rPrBold, { before: SZ_NONE, after: SZ_SMALL });
  body += tag('{{/IS_UNIPERSONNELLE}}');
  body += tag('{{#IS_PLURIPERSONNELLE}}');
  body += p('Signatures des associ\u00e9s :', rPrBold, { before: SZ_NONE, after: SZ_SMALL });
  body += tag('{{/IS_PLURIPERSONNELLE}}');

  for (var n = 1; n <= 10; n++) {
    var sigBefore = n === 1 ? SZ_NONE : SZ_XLARGE;
    body += tag('{{#HAS_ASSOC_' + n + '}}');
    body += p('______________________________', rPr, { before: sigBefore, after: SZ_NONE });
    body += p('{{ACTIONNAIRE_' + n + '}}', rPrBold, { before: SZ_NONE, after: SZ_NONE });
    body += tag('{{/HAS_ASSOC_' + n + '}}');
  }

  var newXml = beforeBody + body + afterBody;

  zip.file('word/document.xml', newXml);
  var outPath = path.join(outDir, 'sarl-liste-souscripteurs.docx');
  fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
  console.log('Saved to', outPath);

  // Verify
  var buf2 = fs.readFileSync(outPath);
  var zip2 = new PizZip(buf2);
  var xml2 = zip2.file('word/document.xml').asText();
  var phs = findPlaceholders(xml2);
  console.log('Placeholders found: ' + phs.length);
  phs.forEach(function(ph) { console.log('  ' + ph); });
})();


console.log('\n========================================');
console.log('All 5 SARL templates processed successfully.');
console.log('========================================');
