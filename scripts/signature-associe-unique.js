/*
 * Le bloc de signature du procès-verbal d'associé unique.
 *
 * « L'associé unique : » était centré, la ligne de signature et le nom alignés à
 * gauche : le titre flottait au milieu de la page, au-dessus d'un trait posé contre la
 * marge. Le procès-verbal d'assemblée, lui, aligne les deux à gauche - c'est la forme
 * qu'un acte prend, et celle du reste du document.
 *
 * Le titre reprend au passage la mise en forme de son jumeau : gras, corps du texte.
 * Il était en treize points, seul écart de taille d'une page qui n'en fait aucun autre.
 *
 * Idempotent : relancé, il ne trouve plus rien à corriger.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const FICHIER = path.join(__dirname, "..", "templates", "comptes-pv-associe-unique.docx");

/*
 * L'apostrophe est nue dans ce fichier, non `&apos;` : elle est licite ainsi dans le
 * texte d'un élément XML, et Word l'écrit tantôt d'une façon, tantôt de l'autre.
 */
const CENTRE =
  '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr>' +
  '<w:t xml:space="preserve">L\'associé unique :</w:t></w:r></w:p>';

/* La même forme que « Les associés : » du procès-verbal d'assemblée. */
const A_GAUCHE =
  '<w:p><w:pPr><w:spacing w:after="100"/></w:pPr><w:r><w:rPr><w:b/></w:rPr>' +
  '<w:t xml:space="preserve">L\'associé unique :</w:t></w:r></w:p>';

const zip = new PizZip(readFileSync(FICHIER));
const xml = zip.file("word/document.xml").asText();

if (!xml.includes(CENTRE)) {
  console.log("Rien à corriger : le bloc de signature est déjà aligné.");
  process.exit(0);
}

zip.file("word/document.xml", xml.replace(CENTRE, A_GAUCHE));
writeFileSync(FICHIER, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("Bloc de signature aligné à gauche.");
