/*
 * La prime d'apport, dite au procès-verbal comme au traité.
 *
 * La résolution qui rémunère l'apport annonce le montant de l'augmentation, le nombre
 * de titres émis et leur nominal - puis passe directement à leur attribution. Tant que
 * la valeur apportée entrait entièrement au capital, il n'y avait rien de plus à dire.
 * Dès qu'une prime existe, il faut la chiffrer : elle ne monte pas au capital, elle va
 * en réserve, et une résolution qui la tait laisse au greffe un écart inexpliqué entre
 * la valeur de l'apport et l'augmentation décidée.
 *
 * La passe insère une balise avant l'attribution. La couche d'adaptation l'emplit d'une
 * phrase ou d'une chaîne vide, selon qu'il y a prime ou non. Substitution de texte à
 * l'intérieur d'un nœud <w:t> : ni la structure, ni les styles, ni la numérotation ne
 * sont touchés.
 *
 * Idempotente : relancée sur un document déjà corrigé, elle ne trouve rien à remplacer.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const FICHIER = path.join(__dirname, "..", "templates", "modif-pv-age-universel.docx");

const AVANT = "euros chacune, intégralement attribuées à {identification_apporteur_court}";
const APRES =
  "euros chacune, {mention_prime_pv}intégralement attribuées à {identification_apporteur_court}";

const zip = new PizZip(readFileSync(FICHIER));
const xml = zip.file("word/document.xml").asText();

if (!xml.includes(AVANT)) {
  console.log("Rien à corriger : la mention de prime est déjà en place.");
  process.exit(0);
}

zip.file("word/document.xml", xml.split(AVANT).join(APRES));
writeFileSync(FICHIER, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("Mention de prime insérée dans la résolution de rémunération.");
