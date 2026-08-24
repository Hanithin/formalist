#!/usr/bin/env node
/**
 * Donne aux actes la mise en forme d'un acte de cabinet.
 *
 * Les gabarits sont nés sans feuille de styles : pas de police déclarée, pas de taille
 * pour le corps du texte, pas d'interligne. Word rendait donc le corps en Calibri 11,
 * LibreOffice en Liberation Serif 12, et les titres portaient chacun leur taille en
 * dur - 16, 14, 12, 10 points - sans échelle commune. Deux exemplaires du même acte
 * n'avaient pas la même allure selon la machine qui l'ouvrait.
 *
 * Ce script pose trois choses dans chaque gabarit :
 *
 *   1. une feuille de styles minimale - Cambria 11 points, interligne 1,15, texte
 *      justifié, veuves et orphelines évitées ;
 *   2. une échelle de titres cohérente, dérivée du corps plutôt que choisie au cas par
 *      cas : société 13 pt, titre de l'acte 12,5 pt, intertitres 11 pt ;
 *   3. la justification du corps, qui donne au document son bord droit net.
 *
 * Il est idempotent : relancé, il repose les mêmes valeurs.
 *
 *   node scripts/mise-en-forme-actes.js
 */
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");

/*
 * Cambria, la police que le générateur pose déjà sur les titres.
 *
 * Le choix n'est pas neuf : docx.cjs - le moteur de mise en page hérité - écrit
 * « Cambria » sur les intertitres qu'il fabrique. Déclarer Garamond par défaut aurait
 * donné un document à deux polices, l'une pour le corps et l'autre pour les titres, ce
 * qui se voit immédiatement. Une seule famille, donc, celle qui est déjà là.
 */
const POLICE = "Cambria";
const POLICE_SECOURS = "Cambria";

/** Demi-points : Word compte les tailles en moitiés de point. */
const CORPS = 22; // 11 pt
const SOCIETE = 26; // 13 pt
const TITRE = 25; // 12,5 pt
const INTERTITRE = 22; // 11 pt, en gras
const PIED = 20; // 10 pt

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${POLICE}" w:hAnsi="${POLICE}" w:eastAsia="${POLICE_SECOURS}" w:cs="${POLICE_SECOURS}"/>
        <w:sz w:val="${CORPS}"/>
        <w:szCs w:val="${CORPS}"/>
        <w:lang w:val="fr-FR"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:widowControl/>
        <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>
        <w:jc w:val="both"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
</w:styles>`;

/** Les gabarits d'actes : procès-verbaux, décisions, avenants, traités. */
function gabarits() {
  return fs.readdirSync(TEMPLATES).filter((nom) => nom.endsWith(".docx"));
}

/** Déclare styles.xml dans le paquet, s'il n'y est pas déjà. */
function declarerLesStyles(zip) {
  const types = zip.file("[Content_Types].xml").asText();
  if (!types.includes("styles+xml")) {
    zip.file(
      "[Content_Types].xml",
      types.replace(
        "</Types>",
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'
      )
    );
  }

  const rels = zip.file("word/_rels/document.xml.rels").asText();
  if (!rels.includes("/officeDocument/2006/relationships/styles")) {
    zip.file(
      "word/_rels/document.xml.rels",
      rels.replace(
        "</Relationships>",
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
      )
    );
  }

  zip.file("word/styles.xml", STYLES);
}

/*
 * L'échelle des titres, appliquée aux tailles écrites en dur.
 *
 * On ne devine pas le rôle d'un paragraphe à son texte : on le lit à la taille qu'il
 * portait, qui distinguait déjà la société, le titre de l'acte et les intertitres.
 * C'est cette échelle-là qu'on resserre, sans toucher à la structure.
 */
const ECHELLE = {
  32: SOCIETE, // le nom de la société, 16 pt à l'origine
  28: TITRE, // le titre de l'acte, 14 pt
  24: INTERTITRE, // les intertitres de résolution, 12 pt
  22: CORPS,
  20: PIED, // les lignes d'identification sous le nom, 10 pt
  18: PIED,
};

function reglerLesTailles(xml) {
  return xml.replace(/<w:sz w:val="(\d+)"\/>/g, (tel, valeur) => {
    const nouvelle = ECHELLE[Number(valeur)];
    return nouvelle ? '<w:sz w:val="' + nouvelle + '"/>' : tel;
  });
}

let modifies = 0;

for (const nom of gabarits()) {
  const chemin = path.join(TEMPLATES, nom);
  const zip = new PizZip(fs.readFileSync(chemin));

  declarerLesStyles(zip);
  zip.file("word/document.xml", reglerLesTailles(zip.file("word/document.xml").asText()));

  fs.writeFileSync(chemin, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  modifies += 1;
}

console.log(modifies + " gabarit(s) mis en forme.");
