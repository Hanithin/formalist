/*
 * Les postes d'affectation forment une liste, non des paragraphes.
 *
 * « - à la réserve légale : 1 536,05 euros ; » et « - au compte report à nouveau :
 * 29 184,95 euros ; » se suivaient avec l'espacement du texte courant, alignés sur la
 * marge : trois blocs séparés là où il n'y a qu'une énumération, et rien ne rattachait
 * les postes à la phrase qui les annonce.
 *
 * Ils prennent donc un retrait et se resserrent : la phrase d'introduction ne se
 * détache plus de sa liste, les postes se suivent de près, et le paragraphe d'après
 * retrouve l'écart d'un bloc.
 *
 * Idempotent : relancé, il ne trouve plus rien à changer.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");
const FICHIERS = ["comptes-pv-associe-unique.docx", "comptes-pv-assemblee.docx"];

/* Huit millimètres : le retrait d'une énumération, pas celui d'un alinéa. */
const RETRAIT = 454;

const ESPACEMENT = '<w:spacing w:after="200"/>';

/**
 * L'espacement d'un paragraphe repéré par ce qu'il contient.
 *
 * Les paragraphes se ressemblent tous dans ce gabarit - même `<w:pPr>` - et seul leur
 * texte les distingue : on les cherche donc par leur contenu.
 */
function ajusterLeParagraphe(xml, contenu, espacement) {
  const dedans = xml.indexOf(contenu);
  if (dedans === -1) return { xml, fait: false };

  const debut = Math.max(xml.lastIndexOf("<w:p ", dedans), xml.lastIndexOf("<w:p>", dedans));
  const fin = xml.indexOf("</w:p>", dedans) + "</w:p>".length;
  const paragraphe = xml.slice(debut, fin);
  if (!paragraphe.includes(ESPACEMENT)) return { xml, fait: false };

  return {
    xml: xml.slice(0, debut) + paragraphe.replace(ESPACEMENT, espacement) + xml.slice(fin),
    fait: true,
  };
}

let touches = 0;

for (const nom of FICHIERS) {
  const cible = path.join(TEMPLATES, nom);
  const zip = new PizZip(readFileSync(cible));
  const avant = zip.file("word/document.xml").asText();
  let xml = avant;

  /* La phrase qui annonce la liste la garde sous elle. */
  for (const amorce of ["{{#IS_BENEFICE}}", "{{#IS_PERTE}}"]) {
    xml = ajusterLeParagraphe(xml, amorce, '<w:spacing w:after="80"/>').xml;
  }

  /* Les postes eux-mêmes : en retrait, serrés. */
  xml = ajusterLeParagraphe(
    xml,
    "- {{LIBELLE}} : {{MONTANT}} euros{{SUITE}} ;",
    '<w:spacing w:after="80"/><w:ind w:left="' + RETRAIT + '"/>'
  ).xml;

  /* Ce qui suit la liste retrouve l'écart d'un bloc. */
  xml = ajusterLeParagraphe(
    xml,
    "{{#IS_RESERVE_LEGALE}}",
    '<w:spacing w:before="240" w:after="200"/>'
  ).xml;

  if (xml === avant) {
    console.log(nom + " : rien à changer.");
    continue;
  }

  zip.file("word/document.xml", xml);
  writeFileSync(cible, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(nom + " : postes mis en liste.");
  touches += 1;
}

if (touches === 0) process.exit(0);
