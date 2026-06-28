const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

var srcDir = path.join(__dirname, '..', '..', 'Downloads', 'SCI (plusieurs associés)');
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

function extractTexts(xml) {
  var texts = [];
  xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { if (t.trim()) texts.push(t.trim()); });
  return texts;
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

  // Re-read and verify
  var buf2 = fs.readFileSync(outPath);
  var zip2 = new PizZip(buf2);
  var xml2 = zip2.file('word/document.xml').asText();
  var phs = findPlaceholders(xml2);
  console.log('Placeholders found: ' + phs.length);
  phs.forEach(function(p) { console.log('  ' + p); });

  // Check for broken tags
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

// Find the <w:p> containing text, return { start, end }
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


// ════════════════════════════════════════════════════════════
// FILE 1: STATUTS
// ════════════════════════════════════════════════════════════
(function buildStatuts() {
  console.log('\n########################################');
  console.log('# Processing: SCI Statuts');
  console.log('########################################');

  var buf = fs.readFileSync(path.join(srcDir, '1 - Statuts et état des actes - SCI.docx'));
  var zip = new PizZip(buf);
  var xml = zip.file('word/document.xml').asText();

  // ── Simple text replacements ──
  // Company name (all occurrences)
  xml = xml.replace(/NOM DE LA SOCI[EÉ]T[EÉ]/g, '{{NOM_SOCIETE}}');
  xml = xml.replace(/SCI NOM DE LA SOCIETE/g, '{{NOM_SOCIETE_COMPLET}}');
  // Fix: the previous replace may have created SCI {{NOM_SOCIETE}} from "SCI NOM DE LA SOCIETE"
  // Undo and redo in correct order
  // Actually, let's be more precise. Reset and do it in order.
  // Re-read
  xml = zip.file('word/document.xml').asText();

  // First replace the full "SCI NOM DE LA SOCIETE" before replacing the shorter version
  xml = xml.replace(/SCI NOM DE LA SOCIETE/g, '{{NOM_SOCIETE_COMPLET}}');
  // Now replace remaining occurrences
  xml = xml.replace(/NOM DE LA SOCI[EÉ]T[EÉ]/g, '{{NOM_SOCIETE}}');

  // Siege address (the second occurrence "2 rue Savaron..." is the article 4 address)
  // Header siege
  xml = xml.replace(/5-7, rue de Monttessuy, 75007 Paris/g, '{{ADRESSE_SIEGE}}');
  xml = xml.replace(/2 rue Savaron, 63200 Saint-Bonnet-Pr[eè]s-Riom/g, '{{ADRESSE_SIEGE}}');

  // Duration
  xml = xml.replace(/>99<\/w:t>/g, '>{{DUREE}}</w:t>');
  // Also try with space
  xml = xml.replace(/>99 </g, '>{{DUREE}} <');

  // Bank name and address
  xml = xml.replace(/NOM DE LA BANQUE/g, '{{NOM_BANQUE}}');
  xml = xml.replace(/80 Boulevard Auguste Blanqui [–\u2013] 75013 Paris/g, '{{ADRESSE_BANQUE}}');
  xml = xml.replace(/80 Boulevard Auguste Blanqui/g, '{{ADRESSE_BANQUE}}');

  // Exercise closing date - "31 décembre 2023" -> "{{DATE_CLOTURE}}"
  xml = xml.replace(/31 d[eé]cembre 2023/g, '{{DATE_CLOTURE}}');

  // Signature location and date
  xml = xml.replace(/VILLE du si[eè]ge/g, '{{VILLE_SIGNATURE}}');
  xml = xml.replace(/\[__\] janvier 2024/g, '{{DATE_SIGNATURE}}');

  // ── Replace the "Si Shine/Revolut/qonto/autre" bank section with conditional blocks ──
  var siShineIdx = xml.indexOf('Si Shine');
  var siAutreEnd = xml.indexOf('ladite banque.');
  if (siShineIdx > 0 && siAutreEnd > 0) {
    // Find the paragraph containing "Si Shine:"
    var bankSecStart = findParagraphContaining(xml, 'Si Shine');
    // Find the paragraph ending after "ladite banque."
    var bankSecEndPara = findParagraphContaining(xml, 'ladite banque.');

    if (bankSecStart && bankSecEndPara) {
      var bContentPPr = '<w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/></w:rPr></w:pPr>';

      function bPara(text) {
        return '<w:p>' + bContentPPr + '<w:r>' + rPr + '<w:t xml:space="preserve">' + text + '</w:t></w:r></w:p>';
      }

      var newBanque = '';

      // SHINE
      newBanque += tag('{{#BANQUE_SHINE}}');
      newBanque += bPara("Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par chacun des associ\u00e9s, sur le compte ouvert au nom de la Soci\u00e9t\u00e9 en formation aupr\u00e8s de l\u2019\u00e9tude notariale de Ma\u00eetre Quentin Fourez, situ\u00e9e 1, place Mar\u00e9chal Gallieni, 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.");
      newBanque += tag('{{/BANQUE_SHINE}}');

      // REVOLUT
      newBanque += tag('{{#BANQUE_REVOLUT}}');
      newBanque += bPara("Lesdites parts souscrites sont toutes int\u00e9gralement lib\u00e9r\u00e9es, ainsi qu\u2019il r\u00e9sulte du certificat du d\u00e9positaire \u00e9tabli pr\u00e9alablement \u00e0 la date des pr\u00e9sents statuts par l\u2019\u00e9tude notariale de Ma\u00eetre Quentin Fourez, situ\u00e9e 1, place Mar\u00e9chal Gallieni - 27500 Pont-Audemer. Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par chacun des associ\u00e9s, sur le compte ouvert au nom de la Soci\u00e9t\u00e9 en formation aupr\u00e8s de l\u2019\u00e9tude notariale de Ma\u00eetre Quentin FOUREZ, situ\u00e9e 1 place Mar\u00e9chal Gallieni, 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.");
      newBanque += tag('{{/BANQUE_REVOLUT}}');

      // QONTO
      newBanque += tag('{{#BANQUE_QONTO}}');
      newBanque += bPara("Les fonds correspondants aux apports en num\u00e9raire ont \u00e9t\u00e9 d\u00e9pos\u00e9s par Qonto, soci\u00e9t\u00e9 Olinda SAS, d\u00fbment mandat\u00e9e \u00e0 cet effet par chacun des associ\u00e9s, sur le compte ouvert au nom de la soci\u00e9t\u00e9 en formation aupr\u00e8s de Etude Notariale De Ma\u00eetre Quentin Fourez Notaires \u00e0 1 Place Marechal Gallieni 27500 Pont-Audemer, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli par le notaire d\u00e9positaire des fonds, sur pr\u00e9sentation notamment de l\u2019\u00e9tat des souscriptions mentionnant la somme vers\u00e9e par les associ\u00e9s. L\u2019\u00e9tat des souscriptions joint aux pr\u00e9sents statuts est certifi\u00e9 sinc\u00e8re et v\u00e9ritable par le repr\u00e9sentant l\u00e9gal de la soci\u00e9t\u00e9.");
      newBanque += tag('{{/BANQUE_QONTO}}');

      // AUTRE
      newBanque += tag('{{#BANQUE_AUTRE}}');
      newBanque += bPara("Les soussign\u00e9s ont consenti \u00e0 la Soci\u00e9t\u00e9 un apport en num\u00e9raire d\u2019un montant de {{CAPITAL_LETTRES}} euros ({{CAPITAL}} \u20ac), lib\u00e9r\u00e9 en totalit\u00e9 \u00e0 la constitution. La somme de {{CAPITAL_LETTRES}} euros ({{CAPITAL}} \u20ac) correspondant \u00e0 la lib\u00e9ration de la totalit\u00e9 des apports, a \u00e9t\u00e9 d\u00e9pos\u00e9e au cr\u00e9dit d\u2019un compte ouvert au nom de la Soci\u00e9t\u00e9 en formation \u00e0 la Banque {{NOM_BANQUE}}, situ\u00e9e {{ADRESSE_BANQUE}}, ainsi qu\u2019il r\u00e9sulte du certificat \u00e9tabli conform\u00e9ment \u00e0 la loi et d\u00e9livr\u00e9 par ladite banque.");
      newBanque += tag('{{/BANQUE_AUTRE}}');

      xml = xml.substring(0, bankSecStart.start) + newBanque + xml.substring(bankSecEndPara.end);
      console.log('Replaced bank section with conditional blocks');
    }
  }

  // ── Replace Article 7 capital section ──
  // Find "Le capital social est fixé à" and replace up to "libérée"
  var capStart = findParagraphContaining(xml, 'Le capital social est fix');
  if (capStart) {
    // This paragraph contains capital amount, parts count, etc.
    // Find end: the paragraph containing "libérée"
    var capEndPara = findParagraphContaining(xml, 'lib\u00e9r\u00e9e');
    if (!capEndPara) capEndPara = findParagraphContaining(xml, 'libérée');
    // If same paragraph, just replace text content
    // Build a clean replacement paragraph
    var capPPr = '<w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/></w:rPr></w:pPr>';
    var capText = "Le capital social est fix\u00e9 \u00e0 {{CAPITAL_LETTRES}} euros ({{CAPITAL}} \u20ac), divis\u00e9 en {{NB_PARTS_LETTRES}} ({{NB_PARTS}}) parts sociales d\u2019{{VALEUR_NOMINALE_LETTRES}} {{VALEUR_NOMINALE_UNITE}} ({{VALEUR_NOMINALE}} \u20ac) de valeur nominale, int\u00e9gralement lib\u00e9r\u00e9es.";
    var newCapPara = '<w:p>' + capPPr + '<w:r>' + rPr + '<w:t xml:space="preserve">' + capText + '</w:t></w:r></w:p>';

    // Add per-associate distribution
    var distParas = '';
    for (var n = 1; n <= 10; n++) {
      distParas += tag('{{#HAS_ASSOC_' + n + '}}');
      distParas += '<w:p>' + capPPr + '<w:r>' + rPr + '<w:t xml:space="preserve">- {{CIVILITE_NOM_PRENOM_' + n + '}} : {{NB_PARTS_' + n + '}} parts sociales, num\u00e9rot\u00e9es de {{PARTS_DE_' + n + '}} \u00e0 {{PARTS_A_' + n + '}}.</w:t></w:r></w:p>';
      distParas += tag('{{/HAS_ASSOC_' + n + '}}');
    }

    if (capEndPara && capEndPara.end > capStart.start) {
      xml = xml.substring(0, capStart.start) + newCapPara + distParas + xml.substring(capEndPara.end);
      console.log('Replaced Article 7 capital section');
    }
  }

  // ── Replace the associate identity block ──
  // The source has "(Si l'associé est une société)" and "(Si l'associé est une personne physique)"
  // Then "ONT ÉTABLI..."
  // Replace from "(Si l'associé est une société)" through just before "ONT ÉTABLI"
  var assocBlockStart = findParagraphContaining(xml, "Si l\u2019associ");
  if (!assocBlockStart) assocBlockStart = findParagraphContaining(xml, "Si l'associ");
  var ontEtabli = findParagraphContaining(xml, 'ONT \u00c9TABLI');
  if (!ontEtabli) ontEtabli = findParagraphContaining(xml, 'ONT ÉTABLI');
  if (!ontEtabli) ontEtabli = findParagraphContaining(xml, 'ONT ETABLI');

  if (assocBlockStart && ontEtabli) {
    var assocPPr = '<w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/></w:rPr></w:pPr>';

    var multiAssoc = '';
    for (var n = 1; n <= 10; n++) {
      var spaceBefore = n === 1 ? '0' : '200';
      var aPPr = '<w:pPr><w:spacing w:before="' + spaceBefore + '" w:after="0" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/></w:rPr></w:pPr>';

      multiAssoc += tag('{{#HAS_ASSOC_' + n + '}}');

      // Personne morale (conditional)
      multiAssoc += tag('{{#ASSOC_' + n + '_EST_MORALE}}');
      multiAssoc += '<w:p>' + aPPr + '<w:r>' + rPr + '<w:t xml:space="preserve">{{ASSOC_' + n + '_SOCIETE_NOM}}, {{ASSOC_' + n + '_SOCIETE_FORME}} au capital de {{ASSOC_' + n + '_SOCIETE_CAPITAL}} euros, dont le si\u00e8ge social est situ\u00e9 {{ASSOC_' + n + '_SOCIETE_ADRESSE}}, immatricul\u00e9e au registre du commerce et des soci\u00e9t\u00e9s de {{ASSOC_' + n + '_SOCIETE_RCS_VILLE}} sous le num\u00e9ro {{ASSOC_' + n + '_SOCIETE_SIREN}}, repr\u00e9sent\u00e9e par son dirigeant, {{ASSOC_' + n + '_SOCIETE_REP}}, ayant tous pouvoirs \u00e0 l\u2019effet des pr\u00e9sentes,</w:t></w:r></w:p>';
      multiAssoc += tag('{{/ASSOC_' + n + '_EST_MORALE}}');

      // Personne physique (conditional)
      multiAssoc += tag('{{#ASSOC_' + n + '_EST_PHYSIQUE}}');
      var physText = '{{CIVILITE_NOM_PRENOM_' + n + '}}, n\u00e9(e) le {{DATE_NAISSANCE_' + n + '}} \u00e0 {{LIEU_NAISSANCE_' + n + '}}, de nationalit\u00e9 {{NATIONALITE_' + n + '}}, {{SITUATION_MATRIMONIALE_' + n + '}}, demeurant {{ADRESSE_ASSOCIE_' + n + '}}.';
      multiAssoc += '<w:p>' + aPPr + '<w:r>' + rPr + '<w:t xml:space="preserve">' + physText + '</w:t></w:r></w:p>';
      multiAssoc += tag('{{/ASSOC_' + n + '_EST_PHYSIQUE}}');

      multiAssoc += tag('{{/HAS_ASSOC_' + n + '}}');
    }

    xml = xml.substring(0, assocBlockStart.start) + multiAssoc + xml.substring(ontEtabli.start);
    console.log('Replaced associate identity block with conditional per-associate paragraphs');
  }

  // ── Replace the second header block (after "ONT ÉTABLI") ──
  // "NOM DE LA SOCIÉTÉ" / "Société civile au capital de" / "1.000" / "euros" / "Siège social :"
  // This sub-header already has {{NOM_SOCIETE}} from earlier replacement. 
  // Replace "1.000" near "Société civile au capital" with {{CAPITAL}}
  // The header "1.000" at position 2 should also be {{CAPITAL}}
  // Replace all remaining literal "1.000" that represent capital
  // But be careful: "1.000" also appears in Article 7 etc.
  // After our Article 7 replacement, remaining "1.000" should be safe to replace
  xml = xml.replace(/>1\.000<\/w:t>/g, '>{{CAPITAL}}</w:t>');
  xml = xml.replace(/>1\.000 /g, '>{{CAPITAL}} ');

  // ── Replace exercise date pattern ──
  // "1er janvier et finira le 31 décembre" -> use {{DATE_CLOTURE}}
  // The existing text says "commence le 1er janvier et finira le 31 décembre"
  // Replace with a placeholder for the full exercise dates
  var art11Para = findParagraphContaining(xml, 'commence le 1');
  if (art11Para) {
    var exPPr = '<w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/></w:rPr></w:pPr>';
    var newExPara = '<w:p>' + exPPr + '<w:r>' + rPr + '<w:t xml:space="preserve">Chaque exercice social a une dur\u00e9e d\u2019une ann\u00e9e qui commence le {{DATE_DEBUT_EXERCICE}} et finira le {{DATE_CLOTURE}} de chaque ann\u00e9e.</w:t></w:r></w:p>';
    xml = xml.substring(0, art11Para.start) + newExPara + xml.substring(art11Para.end);
    console.log('Replaced exercise date paragraph');
  }

  // ── Replace signature block ──
  // Find "__________________________________________________" followed by "NOM DE L'ASSOCIÉ 1" etc.
  // Replace with conditional per-associate signature blocks
  var sigStartPara = findParagraphContaining(xml, '____________');
  var etcPara = findParagraphContaining(xml, '3, etc');
  if (!etcPara) etcPara = findParagraphContaining(xml, 'ASSOCI');

  if (sigStartPara) {
    // Find the last signature-related paragraph
    // Look for "ETAT DES ACTES" and go just before it
    var etatPara = findParagraphContaining(xml, 'ETAT DES ACTES');
    var sigEnd = etatPara ? etatPara.start : sigStartPara.end;

    // Also look backward to find "{{VILLE_SIGNATURE}}" paragraph if it exists
    // and all __ lines and NOM DE L'ASSOCIE paragraphs
    // Find all underscore/associe paragraphs from sigStartPara to etatPara
    var sigBlockEnd = sigEnd;
    // Scan for all paragraphs between sigStartPara.start and etatPara
    // Simpler: find all content between "A\n{{VILLE_SIGNATURE}}" and "ETAT DES ACTES"

    var sigRPr = '<w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/><w:b w:val="1"/><w:bCs w:val="1"/><w:rtl w:val="0"/></w:rPr>';
    var sigHiddenPPr = hiddenPPr;
    var lineRPr = rPr;

    var sigParas = '';
    for (var s = 1; s <= 10; s++) {
      var lineBefore = s === 1 ? '0' : '600';
      var linePPr = '<w:pPr><w:spacing w:before="' + lineBefore + '" w:after="120" w:line="276" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/></w:rPr></w:pPr>';
      var namePPr = '<w:pPr><w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/></w:rPr></w:pPr>';

      sigParas += '<w:p>' + sigHiddenPPr + '<w:r>' + sigRPr + '<w:t xml:space="preserve">{{#HAS_ASSOC_' + s + '}}</w:t></w:r></w:p>';
      sigParas += '<w:p>' + linePPr + '<w:r>' + lineRPr + '<w:t xml:space="preserve">______________________________________</w:t></w:r></w:p>';
      sigParas += '<w:p>' + namePPr + '<w:r>' + sigRPr + '<w:t xml:space="preserve">{{ACTIONNAIRE_' + s + '}}</w:t></w:r></w:p>';
      sigParas += '<w:p>' + sigHiddenPPr + '<w:r>' + sigRPr + '<w:t xml:space="preserve">{{/HAS_ASSOC_' + s + '}}</w:t></w:r></w:p>';
    }

    xml = xml.substring(0, sigStartPara.start) + sigParas + xml.substring(sigBlockEnd);
    console.log('Replaced signature block with conditional per-associate blocks');
  }

  // ── Add "A {{VILLE_SIGNATURE}}, le {{DATE_SIGNATURE}}" if not already present ──
  // The source has "A" / "VILLE du siège" / ", le" / "[__] janvier 2024"
  // These were partially replaced earlier. Let's check for the "A" paragraph pattern
  // and consolidate into a single paragraph
  var villeParaStart = findParagraphContaining(xml, '{{VILLE_SIGNATURE}}');
  if (villeParaStart) {
    // Find the paragraph that contains the date
    var dateParaAfter = findParagraphContaining(xml, '{{DATE_SIGNATURE}}');
    if (dateParaAfter && dateParaAfter.start >= villeParaStart.start) {
      // Merge into one paragraph: "A {{VILLE_SIGNATURE}}, le {{DATE_SIGNATURE}},"
      var sigDatePPr = '<w:pPr><w:spacing w:after="240" w:line="276" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="' + FONT + '" w:cs="' + FONT + '" w:eastAsia="' + FONT + '" w:hAnsi="' + FONT + '"/></w:rPr></w:pPr>';
      var newSigDate = '<w:p>' + sigDatePPr + '<w:r>' + rPr + '<w:t xml:space="preserve">A {{VILLE_SIGNATURE}}, le {{DATE_SIGNATURE}},</w:t></w:r></w:p>';
      // Find the "A" paragraph before VILLE_SIGNATURE
      var aPara = findParagraphContaining(xml, '>A<');
      if (aPara && aPara.start < villeParaStart.start && aPara.start > villeParaStart.start - 500) {
        xml = xml.substring(0, aPara.start) + newSigDate + xml.substring(dateParaAfter.end);
        console.log('Merged ville/date signature into single paragraph');
      } else {
        xml = xml.substring(0, villeParaStart.start) + newSigDate + xml.substring(dateParaAfter.end);
        console.log('Merged ville/date signature into single paragraph (v2)');
      }
    }
  }

  // ── Clean up remaining "mille" words near capital ──
  // These are literal words that should be {{CAPITAL_LETTRES}}
  xml = xml.replace(/>mille<\/w:t>/g, '>{{CAPITAL_LETTRES}}</w:t>');

  // Replace the literal "1" (euro value) with {{VALEUR_NOMINALE}} 
  // This is tricky - "1" appears in many places. Skip for now, already handled in Article 7 rebuild.

  // ── Merge split tags ──
  xml = mergeRunsWithSplitTags(xml);

  verifyAndSave(zip, xml, path.join(outDir, 'sci-statuts.docx'), 'SCI Statuts');
})();


