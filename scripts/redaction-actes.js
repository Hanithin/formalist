#!/usr/bin/env node
/**
 * Reprend la rédaction des procès-verbaux, comme un cabinet les écrit.
 *
 * Quatre reprises, chacune sur un défaut précis :
 *
 *   1. La ligne de signature reprenait l'identification complète d'un associé personne
 *      morale - forme, capital, siège, numéro, représentant - soit trois lignes au bas
 *      de la page pour redire ce que la liste des présents a déjà dit. Elle ne porte
 *      plus que le nom et la main qui signe (voir nomPourSignature, côté domaine).
 *
 *   2. L'ordre du jour tenait sur une ligne, points séparés par des virgules. C'est ce
 *      qu'on cherche en premier dans un acte : il se pose en liste.
 *
 *   3. « Fait au siège social » ne dit pas où. Un acte se signe dans une ville, et il
 *      s'établit en autant d'originaux que les formalités en réclament.
 *
 *   4. La clôture ne disait ni la lecture, ni le registre des délibérations, que la loi
 *      impose de tenir.
 *
 * Idempotent : un gabarit déjà repris est laissé tel quel.
 *
 *   node scripts/redaction-actes.js
 */
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");

/** Les procès-verbaux collégiaux : ce sont eux qui portent un ordre du jour. */
const COLLEGIAUX = [
  "modif-pv-transfert-siege-sas.docx",
  "modif-pv-transfert-siege-sarl.docx",
  "modif-pv-transfert-siege-sci.docx",
];

const UNIPERSONNELS = [
  "modif-pv-transfert-siege-sasu.docx",
  "modif-pv-transfert-siege-eurl.docx",
];

const AVENANT = "modif-avenant-statuts.docx";

function paragraphe(texte, options = {}) {
  const gras = options.gras ? "<w:rPr><w:b/></w:rPr>" : "";
  const indentation = options.puce ? '<w:ind w:left="425" w:hanging="170"/>' : "";
  const espace = options.espace ? '<w:spacing w:after="' + options.espace + '"/>' : "";
  const pPr = indentation || espace ? "<w:pPr>" + espace + indentation + "</w:pPr>" : "";

  return (
    "<w:p>" +
    pPr +
    "<w:r>" +
    gras +
    '<w:t xml:space="preserve">' +
    texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
    "</w:t></w:r></w:p>"
  );
}

/*
 * Retrouver une phrase dans le XML, malgré ses espaces.
 *
 * Les gabarits portent la typographie française : une espace fine insécable avant les
 * deux-points, une insécable avant un point-virgule. Recopier la phrase avec des
 * espaces ordinaires ne la retrouve donc pas - et la reprise passait en silence.
 */
