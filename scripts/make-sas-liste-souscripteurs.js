const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

// Read the SASU template for styles/relationships
const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'sasu-liste-souscripteurs.docx'));
const zip = new PizZip(buf);

// ── Helpers ──────────────────────────────────────────────────
var SZ_NONE = 0;
var SZ_TINY = 20;     // 1pt
var SZ_SMALL = 40;    // 2pt
var SZ_MEDIUM = 120;  // 6pt
var SZ_LARGE = 240;   // 12pt
var SZ_XLARGE = 360;  // 18pt
var SZ_SECTION = 480; // 24pt

var FONT = 'Cambria';
var rPr = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:rtl w:val="0"/></w:rPr>';
var rPrBold = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:rtl w:val="0"/></w:rPr>';
var rPrSmall = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="0"/></w:rPr>';
var rPrTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl w:val="0"/></w:rPr>';
var rPrSectionTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:caps/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rtl w:val="0"/></w:rPr>';

// Hidden paragraph for conditional tags (zero height, invisible)
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
  var before = opts.before != null ? opts.before : SZ_NONE;
  var after = opts.after != null ? opts.after : SZ_SMALL;
  pPr += '<w:spacing w:before="' + before + '" w:after="' + after + '" w:line="276" w:lineRule="auto"/>';
  if (opts.center) pPr += '<w:jc w:val="center"/>';
  if (opts.bottomBorder) {
    pPr += '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="CCCCCC"/></w:pBdr>';
  }
  pPr += '</w:pPr>';
  return '<w:p>' + pPr + (opts.runs || '') + '</w:p>';
}

function p(text, runProps, opts) {
  opts = opts || {};
  opts.runs = run(text, runProps);
  return para(opts);
}

// Hidden tag paragraph (for {{#TAG}} / {{/TAG}})
function tag(text) {
  return '<w:p>' + hiddenPPr + run(text, rPr) + '</w:p>';
}

// ── Build document body ──────────────────────────────────────
var body = '';

// ─── HEADER BLOCK (centered) ───
body += p('{{NOM_SOCIETE}}', rPrTitle, { center: true, before: SZ_NONE, after: SZ_TINY });
body += p('Soci\u00e9t\u00e9 par actions simplifi\u00e9e au capital de {{CAPITAL}} euros', rPrSmall, { center: true, before: SZ_NONE, after: SZ_TINY });
body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPrSmall, { center: true, before: SZ_NONE, after: SZ_SECTION });

// ─── TITLE ───
body += p('LISTE DES SOUSCRIPTEURS', rPrSectionTitle, { center: true, before: SZ_NONE, after: SZ_LARGE });

// ─── INTRO ───
body += p('Les actionnaires soussign\u00e9s :', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

// ─── LOOP: {{#ASSOCIES}} ───
body += tag('{{#ASSOCIES}}');

// Identity (bold name block)
body += p('{{CIVILITE_NOM_PRENOM}}', rPrBold, { before: SZ_LARGE, after: SZ_TINY });
body += p('N\u00e9(e) le {{DATE_NAISSANCE}} \u00e0 {{LIEU_NAISSANCE}}, de nationalit\u00e9 {{NATIONALITE}}, {{SITUATION_MATRIMONIALE}}, demeurant {{ADRESSE}}.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

// Souscription details
body += p('A souscrit {{NB_PARTS}} actions d\'une valeur nominale de {{VALEUR_NOMINALE}} euro(s), pour un montant total de {{MONTANT_SOUSCRIT}} euros, soit {{PCT_DETENTION}}% du capital.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

// Nature des apports
body += p('Apports en num\u00e9raire : {{APPORT_NUMERAIRE}} euros', rPr, { before: SZ_NONE, after: SZ_TINY });

// Conditional: apport en nature
body += tag('{{#HAS_APPORT_NATURE}}');
body += p('Apports en nature : {{APPORTS_NATURE}} euros ({{DESC_APPORT_NATURE}})', rPr, { before: SZ_NONE, after: SZ_TINY });
body += tag('{{/HAS_APPORT_NATURE}}');

// Lib\u00e9ration
body += p('Lib\u00e9ration : {{PCT_LIBERATION}}% soit {{MONTANT_VERSE}} euros vers\u00e9s, reste \u00e0 lib\u00e9rer : {{RESTE_A_LIBERER}} euros.', rPr, { before: SZ_NONE, after: SZ_NONE });

body += tag('{{/ASSOCIES}}');

// ─── TOTALS ───
body += p('Capital total souscrit : {{CAPITAL}} euros', rPrBold, { before: SZ_LARGE, after: SZ_TINY });
body += p('Total effectivement vers\u00e9 : {{TOTAL_VERSE}} euros', rPr, { before: SZ_NONE, after: SZ_TINY });
body += p('Total restant \u00e0 lib\u00e9rer : {{TOTAL_RESTE}} euros', rPr, { before: SZ_NONE, after: SZ_LARGE });

// ─── BANQUE ───
body += p('Le montant des apports en num\u00e9raire a \u00e9t\u00e9 d\u00e9pos\u00e9 aupr\u00e8s de {{NOM_BANQUE}}.', rPr, { before: SZ_NONE, after: SZ_XLARGE });

// ─── SIGNATURE ───
body += p('Fait \u00e0 {{VILLE_SOCIETE}}, le {{DATE_SIGNATURE_COURTE}},', rPr, { before: SZ_NONE, after: SZ_XLARGE });

body += p('Signatures des actionnaires :', rPrBold, { before: SZ_NONE, after: SZ_SMALL });

// Indexed signatures (up to 10)
for (var n = 1; n <= 10; n++) {
  var sigBefore = n === 1 ? SZ_NONE : SZ_XLARGE;
  tag('{{#HAS_ASSOC_' + n + '}}');  // hidden open
  body += tag('{{#HAS_ASSOC_' + n + '}}');
  body += p('______________________________', rPr, { before: sigBefore, after: SZ_NONE });
  body += p('{{ACTIONNAIRE_' + n + '}}', rPrBold, { before: SZ_NONE, after: SZ_NONE });
  body += tag('{{/HAS_ASSOC_' + n + '}}');
}

// ── Assemble final XML ──────────────────────────────────────
var origXml = zip.file('word/document.xml').asText();
var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

var newXml = beforeBody + body + afterBody;

zip.file('word/document.xml', newXml);
var outPath = path.join(__dirname, '..', 'templates', 'sas-liste-souscripteurs.docx');
fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
console.log('Saved to', outPath);

// ── Verify ──────────────────────────────────────────────────
var buf2 = fs.readFileSync(outPath);
var zip2 = new PizZip(buf2);
var xml2 = zip2.file('word/document.xml').asText();
var opens = (xml2.match(/<w:p[ >]/g) || []).length;
var closes = (xml2.match(/<\/w:p>/g) || []).length;
console.log('w:p ' + opens + '/' + closes, opens === closes ? 'OK' : 'MISMATCH');

var placeholders = xml2.match(/\{\{[^}]+\}\}/g);
console.log('Placeholders:', placeholders ? placeholders.length : 0);
