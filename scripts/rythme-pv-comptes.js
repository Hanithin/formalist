/*
 * Le rythme vertical des procès-verbaux d'approbation.
 *
 * Les paragraphes se suivaient à dix points d'écart, l'interligne à un tiers de ligne
 * en plus : chaque phrase flottait dans son blanc, et l'acte paraissait relâché là où
 * il doit paraître tenu. Ce n'est pas un défaut qu'on montre du doigt - c'est
 * l'impression d'ensemble, et elle se corrige au chiffre près.
 *
 * L'écart entre paragraphes passe donc de dix à six points. Avec l'interligne ramené à
 * 1,15 dans la génération, le texte se tient sans se serrer : une ligne de plus par
 * page, et surtout une page qui se lit d'un bloc.
 *
 * Les titres gardent leurs vingt-quatre points d'avant - c'est eux qui découpent - et
 * leur écart dessous suit celui du corps.
 *
 * Idempotent : relancé, il ne trouve plus rien à changer.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");
const FICHIERS = ["comptes-pv-associe-unique.docx", "comptes-pv-assemblee.docx"];

/* Six points entre deux paragraphes, trois entre deux postes d'une liste. */
const ENTRE_PARAGRAPHES = 120;
const DANS_UNE_LISTE = 60;

const CORRECTIONS = [
  ['<w:spacing w:after="200"/>', '<w:spacing w:after="' + ENTRE_PARAGRAPHES + '"/>'],
  ['<w:spacing w:after="80"/>', '<w:spacing w:after="' + DANS_UNE_LISTE + '"/>'],
  ['<w:spacing w:after="80"/><w:ind', '<w:spacing w:after="' + DANS_UNE_LISTE + '"/><w:ind'],
  ['<w:spacing w:before="240" w:after="200"/>',
   '<w:spacing w:before="180" w:after="' + ENTRE_PARAGRAPHES + '"/>'],
  ['<w:spacing w:after="100"/>', '<w:spacing w:after="' + ENTRE_PARAGRAPHES + '"/>'],
  ['<w:spacing w:after="400"/>', '<w:spacing w:after="' + ENTRE_PARAGRAPHES + '"/>'],
  /* L'espace de signature reste ample : on y écrit à la main. */
];

let touches = 0;

for (const nom of FICHIERS) {
  const cible = path.join(TEMPLATES, nom);
  const zip = new PizZip(readFileSync(cible));
  const avant = zip.file("word/document.xml").asText();
  let xml = avant;

  for (const [de, vers] of CORRECTIONS) xml = xml.split(de).join(vers);

  if (xml === avant) {
    console.log(nom + " : rien à changer.");
    continue;
  }

  zip.file("word/document.xml", xml);
  writeFileSync(cible, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(nom + " : rythme resserré.");
  touches += 1;
}

if (touches === 0) process.exit(0);
