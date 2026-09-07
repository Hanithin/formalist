/*
 * L'état des actes accomplis, et la banque qui l'a rempli.
 *
 * L'annexe des statuts liste ce qui a été fait pour le compte de la société avant son
 * immatriculation. Chez Qonto, Shine et Revolut le capital n'est pas déposé à la banque
 * mais chez un notaire, et le compte ouvert est un compte de paiement : trois actes, pas
 * un. Le modèle du cabinet le dit - « si Qonto: », « Si Shein », « Si Revolut » écrits à
 * la main dans « 1 - Statuts et Etat des actes SAS Formalist.docx » - et le gabarit SARL
 * le portait déjà. Les gabarits SAS et SASU l'avaient perdu à la génération : leur annexe
 * n'écrivait plus que « ouverture d'un compte bancaire. », quelle que soit la banque.
 *
 * Ce script rouvre les deux .docx et réinsère les quatre blocs sous cette ligne, en
 * reprenant à l'identique la mise en forme du paragraphe qu'il suit - c'est un point de
 * liste, il faut que les nouveaux le soient aussi.
 *
 *   node scripts/annexe-actes-banque.js
 */

const fs = require("fs");
const path = require("path");
const PizZip = require(path.join(__dirname, "..", "web", "node_modules", "pizzip"));

const NOTAIRE = "l’étude notariale de Maître Quentin Fourez, située 1, place Maréchal Gallieni - 27500 Pont-Audemer";

/* Les actes, par banque. Seul le compte de transit change avec le nombre d'associés :
   ouvert « à leurs noms » quand ils sont plusieurs, « à son nom » pour l'associé unique. */
function blocs(pluriel) {
  return [
    ["BANQUE_QONTO", [
      "Dépôt du capital social auprès d’une étude notariale",
      "Ouverture d’un compte de transit à " + (pluriel ? "leurs noms" : "son nom") +
        " auprès de Olinda SAS (QONTO), établissement de paiement agréé auprès de l’ACPR",
      "Ouverture d’un compte de paiement au nom de la Société auprès de OLINDA SAS (Qonto), établissement de paiement agréé auprès de l’ACPR",
    ]],
    ["BANQUE_SHINE", [
      "Dépôt du capital social auprès d’un office notarial",
      "Ouverture d’un compte courant auprès de Shine, Établissement de paiement agréé par l’Autorité de Contrôle Prudentiel (ACPR) sous le numéro 71758 (www.regafi.fr), agent de Treezor, établissement de paiement agréé sous le numéro 63512. Intermédiaire en assurance enregistré à l’ORIAS sous le numéro 19003103.",
    ]],
    ["BANQUE_REVOLUT", [
      "Dépôt du capital social auprès d’une étude notariale",
      "Les actions représentatives des apports ont été libérées à hauteur d’un montant total de {{CAPITAL}} euros ainsi qu’il résulte de l’attestation du dépositaire des fonds " + NOTAIRE + ".",
    ]],
    ["BANQUE_AUTRE", [
      "Dépôt du capital social auprès de la Banque {{NOM_BANQUE}}, située {{ADRESSE_BANQUE}}.",
    ]],
  ];
}

function echapper(texte) {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* Le paragraphe qui porte « ouverture d'un compte bancaire. » dans l'annexe. */
function paragrapheModele(xml) {
  const depart = xml.lastIndexOf("ÉTAT DES ACTES ACCOMPLIS");
  if (depart < 0) throw new Error("annexe introuvable");
  const texte = xml.indexOf("ouverture d’un compte bancaire", depart);
  if (texte < 0) throw new Error("ligne du compte bancaire introuvable dans l'annexe");
  const debut = xml.lastIndexOf("<w:p ", texte) === -1 ? xml.lastIndexOf("<w:p>", texte)
    : Math.max(xml.lastIndexOf("<w:p ", texte), xml.lastIndexOf("<w:p>", texte));
  const fin = xml.indexOf("</w:p>", texte) + "</w:p>".length;
  return { debut, fin, xml: xml.slice(debut, fin) };
}

/* Un paragraphe neuf, habillé comme le modèle : mêmes propriétés, même police.
   Les lignes de tag perdent la puce - elles ne s'impriment pas, `paragraphLoop`
   retire le paragraphe entier au rendu. */
function paragraphe(modele, texte, avecPuce) {
  const pPr = (modele.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || ["<w:pPr/>"])[0];
  const rPr = (modele.match(/<w:r[^>]*>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/) || [, ""])[1] || "";
  const propres = avecPuce ? pPr : pPr.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, "");
  return "<w:p>" + propres + "<w:r>" + rPr +
    "<w:t xml:space=\"preserve\">" + echapper(texte) + "</w:t></w:r></w:p>";
}

function patcher(fichier, pluriel) {
  const chemin = path.join(__dirname, "..", "templates", fichier);
  const zip = new PizZip(fs.readFileSync(chemin));
  let xml = zip.file("word/document.xml").asText();

  if (xml.lastIndexOf("{{#BANQUE_QONTO}}") > xml.lastIndexOf("ÉTAT DES ACTES ACCOMPLIS")) {
    console.log("  " + fichier + " : l'annexe porte déjà les blocs, rien à faire");
    return;
  }

  const modele = paragrapheModele(xml);
  let ajout = "";
  for (const [tag, lignes] of blocs(pluriel)) {
    ajout += paragraphe(modele.xml, "{{#" + tag + "}}", false);
    for (const ligne of lignes) ajout += paragraphe(modele.xml, ligne, true);
    ajout += paragraphe(modele.xml, "{{/" + tag + "}}", false);
  }

  xml = xml.slice(0, modele.fin) + ajout + xml.slice(modele.fin);
  zip.file("word/document.xml", xml);
  fs.writeFileSync(chemin, zip.generate({ type: "nodebuffer" }));
  console.log("  " + fichier + " : quatre blocs ajoutés à l'état des actes");
}

console.log("État des actes - mentions par banque");
patcher("sasu-statuts.docx", false);
patcher("sas-statuts.docx", true);
