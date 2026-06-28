const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

// Read the SASU template for styles/relationships
const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'sasu-declaration-non-condamnation.docx'));
const zip = new PizZip(buf);

// ── Helpers ──────────────────────────────────────────────────
var FONT = 'Cambria';
var SZ_NONE = 0;
var SZ_TINY = 20;
var SZ_SMALL = 40;
var SZ_MEDIUM = 120;
var SZ_LARGE = 240;
var SZ_XLARGE = 360;

var rPr = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:rtl w:val="0"/></w:rPr>';
var rPrBold = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:rtl w:val="0"/></w:rPr>';
var rPrSmall = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:rtl w:val="0"/></w:rPr>';
var rPrTitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:rtl w:val="0"/></w:rPr>';
var rPrSubtitle = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="0"/></w:rPr>';

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
  if (opts.both) pPr += '<w:jc w:val="both"/>';
  if (opts.pageBreakBefore) pPr += '<w:pageBreakBefore/>';
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

// Build a declaration page for a given set of field placeholders
function buildDeclarationPage(fields, role, isFirst, societeRepresentee) {
  var body = '';
  var titleOpts = { center: true, before: SZ_NONE, after: SZ_TINY };
  if (!isFirst) titleOpts.pageBreakBefore = true;

  // Title
  body += p('D\u00c9CLARATION DE NON-CONDAMNATION', rPrTitle, titleOpts);
  body += p('souscrite en application de l\u2019article A.123-51 du Code de commerce', rPrSubtitle, { center: true, before: SZ_NONE, after: SZ_XLARGE });

  // Identity — gendered (using EST_HOMME / EST_FEMME conditionals)
  var gH = fields.EST_HOMME; // e.g. "{{EST_HOMME}}" or "{{DG_1_EST_HOMME}}"
  var gF = fields.EST_FEMME;
  // "Je soussigné," or "Je soussignée,"
  body += tag('{{#' + gH + '}}');
  body += p('Je soussign\u00e9,', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  body += tag('{{/' + gH + '}}');
  body += tag('{{#' + gF + '}}');
  body += p('Je soussign\u00e9e,', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  body += tag('{{/' + gF + '}}');

  body += p(fields.CIVILITE_NOM_PRENOM + ',', rPrBold, { before: SZ_NONE, after: SZ_TINY });
  body += p('demeurant ' + fields.ADRESSE + ',', rPr, { before: SZ_NONE, after: SZ_TINY });

  // "né le" or "née le"
  body += tag('{{#' + gH + '}}');
  body += p('n\u00e9 le ' + fields.DATE_NAISSANCE + ' \u00e0 ' + fields.LIEU_NAISSANCE + ',', rPr, { before: SZ_NONE, after: SZ_TINY });
  body += tag('{{/' + gH + '}}');
  body += tag('{{#' + gF + '}}');
  body += p('n\u00e9e le ' + fields.DATE_NAISSANCE + ' \u00e0 ' + fields.LIEU_NAISSANCE + ',', rPr, { before: SZ_NONE, after: SZ_TINY });
  body += tag('{{/' + gF + '}}');

  body += p('de nationalit\u00e9 ' + fields.NATIONALITE + ',', rPr, { before: SZ_NONE, after: SZ_TINY });

  // "fils de" or "fille de"
  body += tag('{{#' + gH + '}}');
  body += p('fils de ' + fields.NOM_PERE + ' et de ' + fields.NOM_MERE + ' n\u00e9e (' + fields.NOM_JEUNE_FILLE + '),', rPr, { before: SZ_NONE, after: SZ_LARGE });
  body += tag('{{/' + gH + '}}');
  body += tag('{{#' + gF + '}}');
  body += p('fille de ' + fields.NOM_PERE + ' et de ' + fields.NOM_MERE + ' n\u00e9e (' + fields.NOM_JEUNE_FILLE + '),', rPr, { before: SZ_NONE, after: SZ_LARGE });
  body += tag('{{/' + gF + '}}');

  // Role
  if (societeRepresentee) {
    body += p('d\u00e9clare, en tant que repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9 ' + societeRepresentee + ', accepter les fonctions de Directeur G\u00e9n\u00e9ral de la soci\u00e9t\u00e9 :', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  } else {
    body += p('d\u00e9clare accepter les fonctions de ' + role + ' de la soci\u00e9t\u00e9 :', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  }
  body += p('{{NOM_SOCIETE}}', rPrBold, { before: SZ_NONE, after: SZ_TINY });
  body += p('Soci\u00e9t\u00e9 par actions simplifi\u00e9e au capital de {{CAPITAL}} euros', rPr, { before: SZ_NONE, after: SZ_TINY });
  body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPr, { before: SZ_NONE, after: SZ_LARGE });

  // Legal text
  body += p('Je d\u00e9clare, en outre, conform\u00e9ment aux dispositions de l\u2019article A.123-51 du Code de commerce, n\u2019avoir jamais fait l\u2019objet d\u2019aucune condamnation p\u00e9nale ni de sanction civile ou administrative de nature \u00e0 m\u2019interdire, soit d\u2019exercer une activit\u00e9 commerciale, soit de g\u00e9rer, d\u2019administrer ou de diriger une personne morale.', rPr, { before: SZ_NONE, after: SZ_XLARGE, both: true });

  // Signature
  body += p('Sign\u00e9e \u00e9lectroniquement le {{DATE_SIGNATURE}} conform\u00e9ment aux dispositions des articles 1366 et suivants du Code civil.', rPr, { before: SZ_NONE, after: SZ_LARGE });
  body += p('______________________________', rPr, { before: SZ_NONE, after: SZ_NONE });
  body += p(fields.CIVILITE_NOM_PRENOM, rPrBold, { before: SZ_NONE, after: SZ_XLARGE });

  // Legal reminder (smaller)
  body += p('Rappel de L 123-5 du Code de Commerce, r\u00e9primant certaines infractions en mati\u00e8re de Registre du Commerce :', rPrSmall, { before: SZ_NONE, after: SZ_TINY });
  body += p('Le fait de donner, de mauvaise foi, des indications inexactes ou incompl\u00e8tes en vue d\u2019une immatriculation, d\u2019une radiation ou d\u2019une mention compl\u00e9mentaire ou rectificative au registre du commerce et des soci\u00e9t\u00e9s est puni d\u2019une amende de 4 500 euros et d\u2019un emprisonnement de six mois.', rPrSmall, { before: SZ_NONE, after: SZ_TINY, both: true });
  body += p('Le tribunal comp\u00e9tent peut, en outre, priver l\u2019int\u00e9ress\u00e9, pendant un temps qui n\u2019exc\u00e8de pas cinq ans, du droit de vote et d\u2019\u00e9ligibilit\u00e9 aux \u00e9lections des tribunaux de commerce, chambres de commerce et d\u2019industrie et conseils de prud\u2019hommes.', rPrSmall, { before: SZ_NONE, after: SZ_NONE, both: true });

  return body;
}

// ── Build document body ──────────────────────────────────────
var body = '';

// Page 1: Président (always present)
body += buildDeclarationPage({
  CIVILITE_NOM_PRENOM: '{{CIVILITE_NOM_PRENOM}}',
  ADRESSE: '{{ADRESSE_PERSO}}',
  DATE_NAISSANCE: '{{DATE_NAISSANCE}}',
  LIEU_NAISSANCE: '{{LIEU_NAISSANCE}}',
  NATIONALITE: '{{NATIONALITE}}',
  NOM_PERE: '{{NOM_PERE}}',
  NOM_MERE: '{{NOM_MERE}}',
  NOM_JEUNE_FILLE: '{{NOM_JEUNE_FILLE}}',
  EST_HOMME: 'EST_HOMME',
  EST_FEMME: 'EST_FEMME'
}, 'Pr\u00e9sident', true);

// Pages 2+: DG declarations
for (var d = 1; d <= 3; d++) {
  var dp = 'DG_' + d + '_';
  body += tag('{{#HAS_DG_' + d + '}}');

  // DG physique: declaration for the DG directly
  body += tag('{{#' + dp + 'EST_PHYSIQUE}}');
  body += buildDeclarationPage({
    CIVILITE_NOM_PRENOM: '{{' + dp + 'CIVILITE_NOM_PRENOM}}',
    ADRESSE: '{{' + dp + 'ADRESSE}}',
    DATE_NAISSANCE: '{{' + dp + 'DATE_NAISSANCE}}',
    LIEU_NAISSANCE: '{{' + dp + 'LIEU_NAISSANCE}}',
    NATIONALITE: '{{' + dp + 'NATIONALITE}}',
    NOM_PERE: '{{' + dp + 'NOM_PERE}}',
    NOM_MERE: '{{' + dp + 'NOM_MERE}}',
    NOM_JEUNE_FILLE: '{{' + dp + 'NOM_JEUNE_FILLE}}',
    EST_HOMME: dp + 'EST_HOMME',
    EST_FEMME: dp + 'EST_FEMME'
  }, 'Directeur g\u00e9n\u00e9ral', false);
  body += tag('{{/' + dp + 'EST_PHYSIQUE}}');

  // DG morale: declaration for the legal representative of the company
  body += tag('{{#' + dp + 'EST_MORALE}}');
  body += buildDeclarationPage({
    CIVILITE_NOM_PRENOM: '{{' + dp + 'CIVILITE_NOM_PRENOM}}',
    ADRESSE: '{{' + dp + 'ADRESSE}}',
    DATE_NAISSANCE: '{{' + dp + 'DATE_NAISSANCE}}',
    LIEU_NAISSANCE: '{{' + dp + 'LIEU_NAISSANCE}}',
    NATIONALITE: '{{' + dp + 'NATIONALITE}}',
    NOM_PERE: '{{' + dp + 'NOM_PERE}}',
    NOM_MERE: '{{' + dp + 'NOM_MERE}}',
    NOM_JEUNE_FILLE: '{{' + dp + 'NOM_JEUNE_FILLE}}',
    EST_HOMME: dp + 'EST_HOMME',
    EST_FEMME: dp + 'EST_FEMME'
  }, null, false, '{{' + dp + 'SOCIETE_NOM}}');
  body += tag('{{/' + dp + 'EST_MORALE}}');

  body += tag('{{/HAS_DG_' + d + '}}');
}

// ── Assemble final XML ──────────────────────────────────────
var origXml = zip.file('word/document.xml').asText();
var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

var newXml = beforeBody + body + afterBody;

zip.file('word/document.xml', newXml);
var outPath = path.join(__dirname, '..', 'templates', 'sas-declaration-non-condamnation.docx');
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
if (placeholders) {
  var unique = [...new Set(placeholders)];
  unique.forEach(function(pl) { console.log('  ' + pl); });
}
