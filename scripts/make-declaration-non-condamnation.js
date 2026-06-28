const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const buf = fs.readFileSync('/Users/hanithing/Downloads/4 - Déclaration de non comdamnation - SASU FORMALIST.docx');
const zip = new PizZip(buf);
let xml = zip.file('word/document.xml').asText();

// Replace highlighted values with template placeholders
// P3: "Monsieur AYARI Issam," → {{CIVILITE_NOM_PRENOM_1}},
xml = xml.replace('>Monsieur AYARI Issam,<', '>{{CIVILITE_NOM_PRENOM_1}},<');

// P5: address
xml = xml.replace(/63 Boulevard Des Provinces, 69110 Sainte-Foy-L[èe\u0300]s-Lyon/, '{{ADRESSE_ASSOCIE_1}}');

// P8: date naissance "4 décembre 1977"
xml = xml.replace('>4 d\u00e9cembre 1977<', '>{{DATE_NAISSANCE_1}}<');

// P10: lieu naissance "Belfort (90)"
xml = xml.replace('>Belfort (90)<', '>{{LIEU_NAISSANCE_1}}<');

// P12: nationalité "française"
xml = xml.replace('>fran\u00e7aise<', '>{{NATIONALITE_1}}<');

// P14: père "[-]" (first occurrence)
xml = xml.replace('>[-]<', '>{{NOM_PERE_1}}<');

// P16: mère "[-]" (second occurrence, now first after previous replace)
xml = xml.replace('>[-]<', '>{{NOM_MERE_1}}<');

// P19: nom de jeune fille
xml = xml.replace('>nom de jeune fille<', '>{{NOM_JEUNE_FILLE}}<');

// P22: NOM DE LA SOCIÉTÉ
xml = xml.replace('>NOM DE LA SOCI\u00c9T\u00c9<', '>{{NOM_SOCIETE}}<');

// P24: capital "1.000"
xml = xml.replace('>1.000<', '>{{CAPITAL}}<');

// P27: adresse siège
xml = xml.replace('>5-7, rue de Monttessuy, 75007 Paris<', '>{{ADRESSE_SIEGE}}<');

// P30: DATE
xml = xml.replace('>DATE<', '>{{DATE_SIGNATURE}}<');

// P33: signature name "Monsieur AYARI Issam"
xml = xml.replace('>Monsieur AYARI Issam<', '>{{CIVILITE_NOM_PRENOM_1}}<');

// Remove all yellow highlights
xml = xml.replace(/<w:highlight w:val="yellow"\/>/g, '');

zip.file('word/document.xml', xml);
const outPath = path.join(__dirname, '..', 'templates', 'sasu-declaration-non-condamnation.docx');
fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
console.log('Saved to', outPath);

// Verify
const buf2 = fs.readFileSync(outPath);
const zip2 = new PizZip(buf2);
const xml2 = zip2.file('word/document.xml').asText();
const texts = [];
xml2.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { if (t.trim()) texts.push(t.trim()); });
texts.forEach(function(t, i) { console.log(i + ': ' + t); });

// Verify no yellow highlights remain
const highlights = xml2.match(/<w:highlight w:val="yellow"\/>/g);
console.log('\nYellow highlights remaining:', highlights ? highlights.length : 0);
