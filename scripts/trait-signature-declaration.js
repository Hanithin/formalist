/*
 * Le trait de signature des déclarations de confidentialité.
 *
 * La génération pose un trait au-dessus du nom qui suit « Fait à… », sous la forme
 * d'une bordure de paragraphe : elle court alors sur toute la largeur du texte. La
 * borner par un retrait rétrécit le paragraphe entier, et le nom s'y coupait en trois
 * lignes. La génération efface par ailleurs toute ligne de tirets isolée, tenue pour un
 * reste de l'ancienne façon de faire.
 *
 * Les procès-verbaux s'en sortent en mettant le trait et le nom dans un seul
 * paragraphe, séparés d'un saut de ligne : le trait garde sa longueur, le nom sa
 * largeur, et rien ne l'efface. Les déclarations font pareil - le trait dans son propre
 * passage, sans gras, le nom dans le sien, avec.
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

const TIRETS = "____________________________";
const TRAIT =
  '<w:r><w:t xml:space="preserve">' + TIRETS + "</w:t></w:r><w:r><w:br/></w:r>";

/* Le passage qui porte le nom du signataire, et le paragraphe qui l'entoure. */
const NOM = /<w:r(?: [^>]*)?>(?:(?!<\/w:r>)[\s\S])*?\{\{DIRIGEANT_NOM\}\}(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g;
const PARAGRAPHE = /<w:p(?: [^>]*)?>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g;

/* Le texte d'un fragment, balises ôtées. */
function lire(fragment) {
  const morceaux = [];
  fragment.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, (_, t) => morceaux.push(t));
  return morceaux.join("").trim();
}

let touches = 0;

for (const nom of FICHIERS) {
  const cible = path.join(TEMPLATES, nom);
  const zip = new PizZip(readFileSync(cible));
  const avant = zip.file("word/document.xml").asText();

  /*
   * Un trait posé dans son propre paragraphe est d'abord retiré : c'était la première
   * façon de faire, et la génération l'efface de toute manière.
   */
  let xml = avant.replace(PARAGRAPHE, (p) => (/^_+$/.test(lire(p)) ? "" : p));

  /*
   * Le trait précède le nom du signataire, dans son paragraphe : c'est la dernière
   * mention du dirigeant, celle qui suit la formule de clôture.
   */
  const passages = xml.match(NOM);
  if (!passages) {
    console.log(nom + " : nom du signataire introuvable.");
    continue;
  }
  const dernier = passages[passages.length - 1];
  const repere = xml.lastIndexOf(dernier);

  // Le paragraphe qui l'entoure a-t-il déjà son trait ?
  const debut = xml.lastIndexOf("<w:p", repere);
  const fin = xml.indexOf("</w:p>", repere);
  const dejaTrait = xml.slice(debut, fin).includes(TIRETS);

  if (!dejaTrait) xml = xml.slice(0, repere) + TRAIT + xml.slice(repere);

  if (xml === avant) {
    console.log(nom + " : rien a changer.");
    continue;
  }
  zip.file("word/document.xml", xml);
  writeFileSync(cible, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(nom + " : trait de signature pose.");
  touches += 1;
}

if (touches === 0) process.exit(0);
