const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

// Read the SASU PV template for styles/relationships
const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'sasu-pv-nomination.docx'));
const zip = new PizZip(buf);

// ── Helpers ──────────────────────────────────────────────────
var SZ_NONE = 0;
var SZ_SMALL = 40;
var SZ_MEDIUM = 120;
var SZ_LARGE = 240;
var SZ_XLARGE = 360;
var SZ_SECTION = 480;

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
body += p('Soci\u00e9t\u00e9 par actions simplifi\u00e9e au capital de {{CAPITAL_CHIFFRES}} euros', rPrSmall, { center: true, before: SZ_NONE, after: SZ_SMALL });
body += p('Si\u00e8ge social : {{SIEGE_SOCIAL}}', rPrSmall, { center: true, before: SZ_NONE, after: SZ_SECTION });

// ─── DATE & PRESENTS ───
body += para({ before: SZ_NONE, after: SZ_MEDIUM, runs: run('Le {{DATE_SIGNATURE_COURTE}} \u00e0 14 heures, sont pr\u00e9sents au si\u00e8ge de la soci\u00e9t\u00e9, les soussign\u00e9s :', rPr) });

// List of present associes (up to 10) — each in its own conditional block
// Use paragraphLoop: opening/closing tags in separate zero-height paragraphs
var hiddenPPr = '<w:pPr><w:spacing w:before="0" w:after="0" w:line="0" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:sz w:val="2"/></w:rPr></w:pPr>';
for (var n = 1; n <= 10; n++) {
  // Opening tag (hidden)
  body += '<w:p>' + hiddenPPr + run('{{#HAS_ASSOC_' + n + '}}', rPr) + '</w:p>';
  // Content
  body += p('- {{CIVILITE_NOM_PRENOM_' + n + '}}, n\u00e9(e) le {{DATE_NAISSANCE_' + n + '}} \u00e0 {{LIEU_NAISSANCE_' + n + '}}, de nationalit\u00e9 {{NATIONALITE_' + n + '}}, {{SITUATION_MATRIMONIALE_' + n + '}}, demeurant {{ADRESSE_ASSOCIE_' + n + '}}, titulaire de {{NB_PARTS_' + n + '}} actions.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  // Closing tag (hidden)
  body += '<w:p>' + hiddenPPr + run('{{/HAS_ASSOC_' + n + '}}', rPr) + '</w:p>';
}

// ─── AG CONSTITUTIVE ───
body += p('Repr\u00e9sentant la totalit\u00e9 des actions afin de participer \u00e0 :', rPr, { before: SZ_MEDIUM, after: SZ_MEDIUM });
body += p('L\'ASSEMBL\u00c9E G\u00c9N\u00c9RALE CONSTITUTIVE', rPrSectionTitle, { center: true, before: SZ_NONE, after: SZ_MEDIUM });

body += para({ before: SZ_NONE, after: SZ_LARGE, runs: run('Dont l\'ordre du jour est :', rPr) });
body += para({ before: SZ_NONE, after: SZ_SECTION, runs: run('Nomination de la pr\u00e9sidence{{#HAS_DG}} et de la direction g\u00e9n\u00e9rale{{/HAS_DG}}', rPrBold) });

// ─── RESOLUTION 1: PRESIDENT ───
body += para({ before: SZ_NONE, after: SZ_MEDIUM, runs: run('{{#HAS_DG}}R\u00c9SOLUTION N\u00b01 :{{/HAS_DG}}{{^HAS_DG}}R\u00c9SOLUTION UNIQUE :{{/HAS_DG}}', rPrSectionTitle) });

body += p('Nomination aux fonctions de pr\u00e9sident telles que d\u00e9finies par la loi et les statuts de la soci\u00e9t\u00e9, \u00e0 compter de ce jour et pour une dur\u00e9e ind\u00e9termin\u00e9e :', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

body += p('- {{CIVILITE}} {{NOM}} {{PRENOM}}, n\u00e9(e) le {{DATE_NAISSANCE}} \u00e0 {{LIEU_NAISSANCE}} ({{CODE_POSTAL_NAISSANCE}}) ({{PAYS_NAISSANCE}}), de nationalit\u00e9 {{NATIONALITE}}, {{SITUATION_MATRIMONIALE}}, demeurant {{ADRESSE_PERSO}}.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

body += p('{{REMUNERATION_PRESIDENT}}', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
body += p('CETTE RESOLUTION EST ADOPTEE A L\'UNANIMITE', rPrBold, { before: SZ_NONE, after: SZ_SECTION });

// ─── RESOLUTION 2: DG (conditional) ───
body += '<w:p>' + hiddenPPr + run('{{#HAS_DG}}', rPr) + '</w:p>';
body += p('R\u00c9SOLUTION N\u00b02 :', rPrSectionTitle, { before: SZ_NONE, after: SZ_MEDIUM });
body += p('Nomination aux fonctions de directeur g\u00e9n\u00e9ral telles que d\u00e9finies par la loi et les statuts de la soci\u00e9t\u00e9, \u00e0 compter de ce jour et pour une dur\u00e9e ind\u00e9termin\u00e9e :', rPr, { before: SZ_NONE, after: SZ_MEDIUM });

// DG blocks (up to 3)
for (var d = 1; d <= 3; d++) {
  var dp = 'DG_' + d + '_';
  body += '<w:p>' + hiddenPPr + run('{{#HAS_DG_' + d + '}}', rPr) + '</w:p>';
  // Physique
  body += '<w:p>' + hiddenPPr + run('{{#' + dp + 'EST_PHYSIQUE}}', rPr) + '</w:p>';
  body += p('- {{' + dp + 'CIVILITE}} {{' + dp + 'NOM}} {{' + dp + 'PRENOM}}, n\u00e9 le {{' + dp + 'DATE_NAISSANCE}} \u00e0 {{' + dp + 'LIEU_NAISSANCE}} ({{' + dp + 'CP_NAISSANCE}}) ({{' + dp + 'PAYS_NAISSANCE}}), de nationalit\u00e9 {{' + dp + 'NATIONALITE}}, {{' + dp + 'SITUATION_MATRIMONIALE}}, demeurant {{' + dp + 'ADRESSE}}.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  body += '<w:p>' + hiddenPPr + run('{{/' + dp + 'EST_PHYSIQUE}}', rPr) + '</w:p>';
  // Morale
  body += '<w:p>' + hiddenPPr + run('{{#' + dp + 'EST_MORALE}}', rPr) + '</w:p>';
  body += p('- La soci\u00e9t\u00e9 {{' + dp + 'SOCIETE_NOM}}, {{' + dp + 'SOCIETE_TYPE}} au capital de {{' + dp + 'SOCIETE_CAPITAL}} euros, immatricul\u00e9e au RCS de {{' + dp + 'SOCIETE_VILLE_RCS}} sous le num\u00e9ro {{' + dp + 'SOCIETE_RCS}}, ayant son si\u00e8ge social au {{' + dp + 'SOCIETE_ADRESSE}}, repr\u00e9sent\u00e9e par {{' + dp + 'REP_CIVILITE}} {{' + dp + 'REP_NOM}} {{' + dp + 'REP_PRENOM}}.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
  body += '<w:p>' + hiddenPPr + run('{{/' + dp + 'EST_MORALE}}', rPr) + '</w:p>';
  body += '<w:p>' + hiddenPPr + run('{{/HAS_DG_' + d + '}}', rPr) + '</w:p>';
}

body += p('{{REMUNERATION_DG}}', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
body += p('CETTE RESOLUTION EST ADOPTEE A L\'UNANIMITE', rPrBold, { before: SZ_NONE, after: SZ_SECTION });
body += '<w:p>' + hiddenPPr + run('{{/HAS_DG}}', rPr) + '</w:p>';

// ─── CLOTURE ───
body += p('Plus rien n\'\u00e9tant \u00e0 l\'ordre du jour, la s\u00e9ance est lev\u00e9e \u00e0 14 heures 30 minutes.', rPr, { before: SZ_NONE, after: SZ_MEDIUM });
body += p('De tout ce que dessus, il est dress\u00e9 le pr\u00e9sent proc\u00e8s-verbal en 4 exemplaires originaux, qui seront sign\u00e9s par tous les intervenants susmentionn\u00e9s.', rPr, { before: SZ_NONE, after: SZ_LARGE });

// ─── SIGNATURE ───
body += para({ before: SZ_NONE, after: SZ_XLARGE, runs: run('Fait \u00e0 {{VILLE_SOCIETE}}, le {{DATE_SIGNATURE_COURTE}}', rPr) });

body += p('Signatures des actionnaires :', rPrBold, { before: SZ_NONE, after: SZ_MEDIUM });

// Indexed signatures (up to 10)
for (var n = 1; n <= 10; n++) {
  var sigBefore = n === 1 ? SZ_NONE : SZ_XLARGE;
  body += '<w:p>' + hiddenPPr + run('{{#HAS_ASSOC_' + n + '}}', rPr) + '</w:p>';
  body += p('______________________________', rPr, { before: sigBefore, after: SZ_NONE });
  body += p('{{ACTIONNAIRE_' + n + '}}', rPrBold, { before: SZ_NONE, after: SZ_NONE });
  body += '<w:p>' + hiddenPPr + run('{{/HAS_ASSOC_' + n + '}}', rPr) + '</w:p>';
}

// DG signatures
for (var d = 1; d <= 3; d++) {
  var dp = 'DG_' + d + '_';
  body += '<w:p>' + hiddenPPr + run('{{#HAS_DG_' + d + '}}', rPr) + '</w:p>';
  // Physique
  body += '<w:p>' + hiddenPPr + run('{{#' + dp + 'EST_PHYSIQUE}}', rPr) + '</w:p>';
  body += p('______________________________', rPr, { before: SZ_XLARGE, after: SZ_NONE });
  body += p('{{' + dp + 'CIVILITE}} {{' + dp + 'NOM}} {{' + dp + 'PRENOM}}', rPrBold, { before: SZ_NONE, after: SZ_NONE });
  body += p('Bon pour acceptation des fonctions de Directeur g\u00e9n\u00e9ral', rPrSmall, { before: SZ_NONE, after: SZ_NONE });
  body += '<w:p>' + hiddenPPr + run('{{/' + dp + 'EST_PHYSIQUE}}', rPr) + '</w:p>';
  // Morale
  body += '<w:p>' + hiddenPPr + run('{{#' + dp + 'EST_MORALE}}', rPr) + '</w:p>';
  body += p('______________________________', rPr, { before: SZ_XLARGE, after: SZ_NONE });
  body += p('{{' + dp + 'SOCIETE_NOM}}, repr\u00e9sent\u00e9e par {{' + dp + 'REP_CIVILITE}} {{' + dp + 'REP_NOM}} {{' + dp + 'REP_PRENOM}}', rPrBold, { before: SZ_NONE, after: SZ_NONE });
  body += p('Bon pour acceptation des fonctions de Directeur g\u00e9n\u00e9ral', rPrSmall, { before: SZ_NONE, after: SZ_NONE });
  body += '<w:p>' + hiddenPPr + run('{{/' + dp + 'EST_MORALE}}', rPr) + '</w:p>';
  body += '<w:p>' + hiddenPPr + run('{{/HAS_DG_' + d + '}}', rPr) + '</w:p>';
}

// ── Assemble final XML ──────────────────────────────────────
var origXml = zip.file('word/document.xml').asText();
var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

var newXml = beforeBody + body + afterBody;

zip.file('word/document.xml', newXml);
var outPath = path.join(__dirname, '..', 'templates', 'sas-pv-nomination.docx');
fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
console.log('Saved to', outPath);

// ── Verify ──────────────────────────────────────────────────
var buf2 = fs.readFileSync(outPath);
var zip2 = new PizZip(buf2);
var xml2 = zip2.file('word/document.xml').asText();
var texts = [];
xml2.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { if (t.trim()) texts.push(t.trim()); });
texts.forEach(function(t, i) { console.log(i + ': ' + t); });