// ════════════════════════════════════════════════════════════
// FILE 2: PV NOMINATION
// ════════════════════════════════════════════════════════════
(function buildPvNomination() {
  console.log('\n########################################');
  console.log('# Processing: SCI PV Nomination');
  console.log('########################################');

  var buf = fs.readFileSync(path.join(srcDir, '2 - PV nomination du gérant SCI.docx'));
  var zip = new PizZip(buf);
  var origXml = zip.file('word/document.xml').asText();

  // Build the document from scratch like make-sas-pv-nomination.js
  var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
  var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

  var body = '';

  // ─── HEADER ───
  body += p('{{NOM_SOCIETE}}', rPrTitle, { center: true, before: 0, after: 40 });
  body += p('Soci\u00e9t\u00e9 civile immobili\u00e8re au capital de {{CAPITAL}} euros', rPrSmall, { center: true, before: 0, after: 40 });
  body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPrSmall, { center: true, before: 0, after: 480 });

  // ─── DATE & PRESENTS ───
  body += para({ before: 0, after: 120, runs: run('Le {{DATE_SIGNATURE}} \u00e0 14 heures, sont pr\u00e9sents au si\u00e8ge de la soci\u00e9t\u00e9, les soussign\u00e9s :', rPr) });

  // List of present associates (up to 10) with conditional blocks
  for (var n = 1; n <= 10; n++) {
    body += tag('{{#HAS_ASSOC_' + n + '}}');
    body += p('- {{CIVILITE_NOM_PRENOM_' + n + '}}, n\u00e9(e) le {{DATE_NAISSANCE_' + n + '}} \u00e0 {{LIEU_NAISSANCE_' + n + '}}, de nationalit\u00e9 {{NATIONALITE_' + n + '}}, {{SITUATION_MATRIMONIALE_' + n + '}}, demeurant {{ADRESSE_ASSOCIE_' + n + '}}, titulaire de {{NB_PARTS_' + n + '}} parts sociales.', rPr, { before: 0, after: 120 });
    body += tag('{{/HAS_ASSOC_' + n + '}}');
  }

  // ─── AG ORDINAIRE ───
  body += p('Repr\u00e9sentant la totalit\u00e9 des parts afin de participer \u00e0 :', rPr, { before: 120, after: 120 });
  body += p('L\'ASSEMBL\u00c9E G\u00c9N\u00c9RALE ORDINAIRE', rPrSectionTitle, { center: true, before: 0, after: 120 });

  body += para({ before: 0, after: 240, runs: run('Dont l\'ordre du jour annonc\u00e9 par {{PRESIDENT_NOM}}, pr\u00e9sident de cette assembl\u00e9e est :', rPr) });
  body += para({ before: 0, after: 480, runs: run('Nomination de la g\u00e9rance{{#HAS_DG_1}} et de la co-g\u00e9rance{{/HAS_DG_1}}', rPrBold) });

  // ─── RESOLUTION 1: GERANT ───
  body += para({ before: 0, after: 120, runs: run('R\u00c9SOLUTION 1 :', rPrSectionTitle) });

  body += p('Nomination aux fonctions de g\u00e9rant telles que d\u00e9finies par la loi et les statuts de la soci\u00e9t\u00e9, \u00e0 compter de ce jour et pour une dur\u00e9e ind\u00e9termin\u00e9e :', rPr, { before: 0, after: 120 });

  body += p('- {{GERANT_CIVILITE_NOM_PRENOM}}, n\u00e9(e) le {{GERANT_DATE_NAISSANCE}} \u00e0 {{GERANT_LIEU_NAISSANCE}}, de nationalit\u00e9 {{GERANT_NATIONALITE}}, {{GERANT_SITUATION_MATRIMONIALE}}, demeurant {{GERANT_ADRESSE}}.', rPr, { before: 0, after: 120 });

  body += p('{{REMUNERATION_GERANT}}', rPr, { before: 0, after: 120 });

  // ─── RESOLUTION 2: CO-GERANT (conditional) ───
  body += tag('{{#HAS_DG_1}}');
  body += p('Nomination de la co-g\u00e9rance', rPrBold, { before: 240, after: 120 });
  body += para({ before: 0, after: 120, runs: run('R\u00c9SOLUTION 2 :', rPrSectionTitle) });

  body += p('Nomination aux fonctions de g\u00e9rant telles que d\u00e9finies par la loi et les statuts de la soci\u00e9t\u00e9, \u00e0 compter de ce jour et pour une dur\u00e9e ind\u00e9termin\u00e9e :', rPr, { before: 0, after: 120 });

  body += p('- {{DG_1_CIVILITE_NOM_PRENOM}}, n\u00e9(e) le {{DG_1_DATE_NAISSANCE}} \u00e0 {{DG_1_LIEU_NAISSANCE}}, de nationalit\u00e9 {{DG_1_NATIONALITE}}, {{DG_1_SITUATION_MATRIMONIALE}}, demeurant {{DG_1_ADRESSE}}.', rPr, { before: 0, after: 120 });

  body += p('{{REMUNERATION_CO_GERANT}}', rPr, { before: 0, after: 120 });
  body += tag('{{/HAS_DG_1}}');

  body += p('CETTE RESOLUTION EST ADOPTEE A L\'UNANIMITE', rPrBold, { before: 0, after: 480 });

  // ─── CLOTURE ───
  body += p('Plus rien n\'\u00e9tant \u00e0 l\'ordre du jour, la s\u00e9ance est lev\u00e9e \u00e0 14 heures 30 minutes.', rPr, { before: 0, after: 120 });
  body += p('De tout ce que dessus, il est dress\u00e9 le pr\u00e9sent proc\u00e8s-verbal en 4 exemplaires originaux, qui seront sign\u00e9s par tous les intervenants susmentionn\u00e9s.', rPr, { before: 0, after: 240 });

  // ─── SIGNATURE ───
  body += para({ before: 0, after: 360, runs: run('Fait \u00e0 {{VILLE_SIGNATURE}}, le {{DATE_SIGNATURE}}', rPr) });

  body += p('Signature des associ\u00e9s :', rPrBold, { before: 0, after: 120 });

  // Indexed signatures (up to 10)
  for (var n = 1; n <= 10; n++) {
    var sigBefore = n === 1 ? 0 : 360;
    body += tag('{{#HAS_ASSOC_' + n + '}}');
    body += p('______________________________', rPr, { before: sigBefore, after: 0 });
    body += p('{{ACTIONNAIRE_' + n + '}}', rPrBold, { before: 0, after: 0 });
    body += tag('{{/HAS_ASSOC_' + n + '}}');
  }

  var newXml = beforeBody + body + afterBody;
  verifyAndSave(zip, newXml, path.join(outDir, 'sci-pv-nomination.docx'), 'SCI PV Nomination');
})();


