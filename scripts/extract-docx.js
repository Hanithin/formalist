const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const dir = '/Users/hanithing/Downloads/SCI (plusieurs associés)';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.docx'));

files.forEach(name => {
  console.log('=== ' + name + ' ===');
  const buf = fs.readFileSync(path.join(dir, name));
  const zip = new PizZip(buf);
  const xml = zip.file('word/document.xml').asText();
  const p = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let m;
  while ((m = p.exec(xml)) !== null) {
    if (m[1].trim()) console.log('  ' + m[1]);
  }
  console.log('');
});
