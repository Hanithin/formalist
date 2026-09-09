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
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");

const FINE = " ";
const INSECABLE = " ";

function typographier(texte) {
  return texte
    .replace(/[—–]/g, "-")
    .replace(/«\s*/g, "«" + FINE)
    .replace(/\s*»/g, FINE + "»")
    .replace(/\s*([;!?])/g, FINE + "$1")
    .replace(/([^\d\s]|^)\s*:(\s|$)/g, "$1" + FINE + ":$2")
    .replace(/(\d)\s+(euros?|ans?|années?)\b/g, "$1" + INSECABLE + "$2")
    .replace(/(\d)\s+([€%])/g, "$1" + INSECABLE + "$2");
}

function escXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function p(texte, opts = {}) {
  const contenu = typographier(texte);

  let rpr = "";
  if (opts.gras) rpr += "<w:b/>";
  if (opts.taille) rpr += '<w:sz w:val="' + opts.taille + '"/>';
  if (opts.souligne) rpr += '<w:u w:val="single"/>';
  if (opts.italique) rpr += "<w:i/>";
  const rprXml = rpr ? "<w:rPr>" + rpr + "</w:rPr>" : "";

  let ppr = "";
  /* Le corps est justifié par la feuille de styles : seul le centrage se demande. */
  if (opts.centre) ppr += '<w:jc w:val="center"/>';
  /* Un tiret de liste : retrait à gauche, et le tiret dans le texte. */
  if (opts.retrait) ppr += '<w:ind w:left="' + opts.retrait + '" w:hanging="283"/>';
  if (opts.apres !== undefined || opts.avant !== undefined) {
    ppr +=
      "<w:spacing" +
      (opts.avant !== undefined ? ' w:before="' + opts.avant + '"' : "") +
      ' w:after="' + (opts.apres === undefined ? 0 : opts.apres) + '"/>';
  }
  const pprXml = ppr ? "<w:pPr>" + ppr + "</w:pPr>" : "";

  /*
   * Le gras au milieu d'une phrase.
   *
   * « l'ensemble des formalités relatives à **la création** de la société » : le modèle
   * du cabinet met l'objet en gras, et un paragraphe n'a qu'un jeu de propriétés. Les
   * astérisques doubles ouvrent et ferment un second passage, dans le même paragraphe.
   */
  const morceaux = contenu.split("**");
  let runs = "";
  morceaux.forEach((morceau, rang) => {
    if (morceau === "") return;
    const accent = rang % 2 === 1;
    const propres = accent ? "<w:rPr>" + rpr + "<w:b/></w:rPr>" : rprXml;
    morceau.split("\n").forEach((ligne, i, lignes) => {
      runs += "<w:r>" + propres + '<w:t xml:space="preserve">' + escXml(ligne) + "</w:t></w:r>";
      if (i < lignes.length - 1) runs += "<w:r><w:br/></w:r>";
    });
  });

  return "<w:p>" + pprXml + runs + "</w:p>";
}

/*
 * L'air entre deux blocs se règle par l'espacement, non par un paragraphe vide.
 *
 * Un paragraphe vide ajoute sa hauteur de ligne aux deux espacements qui l'encadrent :
 * entre l'immatriculation de la société et la déclaration, cela faisait un trou de
 * trois lignes au milieu d'un acte d'une page.
 *
 * Les valeurs posées ici ne se lisent que sur le gabarit : `typographierLeDocument`,
 * que tous les parcours appliquent, ramène l'espacement des actes produits au rythme
 * de la maison - cent vingt twips et un interligne de 1,15. C'est ce qui fait qu'un
 * jeu d'actes se lit d'un seul trait, et c'est pourquoi il ne sert à rien de régler
 * cet écart au twip près.
 */
const BLOC = 400;

/*
 * La feuille de styles des autres actes, mot pour mot.
 *
 * Cambria en onze points, interligne 1,15, deux cents twips sous chaque paragraphe et
 * texte justifié : c'est ce que portent les actes de fermeture et de création, et c'est
 * ce qui fait qu'un jeu d'actes se lit comme un jeu et non comme une pile de documents
 * venus d'ailleurs. Un docx sans styles.xml prend la police par défaut du logiciel qui
 * l'ouvre - Calibri sur un poste, autre chose ailleurs.
 */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n' +
  "  <w:docDefaults>\n" +
  "    <w:rPrDefault>\n" +
  "      <w:rPr>\n" +
  '        <w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:eastAsia="Cambria" w:cs="Cambria"/>\n' +
  '        <w:sz w:val="22"/>\n' +
  '        <w:szCs w:val="22"/>\n' +
  '        <w:lang w:val="fr-FR"/>\n' +
  "      </w:rPr>\n" +
  "    </w:rPrDefault>\n" +
  "    <w:pPrDefault>\n" +
  "      <w:pPr>\n" +
  "        <w:widowControl/>\n" +
  '        <w:spacing w:after="160" w:line="276" w:lineRule="auto"/>\n' +
  '        <w:jc w:val="both"/>\n' +
  "      </w:pPr>\n" +
  "    </w:pPrDefault>\n" +
  "  </w:docDefaults>\n" +
  '  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">\n' +
  '    <w:name w:val="Normal"/>\n' +
  "    <w:qFormat/>\n" +
  "  </w:style>\n" +
  "</w:styles>\n";

function creerDocx(corps) {
  const zip = new PizZip();

  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      "</Types>"
  );

  zip.file("word/styles.xml", STYLES);

  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>"
  );

  zip.file(
    "word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      "</Relationships>"
  );

  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
      'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
      'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
      'xmlns:v="urn:schemas-microsoft-com:vml" ' +
      'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
      'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
      'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ' +
      'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ' +
      'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
      "<w:body>" +
      corps +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>' +
      "</w:body></w:document>"
  );

  return zip.generate({ type: "nodebuffer" });
}

/**
 * Une section conditionnelle, marqueurs sur leurs propres lignes.
 *
 * Un marqueur posé au début d'un paragraphe de texte laisse, quand la condition est
 * fausse, un paragraphe vide - une ligne blanche au milieu de l'en-tête. Seul sur sa
 * ligne, le paragraphe disparaît avec sa condition.
 */
function si(drapeau, corps) {
  return p("{{#" + drapeau + "}}", { apres: 0 }) + corps + p("{{/" + drapeau + "}}", { apres: 0 });
}

/*
 * L'en-tête d'identification des actes de la maison.
 *
 * Nom de la société en gras et centré, puis sa forme, son siège et son immatriculation
 * en petit corps : c'est ce que portent tous les procès-verbaux du produit, et c'est ce
 * qui identifie la société avant qu'on lise de quoi il s'agit.
 *
 * Ces lignes sont centrées et brèves. La même identification écrite en toutes lettres
 * au fil d'un paragraphe justifié rejetait le numéro de SIREN seul en bout de ligne.
 */
function entete(prefixe) {
  return (
    p("{{" + prefixe + "_SOCIETE}}", { centre: true, gras: true, taille: 26, apres: 0 }) +
    p("{{" + prefixe + "_SOCIETE_FORME}}", { centre: true, taille: 20, apres: 0 }) +
    p("{{" + prefixe + "_SOCIETE_SIEGE}}", { centre: true, taille: 20, apres: 0 }) +
    si(
      prefixe + "_SOCIETE_IMMATRICULEE",
      p("{{" + prefixe + "_SOCIETE_RCS}}", { centre: true, taille: 20, apres: 0 })
    )
  );
}

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
