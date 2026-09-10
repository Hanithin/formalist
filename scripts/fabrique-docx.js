/**
 * La fabrique de documents Word du cabinet.
 *
 * Un docx est un zip de XML : sans styles.xml, il prend la police par défaut du logiciel
 * qui l'ouvre - Calibri sur un poste, autre chose ailleurs. Ces quelques fonctions posent
 * la feuille de styles de la maison, la typographie française et la mise en page des
 * actes, pour que deux scripts qui produisent des gabarits ne les posent pas
 * différemment.
 *
 * Elles vivaient dans le script du pouvoir, seul à en avoir besoin. Les actes de
 * constatation d'augmentation en ont besoin des mêmes : les recopier, c'était garantir
 * qu'une correction portée à l'un ne toucherait pas l'autre.
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


/**
 * Un tableau Word, pour les annexes qui se lisent en colonnes.
 *
 * La liste des souscripteurs, leur montant, leur prix et leurs actions : en paragraphes
 * tabulés, la moindre dénomination longue décale la colonne suivante sur toute la
 * hauteur. Les largeurs sont en twips, sur une page utile de 9026.
 */
function tableau(lignes, largeurs, opts = {}) {
  const bord =
    "<w:tblBorders>" +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((c) => "<w:" + c + ' w:val="single" w:sz="4" w:color="BFBFBF"/>')
      .join("") +
    "</w:tblBorders>";
  const grille =
    "<w:tblGrid>" + largeurs.map((l) => '<w:gridCol w:w="' + l + '"/>').join("") + "</w:tblGrid>";

  const corps = lignes
    .map((cellules, rang) => {
      /* Une ligne de boucle porte ses balises d'ouverture et de fermeture dans la ligne. */
      const ouvre = opts.boucle && rang === lignes.length - 1 ? "{{#" + opts.boucle + "}}" : "";
      const ferme = opts.boucle && rang === lignes.length - 1 ? "{{/" + opts.boucle + "}}" : "";
      return (
        "<w:tr>" +
        cellules
          .map((texte, i) => {
            const contenu =
              (i === 0 ? ouvre : "") + texte + (i === cellules.length - 1 ? ferme : "");
            return (
              '<w:tc><w:tcPr><w:tcW w:w="' + largeurs[i] + '" w:type="dxa"/></w:tcPr>' +
              p(rang === 0 ? "**" + contenu + "**" : contenu, { apres: 40, taille: 19 }) +
              "</w:tc>"
            );
          })
          .join("") +
        "</w:tr>"
      );
    })
    .join("");

  return (
    '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + bord + "</w:tblPr>" + grille + corps + "</w:tbl>"
  );
}

module.exports = { typographier, escXml, p, si, entete, creerDocx, tableau, BLOC, TEMPLATES };
