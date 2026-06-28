const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

// Read the original docx to get styles/relationships/etc.
const buf = fs.readFileSync('/Users/hanithing/Downloads/3 - Liste des souscripteurs SASU Formalist.docx');
const zip = new PizZip(buf);

// ── Helpers ──────────────────────────────────────────────────
// Spacing values in twips (1 pt = 20 twips)
var SZ_NONE = 0;
var SZ_SMALL = 40;    // 2pt
var SZ_MEDIUM = 120;  // 6pt
var SZ_LARGE = 240;   // 12pt
var SZ_XLARGE = 360;  // 18pt
var SZ_SECTION = 480; // 24pt — between major sections

var FONT = 'Cambria';
var rPr = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:rtl w:val="0"/></w:rPr>';
var rPrBold = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:rtl w:val="0"/></w:rPr>';
// Smaller font for subtitle/header info
var rPrSmall = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="0"/></w:rPr>';
// Larger font for main title
var rPrTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl w:val="0"/></w:rPr>';
// Medium bold for section headers
var rPrSectionTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:caps/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rtl w:val="0"/></w:rPr>';

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function run(text, runProps) {
  runProps = runProps || rPr;
  return '<w:r>' + runProps + '<w:t xml:space="preserve">' + escapeXml(text) + '</w:t></w:r>';
}

// opts: { center, before, after, runs (raw XML string) }
function para(opts) {
  var pPr = '<w:pPr>';
  // Spacing
  var before = opts.before != null ? opts.before : SZ_NONE;
  var after = opts.after != null ? opts.after : SZ_SMALL;
  pPr += '<w:spacing w:before="' + before + '" w:after="' + after + '" w:line="276" w:lineRule="auto"/>';
  if (opts.center) pPr += '<w:jc w:val="center"/>';
  if (opts.bottomBorder) {
    pPr += '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="000000"/></w:pBdr>';
  }
  pPr += '</w:pPr>';
  return '<w:p>' + pPr + (opts.runs || '') + '</w:p>';
}

// Shorthand: simple text paragraph
function p(text, runProps, opts) {
  opts = opts || {};
  opts.runs = run(text, runProps);
  return para(opts);
}

// ── Build document body ──────────────────────────────────────
var body = '';

// ─── HEADER BLOCK (centered) ───
body += p('{{NOM_SOCIETE}}', rPrTitle, { center: true, before: SZ_NONE, after: SZ_SMALL });
body += p('Soci\u00e9t\u00e9 par actions simplifi\u00e9e unipersonnelle au capital de {{CAPITAL}} euros', rPrSmall, { center: true, before: SZ_NONE, after: SZ_SMALL });
body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPrSmall, { center: true, before: SZ_NONE, after: SZ_SECTION });

// ─── TITLE ───
body += p('LISTE DES SOUSCRIPTEURS', rPrSectionTitle, { center: true, before: SZ_NONE, after: SZ_SECTION });

// ─── INTRO ───
body += p('L\'associ\u00e9 unique soussign\u00e9 :', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

// ─── IDENTITY ───
body += p('{{CIVILITE}} {{NOM}} {{PRENOM}}, n\u00e9(e) le {{DATE_NAISSANCE}} \u00e0 {{LIEU_NAISSANCE}} ({{CODE_POSTAL_NAISSANCE}}) ({{PAYS_NAISSANCE}}), de nationalit\u00e9 {{NATIONALITE}}, {{SITUATION_MATRIMONIALE}}, demeurant {{ADRESSE_PERSO}}.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

// ─── SOUSCRIPTION ───
body += p('a souscrit \u00e0 la totalit\u00e9 des actions composant le capital social, soit :', rPr, { before: SZ_NONE, after: SZ_LARGE });

// ─── DETAILS (tight list) ───
body += p('Nombre d\'actions souscrites : {{NB_PARTS}}', rPr, { before: SZ_NONE, after: SZ_SMALL });
body += p('Valeur nominale : {{VALEUR_NOMINALE_CHIFFRES}} euros', rPr, { before: SZ_NONE, after: SZ_SMALL });
body += p('Montant total de la souscription : {{MONTANT_SOUSCRIT}} euros', rPr, { before: SZ_NONE, after: SZ_SMALL });
body += p('Pourcentage de d\u00e9tention : {{PCT_DETENTION}}%', rPr, { before: SZ_NONE, after: SZ_SECTION });

// ─── NATURE DES APPORTS ───
body += p('Nature des apports :', rPrBold, { before: SZ_NONE, after: SZ_MEDIUM });
body += p('- Apports en num\u00e9raire : {{APPORT_NUMERAIRE}} euros', rPr, { before: SZ_NONE, after: SZ_SMALL });

// Conditional: apport en nature (docxtemplater paragraphLoop)
body += para({
  before: SZ_NONE, after: SZ_SMALL,
  runs: run('{{#HAS_APPORT_NATURE}}- Apports en nature : {{APPORTS_NATURE}} euros', rPr)
});
body += para({
  before: SZ_NONE, after: SZ_NONE,
  runs: run('  Description : {{DESC_APPORT_NATURE}}{{/HAS_APPORT_NATURE}}', rPr)
});

// ─── LIBERATION ───
body += p('Lib\u00e9ration des apports en num\u00e9raire :', rPrBold, { before: SZ_SECTION, after: SZ_MEDIUM });
body += p('- Pourcentage lib\u00e9r\u00e9 \u00e0 la constitution : {{PCT_LIBERATION}}%', rPr, { before: SZ_NONE, after: SZ_SMALL });
body += p('- Montant effectivement vers\u00e9 : {{MONTANT_VERSE}} euros', rPr, { before: SZ_NONE, after: SZ_SMALL });
body += p('- Reste \u00e0 lib\u00e9rer : {{RESTE_A_LIBERER}} euros', rPr, { before: SZ_NONE, after: SZ_SECTION });

// ─── BANQUE ───
body += p('Le montant des apports en num\u00e9raire a \u00e9t\u00e9 d\u00e9pos\u00e9 aupr\u00e8s de {{NOM_BANQUE}}.', rPr, { before: SZ_NONE, after: SZ_XLARGE });

// ─── SIGNATURE ───
body += p('Fait \u00e0 {{VILLE_SOCIETE}}, le {{DATE_SIGNATURE_COURTE}},', rPr, { before: SZ_NONE, after: SZ_XLARGE });
body += p('Signature de l\'actionnaire unique', rPr, { before: SZ_NONE, after: SZ_NONE });
// Signature line: underscores (~200pt wide, just enough for a signature)
body += p('______________________________', rPr, { before: SZ_XLARGE, after: SZ_NONE });

// ── Assemble final XML ──────────────────────────────────────
var origXml = zip.file('word/document.xml').asText();
var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

var newXml = beforeBody + body + afterBody;

zip.file('word/document.xml', newXml);
var outPath = path.join(__dirname, '..', 'templates', 'sasu-liste-souscripteurs.docx');
fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
console.log('Saved to', outPath);

// ── Verify ──────────────────────────────────────────────────
var buf2 = fs.readFileSync(outPath);
var zip2 = new PizZip(buf2);
var xml2 = zip2.file('word/document.xml').asText();
var texts = [];
xml2.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { if (t.trim()) texts.push(t.trim()); });
texts.forEach(function(t, i) { console.log(i + ': ' + t); });