// ════════════════════════════════════════════════════════════
// FILE 3: DECLARATION NON-CONDAMNATION
// ════════════════════════════════════════════════════════════
(function buildDeclaration() {
  console.log('\n########################################');
  console.log('# Processing: SCI Declaration non-condamnation');
  console.log('########################################');

  var buf = fs.readFileSync(path.join(srcDir, '3 - Déclaration de non comdamnation - SCI FORMALIST.docx'));
  var zip = new PizZip(buf);
  var origXml = zip.file('word/document.xml').asText();

  var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
  var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

  function buildDeclarationPage(fields, role, isFirst) {
    var body = '';
    var titleOpts = { center: true, before: 0, after: 20 };
    if (!isFirst) titleOpts.pageBreakBefore = true;

    // Title
    body += p('D\u00c9CLARATION DE NON-CONDAMNATION', rPrTitle, titleOpts);
    body += p('souscrite en application de l\u2019article A.123-51 du Code de commerce', rPrSubtitle, { center: true, before: 0, after: 360 });

    // Identity with gender conditionals
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

    // Role
    body += p('d\u00e9clare accepter les fonctions de ' + role + ' de la soci\u00e9t\u00e9 :', rPr, { before: 0, after: 120 });
    body += p('{{NOM_SOCIETE}}', rPrBold, { before: 0, after: 20 });
    body += p('Soci\u00e9t\u00e9 civile immobili\u00e8re au capital de {{CAPITAL}} euros', rPr, { before: 0, after: 20 });
    body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPr, { before: 0, after: 240 });

    // Legal text
    body += p('Je d\u00e9clare, en outre, conform\u00e9ment aux dispositions de l\u2019article A.123-51 du Code de commerce, n\u2019avoir jamais fait l\u2019objet d\u2019aucune condamnation p\u00e9nale ni de sanction civile ou administrative de nature \u00e0 m\u2019interdire, soit d\u2019exercer une activit\u00e9 commerciale, soit de g\u00e9rer, d\u2019administrer ou de diriger une personne morale.', rPr, { before: 0, after: 360, both: true });

    // Signature
    body += p('Sign\u00e9e \u00e9lectroniquement le {{DATE_SIGNATURE}} conform\u00e9ment aux dispositions des articles 1366 et suivants du Code civil.', rPr, { before: 0, after: 240 });
    body += p('______________________________', rPr, { before: 0, after: 0 });
    body += p(fields.CIVILITE_NOM_PRENOM, rPrBold, { before: 0, after: 360 });

    // Legal reminder
    body += p('Rappel de L 123-5 du Code de Commerce, r\u00e9primant certaines infractions en mati\u00e8re de Registre du Commerce :', rPrSmall, { before: 0, after: 20 });
    body += p('Le fait de donner, de mauvaise foi, des indications inexactes ou incompl\u00e8tes en vue d\u2019une immatriculation, d\u2019une radiation ou d\u2019une mention compl\u00e9mentaire ou rectificative au registre du commerce et des soci\u00e9t\u00e9s est puni d\u2019une amende de 4 500 euros et d\u2019un emprisonnement de six mois.', rPrSmall, { before: 0, after: 20, both: true });
    body += p('Le tribunal comp\u00e9tent peut, en outre, priver l\u2019int\u00e9ress\u00e9, pendant un temps qui n\u2019exc\u00e8de pas cinq ans, du droit de vote et d\u2019\u00e9ligibilit\u00e9 aux \u00e9lections des tribunaux de commerce, chambres de commerce et d\u2019industrie et conseils de prud\u2019hommes.', rPrSmall, { before: 0, after: 0, both: true });

    return body;
  }

  var body = '';

  // Page 1: Gerant (always present)
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

  // Page 2: Co-gerant (conditional)
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
  verifyAndSave(zip, newXml, path.join(outDir, 'sci-declaration-non-condamnation.docx'), 'SCI Declaration non-condamnation');
})();


