const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

// Start from working SASU statuts template
const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'sasu-statuts.docx'));
const zip = new PizZip(buf);
var xml = zip.file('word/document.xml').asText();

// ── 1. Replace header: "unipersonnelle" → remove ──
// Header subtitle (appears twice: top header + after soussigné block)
xml = xml.replace(/simplifi\u00e9e unipersonnelle au capital/g, 'simplifi\u00e9e au capital');

// ── 2. Replace "L'ACTIONNAIRE UNIQUE SOUSSIGNÉ" → "LES ACTIONNAIRES SOUSSIGNÉS" ──
xml = xml.replace(/L&#x2019;ACTIONNAIRE UNIQUE SOUSSIGN\u00c9/g, 'LES ACTIONNAIRES SOUSSIGN\u00c9S');
xml = xml.replace(/L\u2019ACTIONNAIRE UNIQUE SOUSSIGN\u00c9/g, 'LES ACTIONNAIRES SOUSSIGN\u00c9S');
// Also try plain text encoding
xml = xml.replace(/>L&apos;ACTIONNAIRE UNIQUE SOUSSIGN\u00c9</g, '>LES ACTIONNAIRES SOUSSIGN\u00c9S<');

// ── 3. Replace "A ÉTABLI" (singular) → "ONT ÉTABLI" (plural) ──
xml = xml.replace(/>A \u00c9TABLI/g, '>ONT \u00c9TABLI');
// Also fix "QU'IL A DÉCIDÉ" → "QU'ILS ONT DÉCIDÉ"
xml = xml.replace(/QU&#x2019;IL A D\u00c9CID\u00c9/g, 'QU&#x2019;ILS ONT D\u00c9CID\u00c9');
xml = xml.replace(/QU\u2019IL A D\u00c9CID\u00c9/g, 'QU\u2019ILS ONT D\u00c9CID\u00c9');

// ── 4. Article 2: Replace "unipersonnelle" and "S.A.S.U." → "simplifiée" and "S.A.S." ──
xml = xml.replace(/simplifi\u00e9e unipersonnelle \u00bb/g, 'simplifi\u00e9e \u00bb');
xml = xml.replace(/simplifi\u00e9e unipersonnelle &#xBB;/g, 'simplifi\u00e9e &#xBB;');
xml = xml.replace(/\u00ab S\.A\.S\.U\. \u00bb/g, '\u00ab S.A.S. \u00bb');
xml = xml.replace(/&#xAB; S\.A\.S\.U\. &#xBB;/g, '&#xAB; S.A.S. &#xBB;');
// Also handle if quotes are in the text directly
xml = xml.replace(/S\.A\.S\.U\./g, 'S.A.S.');

// ── 5. Replace single actionnaire identity paragraph with one <w:p> per associé ──
var identTextPos = xml.indexOf('{{CIVILITE}} {{NOM}} {{PRENOM}}');
if (identTextPos >= 0) {
  // Find the whole <w:p ...>...</w:p> containing this text
  // Must match both <w:p> and <w:p w:rsidR="..."> but NOT <w:pPr>
  var pStart = identTextPos;
  while (pStart > 0) {
    if (xml[pStart] === '<' && xml.substring(pStart, pStart + 4) === '<w:p' && xml[pStart + 4] !== 'P' && xml[pStart + 4] !== 'r') break;
    pStart--;
  }
  var pEnd = xml.indexOf('</w:p>', identTextPos) + '</w:p>'.length;

  // Extract the paragraph's pPr and rPr for reuse
  var pPr = '<w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto" /><w:jc w:val="both" /><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /></w:rPr></w:pPr>';
  var rPrAssoc = '<w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /></w:rPr>';

  // Build separate paragraphs for each associé.
  // Opening/closing tags in their own paragraphs so paragraphLoop can remove them entirely when false.
  var pPrHidden = '<w:pPr><w:spacing w:before="0" w:after="0" w:line="0" w:lineRule="auto" /><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /><w:sz w:val="2"/></w:rPr></w:pPr>';
  var multiParas = '';
  for (var n = 1; n <= 10; n++) {
    var spacingBefore = n === 1 ? '0' : '200';
    var pPrN = '<w:pPr><w:spacing w:before="' + spacingBefore + '" w:after="0" w:line="276" w:lineRule="auto" /><w:jc w:val="both" /><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /></w:rPr></w:pPr>';
    var contentText = '{{CIVILITE_NOM_PRENOM_' + n + '}}, ne\u0301(e) le {{DATE_NAISSANCE_' + n + '}} a\u0300 {{LIEU_NAISSANCE_' + n + '}}, de nationalite\u0301 {{NATIONALITE_' + n + '}}, {{SITUATION_MATRIMONIALE_' + n + '}}, demeurant {{ADRESSE_ASSOCIE_' + n + '}}.';
    // Opening tag paragraph
    multiParas += '<w:p>' + pPrHidden + '<w:r>' + rPrAssoc + '<w:t xml:space="preserve">{{#HAS_ASSOC_' + n + '}}</w:t></w:r></w:p>';
    // Content paragraph
    multiParas += '<w:p>' + pPrN + '<w:r>' + rPrAssoc + '<w:t xml:space="preserve">' + contentText + '</w:t></w:r></w:p>';
    // Closing tag paragraph
    multiParas += '<w:p>' + pPrHidden + '<w:r>' + rPrAssoc + '<w:t xml:space="preserve">{{/HAS_ASSOC_' + n + '}}</w:t></w:r></w:p>';
  }

  xml = xml.substring(0, pStart) + multiParas + xml.substring(pEnd);
  console.log('Replaced identity paragraph with multi-associe paragraphs');
}

// ── 6. Add ville before date: "Le {{DATE_SIGNATURE}}." → "A {{VILLE_SOCIETE}}, le {{DATE_SIGNATURE}}." ──
xml = xml.replace(/>Le <\/w:t>/, '>A {{VILLE_SOCIETE}}, le </w:t>');

// ── 7. Replace signature: "NOM_ACTIONNAIRE" → separate paragraphs per associé ──
// Find the <w:p> containing {{NOM_ACTIONNAIRE}}
var naIdx = xml.indexOf('{{NOM_ACTIONNAIRE}}');
if (naIdx >= 0) {
  var naPStart = naIdx;
  while (naPStart > 0) {
    if (xml[naPStart] === '<' && xml.substring(naPStart, naPStart + 4) === '<w:p' && xml[naPStart + 4] !== 'P' && xml[naPStart + 4] !== 'r') break;
    naPStart--;
  }
  var naPEnd = xml.indexOf('</w:p>', naIdx) + '</w:p>'.length;

  // Also remove the original underscore line paragraph just before
  var beforeNa = xml.substring(Math.max(0, naPStart - 600), naPStart);
  if (beforeNa.indexOf('_____________') >= 0) {
    // Find the <w:p> containing the underscores
    var underEnd = naPStart; // ends right where our NOM_ACTIONNAIRE para starts
    var underStart = underEnd - 1;
    while (underStart > 0) {
      if (xml[underStart] === '<' && xml.substring(underStart, underStart + 4) === '<w:p' && xml[underStart + 4] !== 'P' && xml[underStart + 4] !== 'r') break;
      underStart--;
    }
    naPStart = underStart; // extend to include the underscore paragraph
  }

  var sigRPr = '<w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /><w:b w:val="1" /><w:bCs w:val="1" /><w:rtl w:val="0" /></w:rPr>';
  var sigPPr = '<w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto" /><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /></w:rPr></w:pPr>';
  var sigHiddenPPr = '<w:pPr><w:spacing w:before="0" w:after="0" w:line="0" w:lineRule="auto" /><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /><w:sz w:val="2"/></w:rPr></w:pPr>';

  var sigParas = '';
  var lineRPr = '<w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /><w:rtl w:val="0" /></w:rPr>';
  for (var s = 1; s <= 10; s++) {
    var lineBefore = s === 1 ? '0' : '600';
    var linePPr = '<w:pPr><w:spacing w:before="' + lineBefore + '" w:after="120" w:line="276" w:lineRule="auto" /><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /></w:rPr></w:pPr>';
    var namePPr = '<w:pPr><w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto" /><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria" /></w:rPr></w:pPr>';
    // Opening tag
    sigParas += '<w:p>' + sigHiddenPPr + '<w:r>' + sigRPr + '<w:t xml:space="preserve">{{#HAS_ASSOC_' + s + '}}</w:t></w:r></w:p>';
    // Signature line (______)
    sigParas += '<w:p>' + linePPr + '<w:r>' + lineRPr + '<w:t xml:space="preserve">______________________________________</w:t></w:r></w:p>';
    // Name
    sigParas += '<w:p>' + namePPr + '<w:r>' + sigRPr + '<w:t xml:space="preserve">{{ACTIONNAIRE_' + s + '}}</w:t></w:r></w:p>';
    // Closing tag
    sigParas += '<w:p>' + sigHiddenPPr + '<w:r>' + sigRPr + '<w:t xml:space="preserve">{{/HAS_ASSOC_' + s + '}}</w:t></w:r></w:p>';
  }

  xml = xml.substring(0, naPStart) + sigParas + xml.substring(naPEnd);
  console.log('Replaced signature with multi-associe paragraphs');
}

// ── 6b. Add spacing after "ARTICLE 6 - Apports" title ──
// The original has w:after="0" on the Article 6 title paragraph — add spacing
var art6Idx = xml.indexOf('ARTICLE 6 - Apports');
if (art6Idx >= 0) {
  // Find the <w:spacing in the pPr before this text
  var art6PStart = art6Idx;
  while (art6PStart > 0) {
    if (xml[art6PStart] === '<' && xml.substring(art6PStart, art6PStart + 4) === '<w:p' && xml[art6PStart + 4] !== 'P' && xml[art6PStart + 4] !== 'r') break;
    art6PStart--;
  }
  var art6Chunk = xml.substring(art6PStart, art6Idx);
  // Replace w:after="0" with w:after="200" in this paragraph only
  var newChunk = art6Chunk.replace(/w:after="0"/, 'w:after="200"');
  xml = xml.substring(0, art6PStart) + newChunk + xml.substring(art6Idx);
  console.log('Added spacing after Article 6 title');
}

// ── 7. Catch any remaining "unipersonnelle" ──
xml = xml.replace(/unipersonnelle /g, '');
xml = xml.replace(/unipersonnelle/g, '');

// ── 7b. Rebuild banque section with clean hidden tag paragraphs ──
// The original template has empty paragraphs and bookmarks that cause extra spacing
(function() {
  var bShineOpen = xml.indexOf('{{#BANQUE_SHINE}}');
  var bAutreClose = xml.indexOf('{{/BANQUE_AUTRE}}');
  if (bShineOpen < 0 || bAutreClose < 0) { console.log('Banque section not found, skipping'); return; }

  // Find the <w:p> containing {{#BANQUE_SHINE}}
  var secStart = bShineOpen;
  while (secStart > 0) {
    if (xml[secStart] === '<' && xml.substring(secStart, secStart + 4) === '<w:p' && xml[secStart + 4] !== 'P' && xml[secStart + 4] !== 'r') break;
    secStart--;
  }
  // Also remove the empty paragraph just before (separator between Article 6 text and banque blocks)
  var beforeSec = xml.substring(Math.max(0, secStart - 500), secStart);
  var lastPEnd = beforeSec.lastIndexOf('</w:p>');
  if (lastPEnd >= 0) {
    // Check if this preceding paragraph is empty (no text content)
    var prevPStart = lastPEnd;
    while (prevPStart > 0) {
      var ch = beforeSec[prevPStart];
      if (ch === '<' && beforeSec.substring(prevPStart, prevPStart + 4) === '<w:p' && beforeSec[prevPStart + 4] !== 'P' && beforeSec[prevPStart + 4] !== 'r') break;
      prevPStart--;
    }
    var prevPXml = beforeSec.substring(prevPStart, lastPEnd + '</w:p>'.length);
    if (prevPXml.indexOf('<w:t') < 0) {
      // It's an empty paragraph — include it in the removal
      secStart = secStart - (beforeSec.length - prevPStart);
    }
  }

  // Find end: </w:p> after {{/BANQUE_AUTRE}}
  var secEnd = xml.indexOf('</w:p>', bAutreClose) + '</w:p>'.length;
  // Also remove empty paragraphs right after the section
  while (true) {
    var afterSec = xml.substring(secEnd, secEnd + 500);
    if (afterSec.indexOf('<w:p') === 0 || afterSec.indexOf('<w:p ') < 10) {
      var nextPEnd = xml.indexOf('</w:p>', secEnd) + '</w:p>'.length;
      var nextP = xml.substring(secEnd, nextPEnd);
      if (nextP.indexOf('<w:t') < 0) {
        secEnd = nextPEnd; // empty paragraph, include in removal
      } else break;
    } else break;
  }

  // Build clean banque section
  var bFont = 'Cambria';
  var bRPr = '<w:rPr><w:rFonts w:ascii="' + bFont + '" w:cs="' + bFont + '" w:eastAsia="' + bFont + '" w:hAnsi="' + bFont + '"/><w:rtl w:val="0"/></w:rPr>';
  var bHiddenPPr = '<w:pPr><w:spacing w:before="0" w:after="0" w:line="0" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="' + bFont + '" w:cs="' + bFont + '" w:eastAsia="' + bFont + '" w:hAnsi="' + bFont + '"/><w:sz w:val="2"/></w:rPr></w:pPr>';
  var bContentPPr = '<w:pPr><w:spacing w:after="480" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="' + bFont + '" w:cs="' + bFont + '" w:eastAsia="' + bFont + '" w:hAnsi="' + bFont + '"/></w:rPr></w:pPr>';

  function bTag(text) {
    return '<w:p>' + bHiddenPPr + '<w:r>' + bRPr + '<w:t xml:space="preserve">' + text + '</w:t></w:r></w:p>';
  }
  function bPara(text) {
    return '<w:p>' + bContentPPr + '<w:r>' + bRPr + '<w:t xml:space="preserve">' + text + '</w:t></w:r></w:p>';
  }

  var newBanque = '';

  // SHINE
  newBanque += bTag('{{#BANQUE_SHINE}}');
  newBanque += bPara("Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par chacun des associ\u00e9s, sur le compte ouvert au nom de la Soci\u00e9t\u00e9 en formation aupr\u00e8s de l\u2019\u00e9tude notariale de Ma\u00eetre Quentin Fourez, situ\u00e9e 1, place Mar\u00e9chal Gallieni, 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.");
  newBanque += bTag('{{/BANQUE_SHINE}}');

  // REVOLUT
  newBanque += bTag('{{#BANQUE_REVOLUT}}');
  newBanque += bPara("Lesdites actions souscrites sont toutes int\u00e9gralement lib\u00e9r\u00e9es, ainsi qu\u2019il r\u00e9sulte du certificat du d\u00e9positaire \u00e9tabli pr\u00e9alablement \u00e0 la date des pr\u00e9sents statuts par l\u2019\u00e9tude notariale de Ma\u00eetre Quentin Fourez, situ\u00e9e 1, place Mar\u00e9chal Gallieni - 27500 Pont-Audemer. Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par chacun des associ\u00e9s, sur le compte ouvert au nom de la Soci\u00e9t\u00e9 en formation aupr\u00e8s de l\u2019\u00e9tude notariale de Ma\u00eetre Quentin FOUREZ, situ\u00e9e 1 place Mar\u00e9chal Gallieni, 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.");
  newBanque += bTag('{{/BANQUE_REVOLUT}}');

  // QONTO
  newBanque += bTag('{{#BANQUE_QONTO}}');
  newBanque += bPara("Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par Qonto, soci\u00e9t\u00e9 Olinda SAS, d\u00fbment mandat\u00e9e \u00e0 cet effet par chacun des associ\u00e9s, sur le compte ouvert au nom de la soci\u00e9t\u00e9 en formation aupr\u00e8s de Etude Notariale De Ma\u00eetre Quentin Fourez Notaires \u00e0 1 Place Marechal Gallieni 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.");
  newBanque += bTag('{{/BANQUE_QONTO}}');

  // AUTRE
  newBanque += bTag('{{#BANQUE_AUTRE}}');
  newBanque += bPara("La somme de {{CAPITAL_LETTRES}} euros ({{CAPITAL_CHIFFRES}} \u20ac) correspondant \u00e0 la lib\u00e9ration de la totalit\u00e9 des apports, a \u00e9t\u00e9 d\u00e9pos\u00e9e au cr\u00e9dit d\u2019un compte ouvert au nom de la Soci\u00e9t\u00e9 en formation \u00e0 la Banque {{NOM_BANQUE}}, situ\u00e9e {{ADRESSE_BANQUE}}, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli conform\u00e9ment \u00e0 la loi et d\u00e9livr\u00e9 par ladite banque.");
  newBanque += bTag('{{/BANQUE_AUTRE}}');

  xml = xml.substring(0, secStart) + newBanque + xml.substring(secEnd);
  console.log('Rebuilt banque section with hidden tag paragraphs');
})();

// ── 8. Merge split tags across XML runs ──
// The SASU template has tags like {{NOM_ in one <w:t> and SOCIETE}} in another.
// Docxtemplater can't parse split tags, so we merge adjacent <w:r> runs.
// Strategy: repeatedly merge any <w:t> ending with {{ partial into the next <w:t>
function mergeRunsWithSplitTags(xmlStr) {
  // Pattern: a <w:t> contains a partial {{ tag (has {{ but no matching }})
  // followed by </w:t></w:r><w:r>...<w:t>...</w:t> that completes it
  // We merge by removing the run boundary and combining text content
  var changed = true;
  var iterations = 0;
  while (changed && iterations < 50) {
    changed = false;
    iterations++;
    // Match: text with unclosed {{ followed by run break then next text
    xmlStr = xmlStr.replace(
      /(<w:t[^>]*>)([^<]*\{\{[^}<]*)(<\/w:t><\/w:r>\s*<w:r>(?:<w:rPr>[^]*?<\/w:rPr>)?<w:t[^>]*>)([^<]*)/g,
      function(match, openTag, text1, middle, text2) {
        // Only merge if text1 has an unclosed {{ (more {{ than }})
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
  console.log('Tag merge iterations:', iterations);
  return xmlStr;
}
xml = mergeRunsWithSplitTags(xml);

// ── Save ──
zip.file('word/document.xml', xml);
var outPath = path.join(__dirname, '..', 'templates', 'sas-statuts.docx');
fs.writeFileSync(outPath, zip.generate({ type: 'nodebuffer' }));
console.log('Saved to', outPath);

// ── Verify ──
var buf2 = fs.readFileSync(outPath);
var zip2 = new PizZip(buf2);
var xml2 = zip2.file('word/document.xml').asText();
var texts = [];
xml2.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { if (t.trim()) texts.push(t.trim()); });

// Check for issues
var hasUnipersonnelle = xml2.indexOf('unipersonnelle') >= 0;
var hasSASU = xml2.indexOf('S.A.S.U') >= 0;
var brokenPlaceholders = xml2.match(/\{\{[A-Z_0-9]+\}(?!\})/g);

console.log('\n--- Verification ---');
console.log('Has "unipersonnelle":', hasUnipersonnelle);
console.log('Has "S.A.S.U":', hasSASU);
console.log('Broken placeholders:', brokenPlaceholders ? brokenPlaceholders.length : 0);

// Show first 40 text nodes
console.log('\n--- First 40 text nodes ---');
for (var i = 0; i < Math.min(40, texts.length); i++) {
  console.log(i + ': ' + texts[i]);
}
console.log('...');
console.log('Total text nodes:', texts.length);

// Show all placeholders
var placeholders = xml2.match(/\{\{[^}]+\}\}/g);
console.log('\nAll placeholders:', placeholders ? placeholders.length : 0);
if (placeholders) {
  var unique = [...new Set(placeholders)];
  unique.forEach(function(p) { console.log('  ' + p); });
}