function chercher(texte) {
  const echappe = texte.replace(/&/g, "&amp;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(echappe.replace(/\s+/g, "[\\s\u00a0\u202f]+"), "g");
}

/** Le texte d'un paragraphe existant, tel qu'il apparaît dans le XML. */
function remplacerLeTexte(xml, avant, apres) {
  const cible = chercher(avant);
  if (!cible.test(xml)) return { xml, fait: false };
  return { xml: xml.replace(chercher(avant), apres.replace(/&/g, "&amp;")), fait: true };
}

/* ---------------------------------------------------------------- 1. Signature */

function signatureCourte(xml) {
  if (!xml.includes("{{nomComplet}}")) return { xml, fait: false };
  return { xml: xml.split("{{nomComplet}}").join("{{nomSignature}}"), fait: true };
}

/* ------------------------------------------------------------ 2. Ordre du jour */

const ORDRE_ACTUEL = {
  "modif-pv-transfert-siege-sas.docx":
    "Le président rappelle que l'assemblée est appelée à délibérer sur l'ordre du jour suivant : {{LABEL_MODIFICATION}}, et sur les pouvoirs à donner pour l'accomplissement des formalités.",
  "modif-pv-transfert-siege-sarl.docx":
    "Le gérant rappelle que l'assemblée est appelée à délibérer sur l'ordre du jour suivant : {{LABEL_MODIFICATION}}, et sur les pouvoirs à donner pour l'accomplissement des formalités.",
  "modif-pv-transfert-siege-sci.docx":
    "Le gérant rappelle que l'assemblée est appelée à délibérer sur l'ordre du jour suivant : {{LABEL_MODIFICATION}}, et sur les pouvoirs à donner pour l'accomplissement des formalités.",
};

function ordreDuJourEnListe(xml, nom) {
  const actuel = ORDRE_ACTUEL[nom];
  if (!actuel) return { xml, fait: false };

  const trouve = chercher(actuel).exec(xml);
  if (!trouve) return { xml, fait: false };

  const qui = nom.includes("-sas") ? "Le président" : "Le gérant";
  const liste =
    paragraphe(qui + " rappelle que l'assemblée est appelée à délibérer sur l'ordre du jour suivant :", { espace: 100 }) +
    paragraphe("{{#MODIFICATIONS}}") +
    paragraphe("- {{libelle}}", { puce: true, espace: 60 }) +
    paragraphe("{{/MODIFICATIONS}}") +
    paragraphe("- pouvoirs à donner pour l'accomplissement des formalités de publicité et de dépôt.", { puce: true });

  /*
   * Le paragraphe entier est remplacé, non son texte : il faut plusieurs paragraphes là
   * où il n'y en avait qu'un, et une puce ne s'obtient pas en insérant un tiret dans une
   * phrase.
   */
  const debut = xml.lastIndexOf("<w:p>", trouve.index);
  const fin = xml.indexOf("</w:p>", trouve.index) + "</w:p>".length;

  return { xml: xml.slice(0, debut) + liste + xml.slice(fin), fait: true };
}

/* -------------------------------------------------------- 5. Les présents */

/*
 * Les présents, un par ligne.
 *
 * Ils tenaient dans un seul paragraphe, séparés par des points-virgules : sur une
 * assemblée de quatre associés dont deux sociétés, le bloc faisait huit lignes pleines
 * où l'on ne retrouvait ni les noms ni les parts. C'est pourtant ce qu'un lecteur
 * vérifie en premier - qui délibère, et avec combien de titres.
 */
function presentsEnListe(xml) {
  const trouve = chercher("{{ASSOCIE_LISTE}}").exec(xml);
  if (!trouve) return { xml, fait: false };

  const liste =
    paragraphe("{{#ASSOCIES}}") +
    /*
     * « designation » et non « nomComplet » : la reprise de la signature remplace
     * partout {{nomComplet}}, et emporterait cette liste avec elle.
     */
    paragraphe("- {{designation}}, détenant {{partsFormatees}} {{MOT_TITRES}} ;", {
      puce: true,
      espace: 60,
    }) +
    paragraphe("{{/ASSOCIES}}");

  const debut = xml.lastIndexOf("<w:p>", trouve.index);
  const fin = xml.indexOf("</w:p>", trouve.index) + "</w:p>".length;

  return { xml: xml.slice(0, debut) + liste + xml.slice(fin), fait: true };
}

/* --------------------------------------------- 6. La forme, en tête de l'acte */

/*
 * L'en-tête commence par une capitale, comme toute ligne d'identification.
 *
 * « société par actions simplifiée au capital de 500 euros » s'écrivait en minuscule
 * sous le nom de la société, au milieu d'un bloc où chaque autre ligne commence par une
 * capitale - « Siège social : … », « Immatriculée au registre… ». La forme reste en bas
 * de casse partout ailleurs, où elle suit une virgule.
 *
 * Seule la première occurrence est reprise : c'est celle de l'en-tête. Les suivantes
 * sont dans des phrases - « La société X est une société par actions simplifiée… ».
 */
function formeEnTete(xml) {
  // Déjà repris : la seconde occurrence appartient à une phrase, elle reste en bas de
  // casse. Sans ce garde-fou, chaque passage capitalisait celle d'après.
  if (xml.includes("{{FORME_EN_CLAIR_CAPITALE}}")) return { xml, fait: false };

  const marque = "{{FORME_EN_CLAIR}}";
  const position = xml.indexOf(marque);
  if (position === -1) return { xml, fait: false };

  return {
    xml:
      xml.slice(0, position) +
      "{{FORME_EN_CLAIR_CAPITALE}}" +
      xml.slice(position + marque.length),
    fait: true,
  };
}

/* ------------------------------------------ 7. Deux fautes de rédaction */

/*
 * « L'assemblée générale, consulté » : l'accord manquait.
 *
 * La phrase vient de l'article 1844-6 du code civil, où c'est l'associé qui est
 * consulté ; recopiée sous « L'assemblée générale », elle laissait un participe au
 * masculin dans un acte que le greffe lit et que les associés signent.
 *
 * « Sa rémunération est fixée comme suit : Fixe. » : la phrase attendait un montant et
 * recevait le mot d'une liste déroulante. On la tourne autrement, pour que les trois
 * réponses possibles s'y logent.
 */
const FAUTES = [
  {
    /*
     * Deux parenthèses dans un acte signé, et une phrase qui attendait un montant.
     *
     * « L'intéressé(e) déclare accepter […] frappé(e) » : la civilité est connue, elle
     * s'accorde. « Sa rémunération est arrêtée par l'assemblée : Fixe. » recevait le
     * mot d'un menu déroulant là où une clause était attendue.
     */
    avant:
      "L'intéressé(e) déclare accepter ces fonctions et n'être frappé(e) d'aucune interdiction, incapacité ou déchéance susceptible de lui en interdire l'exercice. Sa rémunération est arrêtée par l'assemblée : {{REMUNERATION_DIRIGEANT}}.",
    apres: "{{PHRASE_ACCEPTATION}} {{PHRASE_REMUNERATION}}",
  },
  {
    // La même phrase, dans les gabarits qui n'ont pas reçu la reprise précédente.
    avant:
      "L'intéressé(e) déclare accepter ces fonctions et n'être frappé(e) d'aucune interdiction, incapacité ou déchéance susceptible de lui en interdire l'exercice. Sa rémunération est fixée comme suit : {{REMUNERATION_DIRIGEANT}}.",
    apres: "{{PHRASE_ACCEPTATION}} {{PHRASE_REMUNERATION}}",
  },
  {
    avant: "L'assemblée générale, consulté avant l'expiration du terme statutaire",
    apres: "L'assemblée générale, consultée avant l'expiration du terme statutaire",
  },
  {
    avant: "Sa rémunération est fixée comme suit : {{REMUNERATION_DIRIGEANT}}.",
    apres: "Sa rémunération est arrêtée par l'assemblée : {{REMUNERATION_DIRIGEANT}}.",
  },
];

function fautesCorrigees(xml) {
  let fait = false;
  for (const faute of FAUTES) {
    const essai = remplacerLeTexte(xml, faute.avant, faute.apres);
    xml = essai.xml;
    fait = fait || essai.fait;
  }
  return { xml, fait };
}

/* ------------------------------------------------------ 3. Lieu et originaux */

function lieuDeSignature(xml) {
  // Une première version posait VILLE_ACTUELLE, qui vient du registre en capitales.
  const repris = remplacerLeTexte(xml, "Fait à {{VILLE_ACTUELLE}}, le", "Fait à {{VILLE_SIGNATURE}}, le");
  if (repris.fait) return repris;

  return remplacerLeTexte(
    repris.xml,
    "Fait au siège social, le {{DATE_AGE}}.",
    "Fait à {{VILLE_SIGNATURE}}, le {{DATE_AGE}}, en autant d'originaux que nécessaire à l'accomplissement des formalités."
  );
}

/* ------------------------------------------------------------- 4. La clôture */

const CLOTURES = [
  {
    avant:
      "Plus rien n'étant à l'ordre du jour, la séance est levée. De tout ce que dessus, il a été dressé le présent procès-verbal, signé par les membres du bureau et les actionnaires présents.",
    apres:
      "L'ordre du jour étant épuisé et personne ne demandant plus la parole, la séance est levée. De tout ce que dessus, il a été dressé le présent procès-verbal qui, après lecture, a été signé par les actionnaires présents et sera reporté sur le registre des délibérations de la société.",
  },
  {
    avant:
      "Plus rien n'étant à l'ordre du jour, la séance est levée. De tout ce que dessus, il a été dressé le présent procès-verbal, signé par les membres du bureau et les associés présents.",
    apres:
      "L'ordre du jour étant épuisé et personne ne demandant plus la parole, la séance est levée. De tout ce que dessus, il a été dressé le présent procès-verbal qui, après lecture, a été signé par les associés présents et sera reporté sur le registre des délibérations de la société.",
  },
  {
    avant:
      "De tout ce que dessus, il a été dressé le présent procès-verbal, signé par l'associé unique.",
    apres:
      "De tout ce que dessus, il a été dressé le présent procès-verbal qui, après lecture, a été signé par l'associé unique et reporté sur le registre de ses décisions.",
  },
];

function clotureRedigee(xml) {
  let fait = false;
  for (const cloture of CLOTURES) {
    const essai = remplacerLeTexte(xml, cloture.avant, cloture.apres);
    xml = essai.xml;
    fait = fait || essai.fait;
  }
  return { xml, fait };
}

/* ------------------------------------------------------------------ Le passage */

const CONCERNES = [
  ...COLLEGIAUX,
  ...UNIPERSONNELS,
  AVENANT,
  /*
   * Les autres actes ne reçoivent que la reprise de l'en-tête : leur rédaction n'a pas
   * été revue ici, mais tous portent le même bloc d'identification.
   */
  ...fs
    .readdirSync(TEMPLATES)
    .filter((nom) => nom.endsWith(".docx"))
    .filter((nom) => ![...COLLEGIAUX, ...UNIPERSONNELS, AVENANT].includes(nom)),
];
let modifies = 0;

for (const nom of CONCERNES) {
  const chemin = path.join(TEMPLATES, nom);
  const zip = new PizZip(fs.readFileSync(chemin));
  let xml = zip.file("word/document.xml").asText();
  const reprises = [];

  for (const [libelle, reprise] of [
    ["signature", () => signatureCourte(xml)],
    ["ordre du jour", () => ordreDuJourEnListe(xml, nom)],
    ["présents", () => presentsEnListe(xml)],
    ["lieu", () => lieuDeSignature(xml)],
    ["clôture", () => clotureRedigee(xml)],
    ["en-tête", () => formeEnTete(xml)],
    ["accords", () => fautesCorrigees(xml)],
  ]) {
    const essai = reprise();
    xml = essai.xml;
    if (essai.fait) reprises.push(libelle);
  }

  if (reprises.length === 0) {
    console.log("déjà repris : " + nom);
    continue;
  }

  zip.file("word/document.xml", xml);
  fs.writeFileSync(chemin, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(nom + " : " + reprises.join(", "));
  modifies += 1;
}

console.log(modifies + " gabarit(s) repris.");