// ════════════════════════════════════════════════════════════
// FILE 4: ATTESTATION DOMICILE
// ════════════════════════════════════════════════════════════
(function buildAttestation() {
  console.log('\n########################################');
  console.log('# Processing: SCI Attestation domicile');
  console.log('########################################');

  var buf = fs.readFileSync(path.join(srcDir, '5 - Attestation domicile personnel - SCI FORMALIST.docx'));
  var zip = new PizZip(buf);
  var origXml = zip.file('word/document.xml').asText();

  var beforeBody = origXml.substring(0, origXml.indexOf('<w:body>') + '<w:body>'.length);
  var afterBody = '</w:body>' + origXml.substring(origXml.indexOf('</w:body>') + '</w:body>'.length);

  var body = '';

  // Title
  body += p('MISE \u00c0 DISPOSITION DE LOCAUX SANS LIMITATION DE DUR\u00c9E', rPrTitle, { center: true, before: 0, after: 360 });

  // "Le soussigné :"
  body += p('Le soussign\u00e9 :', rPr, { before: 0, after: 120 });

  // Identity
  body += p('{{CIVILITE_NOM_PRENOM}},', rPrBold, { before: 0, after: 20 });
  body += p('n\u00e9(e) le {{DATE_NAISSANCE}} \u00e0 {{LIEU_NAISSANCE}},', rPr, { before: 0, after: 20 });
  body += p('de nationalit\u00e9 {{NATIONALITE}}, {{SITUATION_MATRIMONIALE}},', rPr, { before: 0, after: 20 });
  body += p('demeurant {{ADRESSE_DIRIGEANT}}.', rPr, { before: 0, after: 240 });

  // "Agissant en tant que..."
  body += p('Agissant en tant que {{STATUT_OCCUPATION}} de son domicile principal, atteste que celui-ci est mis \u00e0 disposition de :', rPr, { before: 0, after: 120, both: true });

  // Company info
  body += p('{{NOM_SOCIETE}}', rPrBold, { before: 0, after: 20 });
  body += p('{{FORME_LABEL}} au capital de {{CAPITAL}} euros', rPr, { before: 0, after: 20 });
  body += p('Si\u00e8ge social : {{ADRESSE_SIEGE}}', rPr, { before: 0, after: 240 });

  // Legal text
  body += p('dont il est dirigeant pour y installer son si\u00e8ge social d\u00e8s ce jour, sans limitation de dur\u00e9e afin d\u2019y exercer une activit\u00e9 ne n\u00e9cessitant pas le passage de client\u00e8le ou la r\u00e9ception de marchandises (Article L123-11 du code du commerce).', rPr, { before: 0, after: 360, both: true });

  // Signature
  body += para({ before: 0, after: 360, runs: run('Fait \u00e0 {{VILLE_SIGNATURE}}, le {{DATE_SIGNATURE}}', rPr) });
  body += p('______________________________', rPr, { before: 0, after: 0 });
  body += p('{{CIVILITE_NOM_PRENOM}}', rPrBold, { before: 0, after: 0 });

  var newXml = beforeBody + body + afterBody;
  verifyAndSave(zip, newXml, path.join(outDir, 'sci-attestation-domicile.docx'), 'SCI Attestation domicile');
})();

console.log('\n========================================');
console.log('All 4 SCI templates processed successfully.');
console.log('========================================');
