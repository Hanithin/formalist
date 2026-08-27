/*
 * La mise en page des procès-verbaux d'approbation des comptes.
 *
 * Trois défauts, relevés sur un acte rendu.
 *
 * « Fait au siège social, le 30 août 2026 » : un acte se date d'un lieu, non d'un
 * endroit. Le siège social dit où l'on s'est réuni - « les associés se sont réunis au
 * siège social » - et la formule de clôture veut la ville : « Fait à Paris ». Les deux
 * se disaient avec la même variable, et la seconde héritait de la première.
 *
 * Et des paragraphes vides s'ajoutaient à cet espacement, là où il suffisait déjà : on
 * lisait deux lignes blanches entre un titre et son texte, ce qui fait brouillon dans
 * un acte que le greffe conserve.
 *
 * Idempotent : relancé, il ne trouve plus rien à corriger.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const FICHIERS = ["comptes-pv-associe-unique.docx", "comptes-pv-assemblee.docx"];
const TEMPLATES = path.join(__dirname, "..", "templates");

/* La clôture se date d'une ville. Le lieu de réunion, lui, ne bouge pas. */
const DATE_DU_LIEU = "Fait {{LIEU_ASSEMBLEE}}, le {{DATE_ASSEMBLEE_FR}}.";
const DATE_DE_LA_VILLE = "Fait à {{VILLE_SIGNATURE}}, le {{DATE_ASSEMBLEE_FR}}.";

/**
 * Les paragraphes vides, retirés.
 *
 * Chaque paragraphe porte déjà dix points d'espacement : un paragraphe vide en ajoute
 * une ligne entière, et l'on en comptait trois dans un acte d'une page et demie.
 */
function sansParagraphesVides(xml) {
  return xml.replace(
    /<w:p><w:pPr>(?:(?!<\/w:p>).)*?<\/w:pPr><w:r><w:t xml:space="preserve"><\/w:t><\/w:r><\/w:p>/g,
    ""
  );
}

let touches = 0;

for (const nom of FICHIERS) {
  const cible = path.join(TEMPLATES, nom);
  const zip = new PizZip(readFileSync(cible));
  const avant = zip.file("word/document.xml").asText();

  let apres = avant.split(DATE_DU_LIEU).join(DATE_DE_LA_VILLE);
  apres = sansParagraphesVides(apres);

  if (apres === avant) {
    console.log(nom + " : rien à corriger.");
    continue;
  }

  zip.file("word/document.xml", apres);
  writeFileSync(cible, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(nom + " : mise en page reprise.");
  touches += 1;
}

if (touches === 0) process.exit(0);
