/*
 * Le pied de page des déclarations de confidentialité.
 *
 * Les deux déclarations portaient « Page 1 sur 2 », centré, en 9 points. Les vingt-huit
 * autres pieds de page de la maison portent le numéro seul, aligné à droite : les
 * déclarations s'y rangent.
 *
 * Idempotent : relancé, il ne trouve plus rien à changer.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");
const FICHIERS = [
  "comptes-confidentialite-micro.docx",
  "comptes-confidentialite-petite.docx",
];

/* Le numéro seul, à droite, en 8 points - la même construction de champ qu'avant. */
const PIED =
  '<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r>' +
  '<w:rPr><w:rFonts w:ascii="Garamond" w:cs="Garamond" w:eastAsia="Garamond"' +
  ' w:hAnsi="Garamond"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>' +
  '<w:fldChar w:fldCharType="begin"/>' +
  '<w:instrText xml:space="preserve">PAGE</w:instrText>' +
  '<w:fldChar w:fldCharType="separate"/><w:fldChar w:fldCharType="end"/>' +
  "</w:r></w:p>";

let touches = 0;

for (const nom of FICHIERS) {
  const cible = path.join(TEMPLATES, nom);
  const zip = new PizZip(readFileSync(cible));
  let change = false;

  for (const piece of Object.keys(zip.files)) {
    if (!/^word\/footer\d*\.xml$/.test(piece)) continue;
    const avant = zip.file(piece).asText();
    // Tout ce qui est entre l'ouverture et la fermeture du pied tient en un paragraphe.
    const apres = avant.replace(
      /(<w:ftr\b[^>]*>)[\s\S]*(<\/w:ftr>)/,
      (_, ouverture, fermeture) => ouverture + PIED + fermeture
    );
    if (apres === avant) continue;
    zip.file(piece, apres);
    change = true;
  }

  if (!change) {
    console.log(nom + " : rien a changer.");
    continue;
  }
  writeFileSync(cible, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(nom + " : numero de page seul, a droite.");
  touches += 1;
}

if (touches === 0) process.exit(0);
