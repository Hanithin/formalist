/*
 * L'attestation de mise à disposition du domicile, refaite sur le modèle du cabinet.
 *
 * Elle portait une contradiction que rien ne signalait. Le texte annonçait une
 * domiciliation « pour une durée ne pouvant excéder cinq ans », puis certifiait dans le
 * paragraphe suivant qu'« aucune disposition législative ou stipulation contractuelle
 * ne s'oppose » à l'établissement du siège. Or l'article L. 123-11-1 du code de commerce
 * dit exactement l'inverse : la domiciliation au domicile du représentant légal est
 * libre et sans terme quand rien ne s'y oppose, et ce n'est que lorsqu'un bail ou un
 * règlement de copropriété l'interdit qu'elle est bornée à cinq ans. L'attestation
 * affirmait donc les deux à la fois.
 *
 * Le statut d'occupation souffrait du même mal : gabarit.ts écrivait « propriétaire »
 * pour tout le monde, locataires compris, avec un commentaire qui l'avouait.
 *
 * Les deux cas sont désormais deux blocs, et le formulaire demande lequel s'applique.
 *
 * Idempotent : relancé, il réécrit les quatre fichiers à l'identique.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const GABARITS = path.join(__dirname, "..", "templates");

/* Chaque forme a son fichier, sa dénomination en clair et le titre de son dirigeant. */
const FORMES = [
  { cle: "sas", libelle: "Société par actions simplifiée", dirigeant: "Président" },
  {
    cle: "sasu",
    libelle: "Société par actions simplifiée unipersonnelle",
    dirigeant: "Président",
  },
  { cle: "sarl", libelle: "Société à responsabilité limitée", dirigeant: "gérant" },
  { cle: "sci", libelle: "Société civile immobilière", dirigeant: "gérant" },
];

/* ------------------------------------------------------------- La mise en forme */

const POLICE =
  '<w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/>';

const RUNS = {
  enteteNom: POLICE + '<w:b/><w:sz w:val="25"/><w:szCs w:val="28"/>',
  entete: POLICE + '<w:sz w:val="20"/><w:szCs w:val="20"/>',
  titre: POLICE + '<w:b/><w:caps/><w:sz w:val="26"/><w:szCs w:val="26"/>',
  gras: POLICE + "<w:b/>",
  normal: POLICE,
  petit: POLICE + '<w:sz w:val="20"/><w:szCs w:val="20"/>',
};

const PARAGRAPHES = {
  enteteNom: '<w:spacing w:before="0" w:after="40" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/>',
  entete: '<w:spacing w:before="0" w:after="40" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/>',
  enteteFin: '<w:spacing w:before="0" w:after="360" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/>',
  titre:
    '<w:keepNext/><w:spacing w:before="0" w:after="360" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/>',
  intitule:
    '<w:keepNext/><w:spacing w:before="0" w:after="120" w:line="276" w:lineRule="auto"/>',
  corps: '<w:spacing w:before="0" w:after="120" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/>',
  corpsEspace: '<w:spacing w:before="0" w:after="240" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/>',
  final: '<w:spacing w:before="0" w:after="360" w:line="276" w:lineRule="auto"/><w:jc w:val="both"/>',
  muet: '<w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto"/>',
  trait: '<w:spacing w:before="480" w:after="0" w:line="276" w:lineRule="auto"/>',
  signature: '<w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto"/>',
  qualite: '<w:spacing w:before="0" w:after="120" w:line="276" w:lineRule="auto"/>',
};

