const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

// Read the SASU attestation template and modify it for SAS
const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'sasu-attestation-domicile.docx'));
const zip = new PizZip(buf);
var xml = zip.file('word/document.xml').asText();

// Replace "unipersonnelle" with nothing (SAS, not SASU)
// There are 2 occurrences: header and body text
xml = xml.replace(/unipersonnelle /g, '');
xml = xml.replace(/unipersonnelle/g, '');

zip.file('word/document.xml', xml);
var outPath = path.join(__dirname, '..', 'templates', 'sas-attestation-domicile.docx');
fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
console.log('Saved to', outPath);

// Verify
var buf2 = fs.readFileSync(outPath);
var zip2 = new PizZip(buf2);
var xml2 = zip2.file('word/document.xml').asText();
var texts = [];
xml2.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { if (t.trim()) texts.push(t.trim()); });
texts.forEach(function(t, i) { console.log(i + ': ' + t); });

// Check no "unipersonnelle" remains
if (xml2.indexOf('unipersonnelle') >= 0) {
  console.log('\nWARNING: "unipersonnelle" still present!');
} else {
  console.log('\nOK: no "unipersonnelle" found');
}

// Check placeholders
var placeholders = xml2.match(/\{\{[^}]+\}\}/g);
console.log('Placeholders:', placeholders);
