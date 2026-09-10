#!/usr/bin/env node
/**
 * Fabrique templates/pouvoir.docx et templates/modif-etat-sieges-anterieurs.docx.
 *
 *   node scripts/pouvoir-et-etat-des-sieges.js
 *
 * Le pouvoir est commun aux trois parcours - création, modification, fermeture. Ce qui
 * change d'un parcours à l'autre tient dans des balises : la qualité du mandant,
 * l'objet de la formalité, la façon de désigner un siège qui n'existe pas encore.
 * Trois fichiers auraient divergé à la première correction portée à un seul.
 *
 * L'état des sièges antérieurs ne concerne qu'un transfert qui change de greffe :
 * l'article R.123-110 du code de commerce demande alors la liste des sièges
 * précédents, des greffes où la société a été immatriculée et de la date du dernier
 * transfert, certifiée conforme par le représentant légal.
 *
 * Relancer ce script réécrit les deux fichiers entièrement : ils n'ont pas d'autre
 * source. C'est ce qui le distingue de create-modif-templates.js, en retard sur les
 * gabarits qu'il produisait.
 */
const fs = require("fs");
const path = require("path");
/* La feuille de styles, la typographie et la mise en page sont communes aux gabarits. */
const { p, si, entete, creerDocx, BLOC, TEMPLATES } = require("./fabrique-docx");

/* ================================== Le pouvoir ================================== */

const POUVOIR = [
  entete("POUVOIR"),

  p("POUVOIR", { centre: true, gras: true, taille: 25, souligne: true, apres: 200, avant: BLOC }),
  p("FORMALITÉS AU GUICHET UNIQUE DES FORMALITÉS DES ENTREPRISES", {
    centre: true,
    gras: true,
    taille: 22,
    apres: BLOC,
  }),

  p("{{POUVOIR_MANDANT}},", { gras: true, apres: 200 }),
  p("(ci-après le « Mandant »),", { apres: 200 }),
  p("agissant en qualité de {{POUVOIR_QUALITE}} de la Société,", { apres: BLOC }),

  p("donne pouvoir à", { gras: true, apres: 100 }),
  p("{{POUVOIR_MANDATAIRE}},", { gras: true, apres: 200 }),
  p("(ci-après le « Mandataire »),", { apres: 200 }),

  p("à l'effet de :", { apres: 200 }),

  p(
    "-\tAccomplir en son nom et pour son compte l'ensemble des formalités relatives à " +
      "**{{POUVOIR_OBJET}}** de la Société ;",
    { retrait: 454, apres: 100 }
  ),
  p(
    "-\tSigner et déposer, par voie électronique sur la plateforme officielle du Guichet " +
      "Unique des formalités d'entreprises (INPI), l'ensemble des actes, documents et " +
      "formulaires afférents à ladite formalité ;",
    { retrait: 454, apres: 100 }
  ),
  p(
    "-\tUtiliser son propre accès FranceConnect+ à des fins d'authentification technique, " +
      "étant précisé que cette utilisation est faite au nom et pour le compte du Mandant, " +
      "en vertu du présent pouvoir exprès ;",
    { retrait: 454, apres: 100 }
  ),
  p(
    "-\tProduire et, le cas échéant, déposer le présent pouvoir auprès des autorités " +
      "compétentes ;",
    { retrait: 454, apres: 100 }
  ),
  p(
    "-\tPlus généralement, faire tout ce qui sera nécessaire à la bonne fin de la formalité.",
    { retrait: 454, apres: 200 }
  ),

  p(
    "Le présent pouvoir est valable exclusivement pour la formalité susvisée et prendra " +
      "fin à l'accomplissement définitif de celle-ci.",
    { apres: BLOC }
  ),

  p("Fait à {{POUVOIR_VILLE}}, le {{POUVOIR_DATE}}.", { apres: 200 }),
  p("En deux exemplaires originaux.", { apres: BLOC }),

  /*
    Le bloc de signature ne se coupe pas.

    La passe de mise en forme lie « Fait à… » à ce qui suit pour qu'un nom ne se
    retrouve jamais séparé de sa ligne de signature : la chaîne bascule entière au
    verso plutôt que de se rompre. C'est ce que fait aussi le modèle du cabinet, dont
    la signature occupe la seconde page.
  */
  p("Le Mandant", { gras: true, apres: 0 }),
  p("{{POUVOIR_MANDANT_NOM}}", { gras: true, apres: 200 }),
  p("Bon pour pouvoir", { italique: true, apres: 600 }),
  p("_______________________", { apres: 0 }),
].join("");

/* ====================== L'état des sièges sociaux antérieurs ====================== */