function echapper(texte) {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function p(bloc, run, texte) {
  return (
    "<w:p><w:pPr>" +
    PARAGRAPHES[bloc] +
    "</w:pPr><w:r><w:rPr>" +
    RUNS[run] +
    '</w:rPr><w:t xml:space="preserve">' +
    echapper(texte) +
    "</w:t></w:r></w:p>"
  );
}

/* ------------------------------------------------------------------- Le contenu */

function corpsDe(forme) {
  const morceaux = [];
  const a = (bloc, run, texte) => morceaux.push(p(bloc, run, texte));
  const b = (marque) => morceaux.push(p("muet", "normal", marque));

  /* L'en-tête de la société, comme sur les autres actes de la création. */
  a("enteteNom", "enteteNom", "{{NOM_SOCIETE}}");
  a("entete", "entete", forme.libelle + " au capital de {{CAPITAL}} euros");
  a("enteteFin", "entete", "Siège social : {{ADRESSE_SIEGE}}");

  a("titre", "titre", "Mise à disposition de locaux {{MENTION_DUREE_TITRE}}");

  a("intitule", "gras", "{{LE_SOUSSIGNE}} :");

  a(
    "corpsEspace",
    "normal",
    "{{CIVILITE_NOM_PRENOM_1}}, né(e) le {{DATE_NAISSANCE_1}} à {{LIEU_NAISSANCE_1}}, " +
      "de nationalité {{NATIONALITE_1}}, demeurant {{ADRESSE_ASSOCIE_1}}."
  );

  a(
    "corps",
    "normal",
    "Agissant en tant que résident habituel de son domicile principal, " +
      "{{DONT_IL_EST}} {{STATUT_OCCUPATION}}, atteste que celui-ci est mis à " +
      "disposition de :"
  );

  /* La société bénéficiaire, reprise en bloc centré comme dans le modèle. */
  a("enteteNom", "enteteNom", "{{NOM_SOCIETE}}");
  a("entete", "entete", forme.libelle + " au capital de {{CAPITAL}} euros");
  a("enteteFin", "entete", "Siège social : {{ADRESSE_SIEGE}}");

  a(
    "corps",
    "normal",
    "{{DONT_IL_EST}} " +
      forme.dirigeant +
      ", pour y installer son siège social dès ce jour, {{MENTION_DUREE}}, afin d'y " +
      "exercer une activité ne nécessitant pas le passage de clientèle ni la réception " +
      "de marchandises (article L. 123-11 du code de commerce)."
  );

  /*
   * Le cas où quelque chose s'y oppose, et lui seul.
   *
   * Un bail qui l'interdit, un règlement de copropriété qui le réserve à l'habitation :
   * l'article L. 123-11-1 borne alors la domiciliation à cinq ans, et impose de
   * prévenir le bailleur ou le syndic. Hors de ce cas, écrire ces deux phrases serait
   * s'imposer une contrainte que la loi ne demande pas.
   */
  b("{{#DUREE_LIMITEE}}");
  a(
    "corps",
    "normal",
    "Une stipulation du bail ou du règlement de copropriété s'opposant à cette " +
      "domiciliation, celle-ci est consentie pour une durée ne pouvant ni excéder cinq " +
      "ans à compter de l'immatriculation de la société, ni dépasser le terme légal, " +
      "contractuel ou judiciaire de l'occupation des locaux, conformément à l'article " +
      "L. 123-11-1 du code de commerce."
  );
  a(
    "corps",
    "normal",
    "{{LE_SOUSSIGNE}} s'engage à notifier cette domiciliation, par lettre recommandée avec " +
      "demande d'avis de réception, au bailleur, au syndicat de copropriété ou au " +
      "représentant de l'ensemble immobilier, dans le mois de l'immatriculation."
  );
  b("{{/DUREE_LIMITEE}}");

  b("{{^DUREE_LIMITEE}}");
  a(
    "corps",
    "normal",
    "{{LE_SOUSSIGNE}} certifie sur l'honneur qu'aucune disposition législative ni " +
      "stipulation contractuelle ne s'oppose à l'établissement du siège social à cette " +
      "adresse, de sorte que la mise à disposition n'est assortie d'aucun terme."
  );
  b("{{/DUREE_LIMITEE}}");

  a(
    "final",
    "normal",
    "La présente attestation est établie pour servir et valoir ce que de droit, " +
      "notamment en vue de l'immatriculation de la société au registre du commerce et " +
      "des sociétés."
  );

  a("corps", "normal", "Fait à {{VILLE_SOCIETE}}, le {{DATE_SIGNATURE_COURTE}}");

  a("trait", "normal", "______________________________");
  a("signature", "normal", "{{CIVILITE_NOM_PRENOM_1}}");
  a("qualite", "petit", forme.dirigeant.charAt(0).toUpperCase() + forme.dirigeant.slice(1));

  return morceaux.join("");
}

/* ------------------------------------------------------------------ L'assemblage */

for (const forme of FORMES) {
  const nom = forme.cle + "-attestation-domicile.docx";
  const chemin = path.join(GABARITS, nom);

  const zip = new PizZip(readFileSync(chemin));
  const document = zip.file("word/document.xml").asText();

  /* On garde l'enveloppe : styles, en-tête, thème. Seul le corps change. */
  const ouverture = document.slice(0, document.indexOf("<w:body>") + "<w:body>".length);
  const queue = document.slice(document.lastIndexOf("</w:body>"));
  const sectPr = document.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);

  zip.file(
    "word/document.xml",
    ouverture + corpsDe(forme) + (sectPr ? sectPr[0] : "") + queue
  );

  writeFileSync(chemin, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("  " + nom.padEnd(38) + forme.libelle);
}

console.log("\n" + FORMES.length + " attestations réécrites.");
