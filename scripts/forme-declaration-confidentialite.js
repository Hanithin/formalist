/*
 * La déclaration de confidentialité prend la forme des procès-verbaux.
 *
 * Elle venait du modèle du cabinet et gardait ses partis pris : petites capitales pour
 * les intitulés, Garamond, corps à 11,5 points, signature alignée à droite. Les
 * procès-verbaux d'approbation, eux, ont été repris jusqu'au chiffre - majuscules
 * soulignées, douze points, interligne 1,15, signature à gauche sous son trait. Deux
 * documents du même dossier ne peuvent pas se composer différemment.
 *
 * La structure ne change pas : l'ordre des articles et leur contenu suivent le modèle
 * de l'annexe 1-5 du code de commerce, et l'identification de la société reste dans le
 * corps - la répéter en en-tête ferait dire deux fois la même chose au même document.
 *
 * Un défaut au passage : la fonction du signataire était écrite « Gérant » en dur,
 * héritée du rendu qui a servi de source. Toute déclaration la portait, quelle que soit
 * la forme de la société - la faute même que le procès-verbal vient de perdre.
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

/** Les intitulés, tels qu'ils doivent se lire : en majuscules, comme dans un acte. */
const INTITULES = [
  ["Le soussigné :", "LE SOUSSIGNÉ :"],
  ["Article 1 - Objet de la déclaration", "ARTICLE 1 - OBJET DE LA DÉCLARATION"],
  ["Article 2 - Attestation sur l'honneur", "ARTICLE 2 - ATTESTATION SUR L'HONNEUR"],
  [
    "Article 3 - Reconnaissance des sanctions applicables",
    "ARTICLE 3 - RECONNAISSANCE DES SANCTIONS APPLICABLES",
  ],
  ["Article 4 - Destination de la déclaration", "ARTICLE 4 - DESTINATION DE LA DÉCLARATION"],
  [
    "Déclaration de confidentialité des comptes annuels",
    "DÉCLARATION DE CONFIDENTIALITÉ DES COMPTES ANNUELS",
  ],
  [
    "Déclaration de confidentialité du compte de résultat",
    "DÉCLARATION DE CONFIDENTIALITÉ DU COMPTE DE RÉSULTAT",
  ],
];

let touches = 0;

for (const nom of FICHIERS) {
  const cible = path.join(TEMPLATES, nom);
  const zip = new PizZip(readFileSync(cible));
  const avant = zip.file("word/document.xml").asText();
  let xml = avant;

  /*
   * Les majuscules d'abord, tant que les textes portent encore leur casse d'origine :
   * c'est par eux qu'on retrouve les paragraphes à souligner.
   */
  for (const [minuscules, majuscules] of INTITULES) {
    xml = xml.split(">" + minuscules + "<").join(">" + majuscules + "<");
  }

  /*
   * Les petites capitales cèdent la place au soulignement.
   *
   * Elles distinguaient les intitulés sans les rendre repérables de loin ; les actes du
   * même dossier les soulignent, et l'œil retrouve le découpage d'un document à l'autre.
   */
  xml = xml.split("<w:b/><w:bCs/><w:smallCaps/>").join("<w:b/><w:bCs/><w:u w:val=\"single\"/>");
  /* Le titre du document reste seul, sans trait : il n'a rien à distinguer de voisin. */
  xml = xml.split("<w:b/><w:bCs/><w:u w:val=\"single\"/><w:sz w:val=\"28\"/>").join("<w:b/><w:bCs/><w:sz w:val=\"28\"/>");
  xml = xml.split("<w:smallCaps/>").join("");

  /* Le corps, à douze points comme les procès-verbaux. */
  xml = xml.split('<w:sz w:val="23"/>').join('<w:sz w:val="24"/>');
  xml = xml.split('<w:szCs w:val="23"/>').join('<w:szCs w:val="24"/>');
  xml = xml.split('<w:sz w:val="21"/>').join('<w:sz w:val="24"/>');
  xml = xml.split('<w:szCs w:val="21"/>').join('<w:szCs w:val="24"/>');

  /* Six points entre deux paragraphes, dix-huit avant un intitulé. */
  xml = xml.split('<w:spacing w:after="160" w:before="280"/>').join('<w:spacing w:after="120" w:before="360"/>');
  xml = xml.split('<w:spacing w:after="160" w:line="276"').join('<w:spacing w:after="120" w:line="276"');
  xml = xml.split('<w:spacing w:after="160"/>').join('<w:spacing w:after="120"/>');
  xml = xml.split('<w:spacing w:after="200" w:line="276"').join('<w:spacing w:after="120" w:line="276"');

  /*
   * La signature passe à gauche, sous son trait, comme dans les procès-verbaux - et la
   * fonction cesse d'être écrite « Gérant » en dur.
   */
  xml = xml.split('<w:jc w:val="right"/>').join("");
  xml = xml.split('<w:t xml:space="preserve">Gérant</w:t>')
    .join('<w:t xml:space="preserve">{{DIRIGEANT_FONCTION}}</w:t>');

  if (xml === avant) {
    console.log(nom + " : rien à changer.");
    continue;
  }

  zip.file("word/document.xml", xml);
  writeFileSync(cible, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(nom + " : forme alignée sur les procès-verbaux.");
  touches += 1;
}

if (touches === 0) process.exit(0);