const SIEGES = [
  p("{{SIEGES_SOCIETE}}", { centre: true, gras: true, taille: 26, apres: 0 }),
  p("{{SIEGES_SOCIETE_FORME}}", { centre: true, taille: 20, apres: 0 }),
  p("{{SIEGES_SIEGE}}", { centre: true, taille: 20, apres: 0 }),
  p("{{SIEGES_IMMATRICULATION}}", { centre: true, taille: 20, apres: 0 }),

  p("LISTE DES SIÈGES SOCIAUX ANTÉRIEURS", {
    centre: true,
    gras: true,
    taille: 25,
    souligne: true,
    apres: 200,
    avant: BLOC,
  }),
  p("Article R.123-110 du code de commerce", { centre: true, taille: 20, apres: BLOC }),

  p("{{SIEGES_SIGNATAIRE}},", { gras: true, apres: 200 }),
  p("agissant en qualité de {{SIEGES_QUALITE}} de la Société,", { apres: BLOC }),

  p(
    "déclare, conformément aux dispositions de l'article R.123-110 du code de commerce, " +
      "que la société a eu les sièges sociaux suivants :",
    { apres: 200 }
  ),

  /*
   * La liste des sièges.
   *
   * Le siège que la société quitte y figure toujours - c'est celui qui devient
   * antérieur, et le greffe le lit d'abord. Les plus anciens viennent ensuite, tels
   * que le représentant légal les a déclarés, un par ligne.
   */
  p("{{#SIEGES_LISTE}}", { apres: 0 }),
  p("-\t{{.}}", { retrait: 454, apres: 100 }),
  p("{{/SIEGES_LISTE}}", { apres: 200 }),

  p(
    "Le dernier transfert de siège a été décidé le {{SIEGES_DATE_TRANSFERT}}, le siège " +
      "social étant transféré à l'adresse suivante : {{SIEGES_NOUVEAU}}.",
    { apres: BLOC }
  ),

  p("Certifié conforme à l'original.", { gras: true, apres: BLOC }),

  p("Fait à {{SIEGES_VILLE}}, le {{SIEGES_DATE}}.", { apres: BLOC }),

  p("{{SIEGES_QUALITE_SIGNATURE}}", { gras: true, apres: 0 }),
  p("{{SIEGES_SIGNATAIRE_NOM}}", { gras: true, apres: 600 }),
  p("_______________________", { apres: 0 }),
].join("");

/* ==================== L'attestation de mise à disposition du cabinet ==================== */

/*
 * Le cabinet met ses locaux à disposition d'une société en constitution.
 *
 * Ce n'est pas une domiciliation agréée : le cabinet n'a pas d'agrément préfectoral et
 * ne conclut pas de contrat de domiciliation. C'est une mise à disposition par un tiers,
 * et cette attestation en est le titre - c'est elle que le greffe lit comme justificatif
 * de la jouissance des locaux.
 *
 * Le texte reprend le modèle du cabinet : qui atteste et à quel titre, à qui, pour quels
 * locaux, à compter de quand, et ce que la mise à disposition autorise.
 */
const ATTESTATION_CABINET = [
  p("ATTESTATION DE MISE À DISPOSITION DE LOCAUX", {
    centre: true,
    gras: true,
    taille: 25,
    souligne: true,
    apres: BLOC,
  }),

  p(
    "Je soussigné **{{CABINET_SIGNATAIRE}}**, agissant en qualité de {{CABINET_QUALITE}} de " +
      "la société **{{CABINET_DENOMINATION}}**, {{CABINET_FORME}} au capital de " +
      "{{CABINET_CAPITAL}} euros, dont le siège social est situé {{CABINET_ADRESSE}}, " +
      "immatriculée au RCS de {{CABINET_GREFFE}} sous le numéro {{CABINET_SIREN}},",
    { apres: 200 }
  ),

  p("en sa qualité de {{CABINET_OCCUPATION}} des locaux situés {{CABINET_ADRESSE}},", {
    apres: 200,
  }),

  p(
    "atteste mettre à disposition de la société **{{NOM_SOCIETE}}**, {{FORME_EN_CLAIR}} en " +
      "cours d'immatriculation au RCS de {{RCS_VILLE}}, représentée par " +
      "{{DIRIGEANT_DESIGNE}}, les locaux ci-après désignés afin qu'elle y établisse son " +
      "siège social, à compter du {{DATE_SIGNATURE}} :",
    { apres: BLOC }
  ),

  p("{{CABINET_ADRESSE}}", { centre: true, gras: true, apres: BLOC }),

  p(
    "La présente mise à disposition autorise la société **{{NOM_SOCIETE}}** à fixer son " +
      "siège social à ladite adresse ainsi qu'à y recevoir son courrier.",
    { apres: BLOC }
  ),

  /*
   * Sans terme, et pour l'ensemble des locaux.
   *
   * Le modèle du cabinet s'arrêtait à l'autorisation. Le guichet demande à savoir
   * jusqu'à quand la société peut s'y tenir : une mise à disposition sans durée dite
   * s'entend comme précaire, et c'est ce que le greffe suppose à défaut d'écrit.
   */
  p(
    "Elle est consentie sans limitation de durée et confère à la société un droit de " +
      "jouissance privatif sur les locaux, tant qu'il n'y est pas mis fin.",
    { apres: BLOC }
  ),

  p("Fait à {{CABINET_VILLE}}, le {{DATE_SIGNATURE}},", { apres: BLOC }),

  p("{{CABINET_SIGNATURE_PIED}}", { centre: true, apres: 900 }),
  p("_______________________", { centre: true, apres: 0 }),
].join("");

fs.writeFileSync(path.join(TEMPLATES, "pouvoir.docx"), creerDocx(POUVOIR));
fs.writeFileSync(
  path.join(TEMPLATES, "attestation-domiciliation-cabinet.docx"),
  creerDocx(ATTESTATION_CABINET)
);
fs.writeFileSync(path.join(TEMPLATES, "modif-etat-sieges-anterieurs.docx"), creerDocx(SIEGES));

console.log(
  "pouvoir.docx, modif-etat-sieges-anterieurs.docx et " +
    "attestation-domiciliation-cabinet.docx écrits dans templates/"
);
