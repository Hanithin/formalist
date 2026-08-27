/*
 * La forme des procès-verbaux d'approbation, reprise du modèle repassé par le cabinet.
 *
 * Le fichier renvoyé est un rendu : les conditions du gabarit - la dotation à la
 * réserve légale quand elle est due, les conventions quand il y en a, la boucle des
 * signataires - y ont disparu avec les données qu'elles décidaient. L'adopter tel quel
 * aurait donné un acte juste pour ce dossier-là et faux pour tous les autres. Ce sont
 * donc ses choix de forme qui sont portés sur le gabarit, un par un.
 *
 * Sept écarts relevés en le comparant au nôtre :
 *
 * - le corps passe de onze à douze points, et l'en-tête de dix à douze ;
 * - le nom de la société et le titre principal passent à quatorze ;
 * - le titre principal perd son soulignement : il est déjà seul, centré et en gras ;
 * - « EN DATE DU » disparaît, la date figurant déjà dans la première phrase ;
 * - la ligne d'immatriculation se dit « RCS Paris - SIREN 899 979 934 », plus courte
 *   que « Immatriculée au registre du commerce et des sociétés de Paris sous le
 *   numéro » qui prenait deux lignes ;
 * - « ORDRE DU JOUR » se met en italique, ce qui le distingue des intitulés de
 *   décision sans lui donner leur poids ;
 * - « L'associé unique : », au-dessus de la signature, n'est plus en gras.
 *
 * Idempotent : relancé, il ne trouve plus rien à changer.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");

/** Le remplacement d'un fragment, avec le compte de ce qu'il a touché. */
function remplacer(xml, avant, apres) {
  const morceaux = xml.split(avant);
  return { xml: morceaux.join(apres), fois: morceaux.length - 1 };
}

/**
 * Retire le paragraphe qui porte ce texte.
 *
 * Le vider laisserait une ligne blanche là où l'espacement suffit déjà.
 */
function sansLeParagraphe(xml, texte) {
  const dedans = xml.indexOf(texte);
  if (dedans === -1) return xml;
  const avant = Math.max(xml.lastIndexOf("<w:p ", dedans), xml.lastIndexOf("<w:p>", dedans));
  const apres = xml.indexOf("</w:p>", dedans) + "</w:p>".length;
  return xml.slice(0, avant) + xml.slice(apres);
}

const CORRECTIONS = [
  /* Le corps du document : douze points, comme le modèle. */
  { ou: "styles", avant: '<w:sz w:val="22"/>', apres: '<w:sz w:val="24"/>' },
  { ou: "styles", avant: '<w:szCs w:val="22"/>', apres: '<w:szCs w:val="24"/>' },

  /* Le nom de la société, en tête. */
  { avant: '<w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">{{SOCIETE}}',
    apres: '<w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">{{SOCIETE}}' },

  /* Les trois lignes d'identification, de dix à douze points. */
  { avant: '<w:sz w:val="20"/>', apres: '<w:sz w:val="24"/>' },

  /* Les intitulés de décision, et le titre principal. */
  { avant: '<w:sz w:val="22"/>', apres: '<w:sz w:val="24"/>' },
  { avant: '<w:b/><w:sz w:val="25"/><w:u w:val="single"/>', apres: '<w:b/><w:sz w:val="28"/>' },

  /* L'ordre du jour : italique plutôt qu'un second gras de même poids. */
  { avant: '<w:b/><w:sz w:val="26"/></w:rPr><w:t xml:space="preserve">ORDRE DU JOUR',
    apres: '<w:b/><w:i/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">ORDRE DU JOUR' },

  /* La ligne d'immatriculation, plus courte. */
  { avant: "Immatriculée au registre du commerce et des sociétés {{RCS_DE}} sous le numéro {{SIREN}}",
    apres: "RCS {{RCS_VILLE}} - SIREN {{SIREN}}" },

  /*
   * Le titre de la signature ne porte plus le gras des intitulés.
   *
   * L'apostrophe est nue dans ces gabarits, non `&apos;` : Word l'écrit tantôt d'une
   * façon, tantôt de l'autre, et une recherche sur la mauvaise ne trouve rien.
   */
  { avant: '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">L\'associé unique :',
    apres: '<w:r><w:t xml:space="preserve">L\'associé unique :' },
  { avant: '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Les associés :',
    apres: '<w:r><w:t xml:space="preserve">Les associés :' },
];

/* La date figure dans la première phrase : la répéter en tête n'apporte rien. */
const A_RETIRER = "EN DATE DU {{DATE_ASSEMBLEE_FR}}";

let touches = 0;

for (const nom of ["comptes-pv-associe-unique.docx", "comptes-pv-assemblee.docx"]) {
  const cible = path.join(TEMPLATES, nom);
  const zip = new PizZip(readFileSync(cible));

  const avant = {
    document: zip.file("word/document.xml").asText(),
    styles: zip.file("word/styles.xml").asText(),
  };
  const apres = { document: avant.document, styles: avant.styles };

  for (const correction of CORRECTIONS) {
    const cle = correction.ou === "styles" ? "styles" : "document";
    apres[cle] = remplacer(apres[cle], correction.avant, correction.apres).xml;
  }
  apres.document = sansLeParagraphe(apres.document, A_RETIRER);

  if (apres.document === avant.document && apres.styles === avant.styles) {
    console.log(nom + " : rien à changer.");
    continue;
  }

  zip.file("word/document.xml", apres.document);
  zip.file("word/styles.xml", apres.styles);
  writeFileSync(cible, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(nom + " : forme reprise.");
  touches += 1;
}

if (touches === 0) process.exit(0);
