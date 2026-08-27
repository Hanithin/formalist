/*
 * Les deux déclarations de confidentialité, reprises du modèle du cabinet.
 *
 * Celles qui existaient tenaient en huit paragraphes : un en-tête, un déclarant, un
 * objet, un engagement. Le modèle fourni est celui que le cabinet dépose - articles
 * numérotés, rappel préalable, attestation en quatre points, reconnaissance des
 * sanctions, destination de l'exemplaire. Le greffe lit la seconde forme ; c'est elle
 * qu'on écrit.
 *
 * Le fichier reçu est un rendu, non un gabarit : il porte les données d'une société
 * réelle. Chaque valeur y est donc remplacée par sa variable - et c'est le point à
 * surveiller, car une valeur oubliée partirait au greffe sous le nom d'un autre.
 *
 * Deux variantes en sortent, qui ne diffèrent que par leur portée : la micro-entreprise
 * rend confidentiels ses comptes entiers (annexe 1-5, article L. 123-16-1), la petite
 * entreprise son seul compte de résultat (annexe 1-6, article L. 123-16).
 *
 * Idempotent : relancé, il réécrit les mêmes fichiers depuis la même source.
 */

const { readFileSync, writeFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const SOURCE = process.argv[2] || path.join(process.env.HOME, "Downloads", "declaration.docx");
const TEMPLATES = path.join(__dirname, "..", "templates");

if (!existsSync(SOURCE)) {
  console.error("Modèle introuvable : " + SOURCE);
  process.exit(1);
}

/* Les données de la société qui a servi au rendu, et ce qui les remplace. */
const VARIABLES = [
  ["STERLING PEAK", "{{SOCIETE}}"],
  ["société d'exercice libéral par actions simplifiée", "{{FORME_EN_CLAIR}}"],
  ["20 000 euros", "{{CAPITAL_FORMATE}} euros"],
  ["34 rue Laugier, 75017 Paris", "{{SIEGE_SOCIAL}}"],
  ["registre du commerce et des sociétés de Paris", "registre du commerce et des sociétés {{RCS_DE}}"],
  ["899 979 934", "{{SIREN}}"],
  ["Monsieur sqf qsf", "{{DIRIGEANT_NOM}}"],
  ["en sa qualité de Gérant", "en sa qualité de {{DIRIGEANT_FONCTION}}"],
  ["tribunal de commerce de Paris", "tribunal de commerce {{RCS_DE}}"],
  ["Fait à Paris, le 30 août 2026", "Fait à {{VILLE_SIGNATURE}}, le {{DATE_ASSEMBLEE_FR}}"],
  ["14 août 2026", "{{DATE_CLOTURE_FR}}"],
];

/* Ce qui reste de la société d'origine et n'a pas été remplacé : « Gérant » seul. */
const RESIDUS = [
  "STERLING",
  "Laugier",
  "899",
  "sqf",
  "qsf",
  "Paris",
  "août 2026",
  /* La forme de la société d'origine : elle se lisait « société d'exercice libéral ». */
  "exercice libéral",
  "20 000",
];

/**
 * La variante « petite entreprise ».
 *
 * Elle ne cache que le compte de résultat, et se fonde sur d'autres textes : le
 * remplacement porte donc sur les phrases qui nomment la portée et les articles.
 */
const VERS_PETITE = [
  [
    "Déclaration de confidentialité des comptes annuels",
    "Déclaration de confidentialité du compte de résultat",
  ],
  ["à l'annexe 1-5 de l'article A. 123-61-1", "à l'annexe 1-6 de l'article A. 123-61-1"],
  [
    "l'option de confidentialité ouverte aux micro-entreprises",
    "l'option de confidentialité du compte de résultat ouverte aux petites entreprises",
  ],
  [
    "les comptes annuels de l'exercice clos le {{DATE_CLOTURE_FR}}, déposés en annexe au registre du commerce et des sociétés, ne seront pas rendus publics",
    "le compte de résultat de l'exercice clos le {{DATE_CLOTURE_FR}}, déposé en annexe au registre du commerce et des sociétés, ne sera pas rendu public",
  ],
  [
    "la définition des micro-entreprises au sens de l'article L. 123-16-1 du code de commerce",
    "la définition des petites entreprises au sens de l'article L. 123-16 du code de commerce",
  ],
  [
    "La présente déclaration est établie à l'appui du dépôt des comptes annuels dudit exercice",
    "La présente déclaration est établie à l'appui du dépôt du compte de résultat dudit exercice",
  ],
  /*
   * La quatrième attestation ne vise que la micro-entreprise : l'article L. 123-16-1
   * ferme la confidentialité totale à qui gère des titres de participations. Une petite
   * entreprise garde celle du compte de résultat malgré cette activité, et le lui faire
   * attester serait lui faire signer ce que la loi ne lui demande pas.
   */
];

/*
 * Ce que la petite entreprise n'a pas à attester.
 *
 * La quatrième attestation ne vise que la micro-entreprise : l'article L. 123-16-1
 * ferme la confidentialité totale à qui gère des titres de participations. Une petite
 * entreprise garde celle de son compte de résultat malgré cette activité, et le lui
 * faire attester serait lui faire signer ce que la loi ne lui demande pas.
 */
const PARAGRAPHE_A_RETIRER =
  "que la Société n'a pas pour activité la gestion des titres de participations";

function texteDe(xml) {
  return xml
    .replace(/<[^>]*>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Retire le paragraphe qui porte ce texte.
 *
 * Le remplacer par du vide laisserait une puce et une ligne blanche au milieu d'une
 * énumération : c'est le paragraphe entier qui doit partir, balises comprises.
 */
function sansLeParagraphe(xml, texte) {
  const dedans = xml.indexOf(texte);
  if (dedans === -1) {
    console.error("Paragraphe à retirer introuvable : " + texte);
    process.exit(1);
  }
  const debut = xml.lastIndexOf("<w:p ", dedans);
  const ouvrant = xml.lastIndexOf("<w:p>", dedans);
  const depart = Math.max(debut, ouvrant);
  const fin = xml.indexOf("</w:p>", dedans) + "</w:p>".length;
  return xml.slice(0, depart) + xml.slice(fin);
}

function ecrire(nom, xml) {
  const zip = new PizZip(readFileSync(SOURCE));
  zip.file("word/document.xml", xml);
  const cible = path.join(TEMPLATES, nom);
  writeFileSync(cible, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  return cible;
}

const origine = new PizZip(readFileSync(SOURCE)).file("word/document.xml").asText();

/*
 * Word découpe une phrase en fragments dès qu'un caractère change de mise en forme.
 * Une valeur à remplacer peut donc être coupée en trois, et la recherche échouerait
 * sans les recoller d'abord.
 */
function recoller(xml) {
  return xml.replace(/<\/w:t><\/w:r>(?:<w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:t[^>]*>)/g, "");
}

/*
 * Les apostrophes, ramenées à une seule forme.
 *
 * Word écrit l'apostrophe tantôt `&apos;`, tantôt `&#8217;` selon la correction
 * automatique : une recherche portant sur le caractère nu n'en trouvait aucune, et deux
 * valeurs du modèle - la forme juridique, le capital - repartaient telles quelles dans
 * le gabarit. Le caractère nu est licite dans le texte d'un élément XML.
 */
function apostrophes(xml) {
  return xml.replace(/&apos;|&#8217;|&#x2019;|\u2019/g, "'");
}

let micro = apostrophes(recoller(origine));
for (const [valeur, variable] of VARIABLES) {
  micro = micro.split(valeur).join(variable);
}

const restants = RESIDUS.filter((r) => texteDe(micro).includes(r));
if (restants.length > 0) {
  console.error("Données du modèle non remplacées : " + restants.join(", "));
  process.exit(1);
}

let petite = micro;
for (const [avant, apres] of VERS_PETITE) {
  petite = petite.split(avant).join(apres);
}
petite = sansLeParagraphe(petite, PARAGRAPHE_A_RETIRER);

/* La troisième attestation devient la dernière : c'est elle qui porte le point final. */
petite = petite.replace(
  "n'est pas mentionnée à l'article L. 123-16-2 du même code ;",
  "n'est pas mentionnée à l'article L. 123-16-2 du même code."
);

console.log(ecrire("comptes-confidentialite-micro.docx", micro));
console.log(ecrire("comptes-confidentialite-petite.docx", petite));
