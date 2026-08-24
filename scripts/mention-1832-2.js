#!/usr/bin/env node
/**
 * Ajoute au procès-verbal la mention de l'article 1832-2 du code civil.
 *
 * Un époux marié sous un régime de communauté ne peut employer un bien commun pour
 * souscrire des parts non négociables sans que son conjoint en soit averti, et sans que
 * cet avertissement soit « justifié dans l'acte ». À défaut, le conjoint peut demander
 * la nullité de l'apport pendant deux ans à compter du jour où il en a eu connaissance.
 * Il peut en outre revendiquer la qualité d'associé pour la moitié des parts souscrites :
 * l'acte ne dit pas la même chose selon qu'il renonce ou qu'il revendique.
 *
 * Pourquoi ce script plutôt que create-modif-templates.js : ce dernier est resté en
 * arrière des gabarits livrés. Le relancer aujourd'hui efface l'apport de titres et la
 * cession sans agrément, ajoutés aux DOCX depuis. On insère donc les paragraphes dans
 * les fichiers existants, sans toucher au reste.
 *
 * Idempotent : un gabarit qui porte déjà la mention est laissé tel quel.
 *
 *   node scripts/mention-1832-2.js
 */
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const TEMPLATES = path.join(__dirname, "..", "templates");

/** Les procès-verbaux de modification : ce sont eux qui portent les résolutions. */
const GABARITS = [
  "modif-pv-transfert-siege-sarl.docx",
  "modif-pv-transfert-siege-eurl.docx",
  "modif-pv-transfert-siege-sci.docx",
  "modif-pv-transfert-siege-sas.docx",
  "modif-pv-transfert-siege-sasu.docx",
];

/** Le mot qui désigne les titres, selon la forme. */
function titresDe(nom) {
  return /-(sas|sasu)\.docx$/.test(nom) ? "actions" : "parts sociales";
}

function paragraphe(texte, espace) {
  const pPr = espace ? '<w:pPr><w:spacing w:after="200"/></w:pPr>' : "";
  return (
    "<w:p>" +
    pPr +
    '<w:r><w:t xml:space="preserve">' +
    texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
    "</w:t></w:r></w:p>"
  );
}

function blocDeLaMention(titres) {
  return (
    paragraphe("{{#IS_APPORT_BIEN_COMMUN}}") +
    paragraphe(
      "Le bien apporté étant un bien commun, {{CONJOINT_NOM}}, conjoint de l'apporteur, a été averti de cet apport préalablement à la présente décision, conformément à l'article 1832-2 du code civil. Cet avertissement est justifié par le présent acte.",
      true
    ) +
    paragraphe("{{#IS_CONJOINT_REVENDIQUE}}") +
    paragraphe(
      "{{CONJOINT_NOM}} a déclaré revendiquer la qualité d'associé pour la moitié des " +
        titres +
        " souscrites au moyen du bien commun. Cette qualité lui est reconnue à compter de ce jour, et la répartition du capital en tient compte.",
      true
    ) +
    paragraphe("{{/IS_CONJOINT_REVENDIQUE}}") +
    paragraphe("{{^IS_CONJOINT_REVENDIQUE}}") +
    paragraphe(
      "{{CONJOINT_NOM}} a déclaré renoncer à revendiquer la qualité d'associé.",
      true
    ) +
    paragraphe("{{/IS_CONJOINT_REVENDIQUE}}") +
    paragraphe("{{/IS_APPORT_BIEN_COMMUN}}")
  );
}

/*
 * La mention se pose à la fin de la résolution d'apport en nature.
 *
 * Le repère est la fermeture de la condition du commissaire aux apports, juste avant
 * celle de l'apport en nature : c'est le dernier endroit où l'on parle encore du bien
 * apporté, et le conjoint n'a rien à faire dans les paragraphes qui suivent.
 */
const REPERE =
  '<w:p><w:r><w:t xml:space="preserve">{{/IS_COMMISSAIRE_DISPENSE}}</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t xml:space="preserve">{{/IS_APPORT_NATURE}}</w:t></w:r></w:p>';

let modifies = 0;

for (const nom of GABARITS) {
  const chemin = path.join(TEMPLATES, nom);
  const zip = new PizZip(fs.readFileSync(chemin));
  const xml = zip.file("word/document.xml").asText();

  if (xml.includes("IS_APPORT_BIEN_COMMUN")) {
    console.log("déjà posée : " + nom);
    continue;
  }

  if (!xml.includes(REPERE)) {
    console.error("repère introuvable dans " + nom + " : rien n'a été modifié.");
    process.exitCode = 1;
    continue;
  }

  const ferme = '<w:p><w:r><w:t xml:space="preserve">{{/IS_APPORT_NATURE}}</w:t></w:r></w:p>';
  const suite = xml.replace(REPERE, REPERE.replace(ferme, blocDeLaMention(titresDe(nom)) + ferme));

  zip.file("word/document.xml", suite);
  fs.writeFileSync(chemin, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("mention ajoutée : " + nom);
  modifies += 1;
}

console.log(modifies + " gabarit(s) modifié(s).");
