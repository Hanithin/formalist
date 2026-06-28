const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

// Read source docx for styles/rels
const buf = fs.readFileSync('/Users/hanithing/formalist/templates/sasu-attestation-domicile.docx');
const zip = new PizZip(buf);

// ── Helpers ──────────────────────────────────────────────────
var SZ_NONE = 0;
var SZ_SMALL = 40;    // 2pt
var SZ_MEDIUM = 120;  // 6pt
var SZ_LARGE = 240;   // 12pt
var SZ_SECTION = 360; // 18pt

var FONT = 'Cambria';
var rPr = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:rtl w:val="0"/></w:rPr>';
var rPrBold = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:rtl w:val="0"/></w:rPr>';
var rPrSmall = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="0"/></w:rPr>';
var rPrTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl w:val="0"/></w:rPr>';
var rPrSectionTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:caps/><w:sz w:val="26"/><w:szCs w:val="26"/><w:rtl w:val="0"/></w:rPr>';

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
  pPr += '</w:pPr>';
  return '<w:p>' + pPr + (opts.runs || '') + '</w:p>';
}

function p(text, runProps, opts) {
  opts = opts || {};
  opts.runs = run(text, runProps);
  return para(opts);
}

// ── Build document body ──────────────────────────────────────
var body = '';

// ─── HEADER ───
body += p('{{NOM_SOCIETE}}', rPrTitle, { center: true, before: SZ_NONE, after: SZ_SMALL });
body += p('Soci\u00e9t\u00e9 par actions simplifi\u00e9e unipersonnelle au capital de {{CAPITAL}} euros', rPrSmall, { center: true, before: SZ_NONE, after: SZ_SMALL });
body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPrSmall, { center: true, before: SZ_NONE, after: SZ_SECTION });

// ─── TITLE ───
body += p('ATTESTATION DE DOMICILIATION DU SI\u00c8GE SOCIAL', rPrSectionTitle, { center: true, before: SZ_NONE, after: SZ_SECTION });

// ─── BODY ───
body += p('Je soussign\u00e9(e),', rPrBold, { before: SZ_NONE, after: SZ_MEDIUM });

body += p('{{CIVILITE_NOM_PRENOM_1}}, n\u00e9(e) le {{DATE_NAISSANCE_1}} \u00e0 {{LIEU_NAISSANCE_1}}, de nationalit\u00e9 {{NATIONALITE_1}}, demeurant {{ADRESSE_ASSOCIE_1}},', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

body += p('agissant en qualit\u00e9 de Pr\u00e9sident de la soci\u00e9t\u00e9 {{NOM_SOCIETE}}, soci\u00e9t\u00e9 par actions simplifi\u00e9e unipersonnelle au capital de {{CAPITAL}} euros,', rPr, { before: SZ_NONE, after: SZ_LARGE });

body += p('d\u00e9clare domicilier le si\u00e8ge social de cette soci\u00e9t\u00e9 \u00e0 mon domicile personnel sis :', rPrBold, { before: SZ_NONE, after: SZ_MEDIUM });

body += p('{{ADRESSE_SIEGE}}', rPr, { before: SZ_NONE, after: SZ_LARGE });

body += p('dont je suis {{STATUT_OCCUPATION}}.', rPr, { before: SZ_NONE, after: SZ_LARGE });

// Article de loi
body += p('Cette domiciliation est effectu\u00e9e conform\u00e9ment aux dispositions de l\'article L. 123-11-1 du Code de commerce, pour une dur\u00e9e ne pouvant ni exc\u00e9der cinq (5) ans \u00e0 compter de l\'immatriculation de la soci\u00e9t\u00e9, ni d\u00e9passer le terme l\u00e9gal, contractuel ou judiciaire de l\'occupation des locaux.', rPr, { before: SZ_NONE, after: SZ_LARGE });

body += p('Je certifie sur l\'honneur qu\'aucune disposition l\u00e9gislative ou stipulation contractuelle ne s\'oppose \u00e0 l\'\u00e9tablissement du si\u00e8ge social \u00e0 cette adresse.', rPr, { before: SZ_NONE, after: SZ_LARGE });

body += p('La pr\u00e9sente attestation est \u00e9tablie pour servir et valoir ce que de droit, notamment en vue de l\'immatriculation de la soci\u00e9t\u00e9 au Registre du Commerce et des Soci\u00e9t\u00e9s.', rPr, { before: SZ_NONE, after: SZ_SECTION });

// ─── SIGNATURE ───
body += p('Fait \u00e0 {{VILLE_SOCIETE}}, le {{DATE_SIGNATURE_COURTE}},', rPr, { before: SZ_NONE, after: SZ_SECTION });

body += p('{{CIVILITE_NOM_PRENOM_1}}', rPr, { before: SZ_NONE, after: SZ_NONE });
body += p('Pr\u00e9sident', rPrSmall, { before: SZ_NONE, after: SZ_MEDIUM });
body += p('______________________________', rPr, { before: SZ_LARGE, after: SZ_NONE });

// ── Assemble ────────────────────────────────────────────────
var origXml = zip.file('word/document.xml').asText();
var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

var newXml = beforeBody + body + afterBody;

zip.file('word/document.xml', newXml);
var outPath = path.join(__dirname, '..', 'templates', 'sasu-attestation-domicile.docx');
fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
console.log('Saved to', outPath);

// Verify
var buf2 = fs.readFileSync(outPath);
var zip2 = new PizZip(buf2);
var xml2 = zip2.file('word/document.xml').asText();
var texts = [];
xml2.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { if (t.trim()) texts.push(t.trim()); });
texts.forEach(function(t, i) { console.log(i + ': ' + t); });

// Verify all placeholders are valid
var placeholders = xml2.match(/\{\{[^}]+\}\}/g);
console.log('\nPlaceholders:', placeholders);
