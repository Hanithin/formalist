#!/usr/bin/env node
/**
 * Create DOCX templates for modification module
 * Run: node scripts/create-modif-templates.js
 */
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const TEMPLATES_DIR = path.join(__dirname, "..", "templates");

function createDocx(content) {
  // Minimal DOCX structure
  const zip = new PizZip();

  // [Content_Types].xml
  zip.file("[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>'
  );

  // _rels/.rels
  zip.file("_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>'
  );

  // word/_rels/document.xml.rels
  zip.file("word/_rels/document.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '</Relationships>'
  );

  // word/document.xml
  zip.file("word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
    + 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    + 'xmlns:o="urn:schemas-microsoft-com:office:office" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    + 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
    + 'xmlns:v="urn:schemas-microsoft-com:vml" '
    + 'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" '
    + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    + 'xmlns:w10="urn:schemas-microsoft-com:office:word" '
    + 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    + 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
    + 'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
    + 'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" '
    + 'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" '
    + 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
    + '<w:body>'
    + content
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>'
  );

  return zip.generate({ type: "nodebuffer" });
}

/*
 * La typographie française, appliquée à chaque paragraphe.
 *
 * Les gabarits sortaient « au capital de 2000 euros », « la société «ACME» » sans le
 * moindre espace dans les guillemets, et « Article 1 — Objet » avec un quadratin
 * qu'aucun autre écrit de l'application n'emploie. Les mêmes règles que
 * src/domain/document/typographie.ts, appliquées ici une fois pour toutes plutôt que
 * rappelées à chaque phrase.
 */
var FINE = "\u202f";
var INSECABLE = "\u00a0";

/*
 * Les sections s'écrivent avec les délimiteurs configurés.
 *
 * Le moteur est réglé sur « {{ » et « }} ». Une section posée en simples accolades -
 * {#IS_X} - n'est pas une section : c'est du texte, que le moteur laisse tel quel. Le
 * gabarit cesse alors de filtrer, et le procès-verbal sort avec toutes les résolutions,
 * y compris celles que personne n'a décidées.
 *
 * Le script les écrivait en simples accolades ; on les double ici, une fois, plutôt que
 * de compter sur chaque phrase pour le faire.
 */
function sections(texte) {
  /*
   * Seules les balises encore simples.
   *
   * Sans les gardes, « {{#IS_X}} » - déjà correcte - contient « {#IS_X} » et se voyait
   * doublée à son tour : « {{{#IS_X}}} », que le moteur lit comme une accolade suivie
   * d'une balise, et refuse.
   */
  return texte.replace(/(?<!\{)\{([#/^][A-Za-z0-9_]+)\}(?!\})/g, "{{$1}}");
}

function typographier(texte) {
  return texte
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u00ab\s*/g, "\u00ab" + FINE)
    .replace(/\s*\u00bb/g, FINE + "\u00bb")
    .replace(/\s*([;!?])/g, FINE + "$1")
    .replace(/([^\d\s]|^)\s*:(\s|$)/g, "$1" + FINE + ":$2")
    .replace(/(\d)\s+(euros?|ans?|ann\u00e9es?|parts?|actions?)\b/g, "$1" + INSECABLE + "$2")
    .replace(/(\d)\s+([\u20ac%])/g, "$1" + INSECABLE + "$2");
}

function p(text, opts = {}) {
  text = sections(typographier(text));
  let rpr = '';
  if (opts.bold) rpr += '<w:b/>';
  if (opts.size) rpr += `<w:sz w:val="${opts.size}"/>`;
  if (opts.underline) rpr += '<w:u w:val="single"/>';
  const rprXml = rpr ? `<w:rPr>${rpr}</w:rPr>` : '';

  let ppr = '';
  if (opts.center) ppr += '<w:jc w:val="center"/>';
  if (opts.spacing) ppr += `<w:spacing w:after="${opts.spacing}"/>`;
  const pprXml = ppr ? `<w:pPr>${ppr}</w:pPr>` : '';

  // Handle linebreaks in text
  const parts = text.split('\n');
  let runs = '';
  parts.forEach((part, i) => {
    runs += `<w:r>${rprXml}<w:t xml:space="preserve">${escXml(part)}</w:t></w:r>`;
    if (i < parts.length - 1) runs += '<w:r><w:br/></w:r>';
  });

  return `<w:p>${pprXml}${runs}</w:p>`;
}

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ====== PV AGE - SAS (Assemblée Générale Extraordinaire) ======
function pvAgeSAS() {
  return p('{{SOCIETE}}', { bold: true, size: 32, center: true })
    + p('Société par Actions Simplifiée au capital de {{CAPITAL_FORMATE}} euros', { center: true, size: 20 })
    + p('Siège social : {{SIEGE_SOCIAL}}', { center: true, size: 20 })
    + p('RCS {{RCS_VILLE}}', { center: true, size: 20 })
    + p('SIREN : {{SIREN}}', { center: true, size: 20, spacing: 400 })
    + p('PROCÈS-VERBAL DE L\'ASSEMBLÉE GÉNÉRALE EXTRAORDINAIRE', { bold: true, size: 28, center: true, underline: true })
    + p('EN DATE DU {{DATE_AGE}}', { bold: true, size: 24, center: true, spacing: 400 })
    + p('Les actionnaires de la société {{SOCIETE}} se sont réunis en Assemblée Générale Extraordinaire au siège social, sur convocation du Président.', { spacing: 200 })
    + p('Sont présents :', { bold: true, spacing: 200 })
    + p('{{ASSOCIE_LISTE}}', { spacing: 200 })
    + p('représentant la totalité des {{TOTAL_PARTS}} actions composant le capital social.', { spacing: 200 })
    + p('L\'assemblée, réunissant la totalité des actionnaires, peut valablement délibérer sans qu\'il soit besoin de justifier de l\'accomplissement des formalités de convocation.', { spacing: 400 })
    // Transfert de siège
    + p('{#IS_TRANSFERT_SIEGE}', {})
    + p('RÉSOLUTION UNIQUE — TRANSFERT DU SIÈGE SOCIAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée générale décide de transférer le siège social de la société, actuellement sis {{SIEGE_SOCIAL}}, à l\'adresse suivante :', { spacing: 200 })
    + p('{{NOUVEAU_SIEGE}}', { bold: true, spacing: 200 })
    + p('Ce transfert prend effet à compter du {{DATE_EFFET_TRANSFERT_FR}}.', { spacing: 200 })
    + p('En conséquence, l\'article des statuts relatif au siège social est modifié comme suit :', { spacing: 200 })
    + p('« Le siège social est fixé au {{NOUVEAU_SIEGE}}. »', { bold: true, spacing: 200 })
    + p('L\'assemblée donne tous pouvoirs au porteur d\'un original, d\'une copie ou d\'un extrait du présent procès-verbal pour accomplir toutes les formalités de publicité et de dépôt requises par la loi.', { spacing: 200 })
    + p('{/IS_TRANSFERT_SIEGE}', {})
    // Dénomination
    + p('{#IS_DENOMINATION}', {})
    + p('RÉSOLUTION UNIQUE — CHANGEMENT DE DÉNOMINATION SOCIALE', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée générale décide de modifier la dénomination sociale de la société, actuellement «{{SOCIETE}}», pour adopter la nouvelle dénomination suivante :', { spacing: 200 })
    + p('« {{NOUVELLE_DENOMINATION}} »', { bold: true, spacing: 200 })
    + p('Ce changement prend effet à compter du {{DATE_EFFET_DENOMINATION_FR}}.', { spacing: 200 })
    + p('En conséquence, l\'article des statuts relatif à la dénomination sociale est modifié comme suit :', { spacing: 200 })
    + p('« La société prend la dénomination sociale de : {{NOUVELLE_DENOMINATION}}. »', { bold: true, spacing: 200 })
    + p('{/IS_DENOMINATION}', {})
    // Objet social
    + p('{#IS_OBJET_SOCIAL}', {})
    + p('RÉSOLUTION UNIQUE — MODIFICATION DE L\'OBJET SOCIAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée générale décide de modifier l\'objet social de la société, qui sera désormais le suivant :', { spacing: 200 })
    + p('« {{NOUVEL_OBJET_SOCIAL}} »', { bold: true, spacing: 200 })
    + p('Ce changement prend effet à compter du {{DATE_EFFET_OBJET_FR}}.', { spacing: 200 })
    + p('{/IS_OBJET_SOCIAL}', {})
    // Dirigeant
    + p('{#IS_DIRIGEANT}', {})
    + p('RÉSOLUTION UNIQUE — CHANGEMENT DE DIRIGEANT', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('{#IS_NOMINATION}L\'assemblée générale décide de nommer en qualité de {{FONCTION_DIRIGEANT}} de la société, à compter du {{DATE_EFFET_DIRIGEANT_FR}} :', { spacing: 200 })
    + p('{{NOUVEAU_DIRIGEANT_CIVILITE}} {{NOUVEAU_DIRIGEANT_PRENOM}} {{NOUVEAU_DIRIGEANT_NOM}}, né(e) le {{NOUVEAU_DIRIGEANT_DATE_NAISSANCE}} à {{NOUVEAU_DIRIGEANT_LIEU_NAISSANCE}}, de nationalité {{NOUVEAU_DIRIGEANT_NATIONALITE}}, demeurant au {{NOUVEAU_DIRIGEANT_ADRESSE}}.', { spacing: 200 })
    + p('Rémunération : {{REMUNERATION_DIRIGEANT}}.{/IS_NOMINATION}', { spacing: 200 })
    + p('{#IS_REVOCATION}L\'assemblée générale décide de révoquer {{DIRIGEANT_REVOQUE_NOM}} de ses fonctions de {{FONCTION_DIRIGEANT}}, à compter du {{DATE_EFFET_DIRIGEANT_FR}}.{/IS_REVOCATION}', { spacing: 200 })
    + p('{#IS_DEMISSION}L\'assemblée prend acte de la démission de {{DIRIGEANT_DEMISSIONNAIRE_NOM}} de ses fonctions de {{FONCTION_DIRIGEANT}}, à compter du {{DATE_EFFET_DIRIGEANT_FR}}.{/IS_DEMISSION}', { spacing: 200 })
    + p('{/IS_DIRIGEANT}', {})
    // Augmentation capital
    + p('{#IS_AUGMENTATION_CAPITAL}', {})
    + p('RÉSOLUTION UNIQUE — AUGMENTATION DU CAPITAL SOCIAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée générale décide d\'augmenter le capital social d\'une somme portant celui-ci de {{CAPITAL_ACTUEL_AUGM}} euros à {{NOUVEAU_CAPITAL_AUGM}} euros.', { spacing: 200 })
    + p('{#IS_APPORT_NUMERAIRE}Cette augmentation est réalisée par apport en numéraire. Les fonds ont été déposés auprès de {{BANQUE_DEPOT}}, qui en a délivré attestation. Les actions nouvelles sont intégralement libérées.{/IS_APPORT_NUMERAIRE}', { spacing: 200 })
    + p('{#IS_COMPENSATION_CREANCES}Cette augmentation est réalisée par compensation avec une créance certaine, liquide et exigible détenue sur la société par {{TITULAIRE_CREANCE}}, d\'un montant de {{MONTANT_CREANCE}} euros, telle qu\'elle ressort de l\'arrêté de compte établi le {{DATE_ARRETE_COMPTE_FR}}.{/IS_COMPENSATION_CREANCES}', { spacing: 200 })
    + p('{#IS_INCORPORATION_RESERVES}Cette augmentation est réalisée par incorporation d\'une somme de {{MONTANT_INCORPORE}} euros prélevée sur le poste « {{POSTE_INCORPORE}} », sans apport nouveau.{/IS_INCORPORATION_RESERVES}', { spacing: 200 })
    + p('{#IS_APPORT_NATURE}Cette augmentation est réalisée par apport en nature portant sur : {{DESCRIPTION_APPORT}}, évalué à {{VALEUR_APPORT}} euros.{/IS_APPORT_NATURE}', { spacing: 200 })
    + p('{#IS_APPORT_NATURE}{#IS_COMMISSAIRE_DISPENSE}Les associés, statuant à l\'unanimité, décident de ne pas recourir à un commissaire aux apports, aucun apport en nature n\'excédant trente mille euros et leur valeur totale n\'excédant pas la moitié du capital. Ils déclarent avoir connaissance de ce qu\'ils répondent solidairement, pendant cinq ans et à l\'égard des tiers, de la valeur attribuée à cet apport.{/IS_COMMISSAIRE_DISPENSE}{/IS_APPORT_NATURE}', { spacing: 200 })
    + p('{#IS_APPORT_NATURE}{^IS_COMMISSAIRE_DISPENSE}L\'assemblée, au vu du rapport établi par {{COMMISSAIRE_APPORTS}}, commissaire aux apports, approuve l\'évaluation qui y figure et l\'adopte pour la valeur de l\'apport.{/IS_COMMISSAIRE_DISPENSE}{/IS_APPORT_NATURE}', { spacing: 200 })
    + p('Il est créé {{NB_PARTS_NOUVELLES}} actions nouvelles d\'une valeur nominale de {{VALEUR_NOMINALE_AUGM}} euros{#PRIME_EMISSION}, assorties d\'une prime d\'émission de {{PRIME_EMISSION}} euros{/PRIME_EMISSION}.', { spacing: 200 })
    + p('Cette augmentation prend effet à compter du {{DATE_EFFET_AUGM_FR}}. L\'article des statuts relatif au capital social est modifié en conséquence.', { spacing: 200 })
    + p('{/IS_AUGMENTATION_CAPITAL}', {})
    // Réduction capital
    + p('{#IS_REDUCTION_CAPITAL}', {})
    + p('RÉSOLUTION UNIQUE — RÉDUCTION DU CAPITAL SOCIAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée générale décide de réduire le capital social de {{CAPITAL_ACTUEL_RED}} euros à {{NOUVEAU_CAPITAL_RED}} euros, motivée par : {{MOTIF_REDUCTION}}.', { spacing: 200 })
    + p('Il est annulé {{NB_PARTS_ANNULEES}} actions.', { spacing: 200 })
    + p('Cette réduction prend effet à compter du {{DATE_EFFET_RED_FR}}.', { spacing: 200 })
    + p('{/IS_REDUCTION_CAPITAL}', {})
    // Cession parts
    + p('{#IS_CESSION_PARTS}', {})
    + p('RÉSOLUTION — AGRÉMENT DE LA CESSION DE PARTS', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée générale, statuant aux conditions de majorité prévues par les statuts, agrée en qualité de nouvel associé {{CESSIONNAIRE_NOM}} et autorise la cession de {{NB_PARTS_CEDEES}} parts par {{CEDANT_NOM}} à son profit, moyennant le prix de {{PRIX_CESSION}} euros, avec effet au {{DATE_CESSION_FR}}.', { spacing: 200 })
    + p('En conséquence, l\'article des statuts relatif à la répartition du capital est modifié pour tenir compte de cette cession, et les statuts à jour seront déposés au registre du commerce et des sociétés.', { spacing: 200 })
    + p('{/IS_CESSION_PARTS}', {})
    // Prorogation
    + p('{#IS_PROROGATION}', {})
    + p('RÉSOLUTION UNIQUE — PROROGATION DE LA DURÉE DE LA SOCIÉTÉ', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée générale décide de proroger la durée de la société, actuellement fixée à {{DUREE_ACTUELLE}} ans, pour une nouvelle durée de {{NOUVELLE_DUREE}} ans.', { spacing: 200 })
    + p('{/IS_PROROGATION}', {})
    // Closing
    + p('Plus rien n\'étant à l\'ordre du jour, la séance est levée.', { spacing: 400 })
    + p('Fait au siège social, le {{DATE_AGE}}.', { spacing: 400 })
    + p('Signatures des actionnaires :', { bold: true, spacing: 200 })
    + p('{#ASSOCIES}', {})
    + p('{{nomComplet}}', { spacing: 100 })
    + p('____________________________', { spacing: 200 })
    + p('{/ASSOCIES}', {});
}

// ====== PV AGE - SASU (Décision de l'associé unique) ======
function pvAgeSASU() {
  return p('{{SOCIETE}}', { bold: true, size: 32, center: true })
    + p('Société par Actions Simplifiée Unipersonnelle au capital de {{CAPITAL_FORMATE}} euros', { center: true, size: 20 })
    + p('Siège social : {{SIEGE_SOCIAL}}', { center: true, size: 20 })
    + p('RCS {{RCS_VILLE}} — SIREN : {{SIREN}}', { center: true, size: 20, spacing: 400 })
    + p('DÉCISION DE L\'ASSOCIÉ UNIQUE', { bold: true, size: 28, center: true, underline: true })
    + p('EN DATE DU {{DATE_AGE}}', { bold: true, size: 24, center: true, spacing: 400 })
    + p('L\'associé unique de la société {{SOCIETE}}, {{ASSOCIE_LISTE}}, représentant la totalité des {{TOTAL_PARTS}} actions, a pris la décision suivante :', { spacing: 400 })
    + p('{#IS_TRANSFERT_SIEGE}', {})
    + p('DÉCISION — TRANSFERT DU SIÈGE SOCIAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'associé unique décide de transférer le siège social de la société à l\'adresse suivante :', { spacing: 200 })
    + p('{{NOUVEAU_SIEGE}}', { bold: true, spacing: 200 })
    + p('Ce transfert prend effet à compter du {{DATE_EFFET_TRANSFERT_FR}}.', { spacing: 200 })
    + p('L\'article des statuts relatif au siège social est modifié en conséquence.', { spacing: 200 })
    + p('{/IS_TRANSFERT_SIEGE}', {})
    + p('{#IS_DENOMINATION}', {})
    + p('DÉCISION — CHANGEMENT DE DÉNOMINATION', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'associé unique décide de modifier la dénomination sociale pour : « {{NOUVELLE_DENOMINATION}} ».', { spacing: 200 })
    + p('{/IS_DENOMINATION}', {})
    + p('{#IS_OBJET_SOCIAL}', {})
    + p('DÉCISION — MODIFICATION DE L\'OBJET SOCIAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'associé unique décide de modifier l\'objet social comme suit : « {{NOUVEL_OBJET_SOCIAL}} ».', { spacing: 200 })
    + p('{/IS_OBJET_SOCIAL}', {})
    + p('{#IS_DIRIGEANT}', {})
    + p('DÉCISION — CHANGEMENT DE DIRIGEANT', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('{#IS_NOMINATION}L\'associé unique décide de nommer {{NOUVEAU_DIRIGEANT_CIVILITE}} {{NOUVEAU_DIRIGEANT_PRENOM}} {{NOUVEAU_DIRIGEANT_NOM}} en qualité de {{FONCTION_DIRIGEANT}} à compter du {{DATE_EFFET_DIRIGEANT_FR}}.{/IS_NOMINATION}', { spacing: 200 })
    + p('{#IS_REVOCATION}L\'associé unique décide de révoquer {{DIRIGEANT_REVOQUE_NOM}} de ses fonctions de {{FONCTION_DIRIGEANT}} à compter du {{DATE_EFFET_DIRIGEANT_FR}}.{/IS_REVOCATION}', { spacing: 200 })
    + p('{#IS_DEMISSION}L\'associé unique prend acte de la démission de {{DIRIGEANT_DEMISSIONNAIRE_NOM}} de ses fonctions de {{FONCTION_DIRIGEANT}} à compter du {{DATE_EFFET_DIRIGEANT_FR}}.{/IS_DEMISSION}', { spacing: 200 })
    + p('{/IS_DIRIGEANT}', {})
    + p('{#IS_AUGMENTATION_CAPITAL}', {})
    + p('DÉCISION — AUGMENTATION DU CAPITAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'associé unique décide d\'augmenter le capital de {{CAPITAL_ACTUEL_AUGM}} € à {{NOUVEAU_CAPITAL_AUGM}} € par {{MODE_AUGMENTATION}}.', { spacing: 200 })
    + p('{/IS_AUGMENTATION_CAPITAL}', {})
    + p('{#IS_REDUCTION_CAPITAL}', {})
    + p('DÉCISION — RÉDUCTION DU CAPITAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'associé unique décide de réduire le capital de {{CAPITAL_ACTUEL_RED}} € à {{NOUVEAU_CAPITAL_RED}} € pour motif : {{MOTIF_REDUCTION}}.', { spacing: 200 })
    + p('{/IS_REDUCTION_CAPITAL}', {})
    + p('{#IS_PROROGATION}', {})
    + p('DÉCISION — PROROGATION', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'associé unique décide de proroger la durée de la société de {{DUREE_ACTUELLE}} ans à {{NOUVELLE_DUREE}} ans.', { spacing: 200 })
    + p('{/IS_PROROGATION}', {})
    + p('Fait au siège social, le {{DATE_AGE}}.', { spacing: 400 })
    + p('L\'associé unique :', { bold: true, spacing: 200 })
    + p('{#ASSOCIES}', {})
    + p('{{nomComplet}}', { spacing: 100 })
    + p('____________________________', { spacing: 200 })
    + p('{/ASSOCIES}', {});
}

// ====== PV AGE - SCI (Assemblée des associés) ======
function pvAgeSCI() {
  return p('{{SOCIETE}}', { bold: true, size: 32, center: true })
    + p('Société Civile Immobilière au capital de {{CAPITAL_FORMATE}} euros', { center: true, size: 20 })
    + p('Siège social : {{SIEGE_SOCIAL}}', { center: true, size: 20 })
    + p('RCS {{RCS_VILLE}} — SIREN : {{SIREN}}', { center: true, size: 20, spacing: 400 })
    + p('PROCÈS-VERBAL DE L\'ASSEMBLÉE GÉNÉRALE DES ASSOCIÉS', { bold: true, size: 28, center: true, underline: true })
    + p('EN DATE DU {{DATE_AGE}}', { bold: true, size: 24, center: true, spacing: 400 })
    + p('Les associés de la société {{SOCIETE}} se sont réunis en assemblée générale au siège social.', { spacing: 200 })
    + p('Sont présents :', { bold: true, spacing: 200 })
    + p('{{ASSOCIE_LISTE}}', { spacing: 200 })
    + p('représentant la totalité des {{TOTAL_PARTS}} parts composant le capital social.', { spacing: 400 })
    + p('{#IS_TRANSFERT_SIEGE}', {})
    + p('RÉSOLUTION — TRANSFERT DU SIÈGE SOCIAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée décide de transférer le siège social à l\'adresse suivante : {{NOUVEAU_SIEGE}}, à compter du {{DATE_EFFET_TRANSFERT_FR}}.', { spacing: 200 })
    + p('{/IS_TRANSFERT_SIEGE}', {})
    + p('{#IS_DENOMINATION}', {})
    + p('RÉSOLUTION — CHANGEMENT DE DÉNOMINATION', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée décide de modifier la dénomination pour : « {{NOUVELLE_DENOMINATION}} ».', { spacing: 200 })
    + p('{/IS_DENOMINATION}', {})
    + p('{#IS_OBJET_SOCIAL}', {})
    + p('RÉSOLUTION — MODIFICATION DE L\'OBJET SOCIAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée décide de modifier l\'objet social : « {{NOUVEL_OBJET_SOCIAL}} ».', { spacing: 200 })
    + p('{/IS_OBJET_SOCIAL}', {})
    + p('{#IS_DIRIGEANT}', {})
    + p('RÉSOLUTION — CHANGEMENT DE GÉRANT', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('{#IS_NOMINATION}L\'assemblée nomme {{NOUVEAU_DIRIGEANT_CIVILITE}} {{NOUVEAU_DIRIGEANT_PRENOM}} {{NOUVEAU_DIRIGEANT_NOM}} en qualité de {{FONCTION_DIRIGEANT}} à compter du {{DATE_EFFET_DIRIGEANT_FR}}.{/IS_NOMINATION}', { spacing: 200 })
    + p('{#IS_REVOCATION}L\'assemblée révoque {{DIRIGEANT_REVOQUE_NOM}} de ses fonctions de {{FONCTION_DIRIGEANT}} à compter du {{DATE_EFFET_DIRIGEANT_FR}}.{/IS_REVOCATION}', { spacing: 200 })
    + p('{#IS_DEMISSION}L\'assemblée prend acte de la démission de {{DIRIGEANT_DEMISSIONNAIRE_NOM}} de ses fonctions de {{FONCTION_DIRIGEANT}} à compter du {{DATE_EFFET_DIRIGEANT_FR}}.{/IS_DEMISSION}', { spacing: 200 })
    + p('{/IS_DIRIGEANT}', {})
    + p('{#IS_AUGMENTATION_CAPITAL}', {})
    + p('RÉSOLUTION — AUGMENTATION DU CAPITAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée décide d\'augmenter le capital de {{CAPITAL_ACTUEL_AUGM}} € à {{NOUVEAU_CAPITAL_AUGM}} € par {{MODE_AUGMENTATION}}.', { spacing: 200 })
    + p('{/IS_AUGMENTATION_CAPITAL}', {})
    + p('{#IS_REDUCTION_CAPITAL}', {})
    + p('RÉSOLUTION — RÉDUCTION DU CAPITAL', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée décide de réduire le capital de {{CAPITAL_ACTUEL_RED}} € à {{NOUVEAU_CAPITAL_RED}} € pour motif : {{MOTIF_REDUCTION}}.', { spacing: 200 })
    + p('{/IS_REDUCTION_CAPITAL}', {})
    + p('{#IS_CESSION_PARTS}', {})
    + p('RÉSOLUTION — AGRÉMENT CESSION DE PARTS', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée agrée la cession de {{NB_PARTS_CEDEES}} parts par {{CEDANT_NOM}} au profit de {{CESSIONNAIRE_NOM}} pour {{PRIX_CESSION}} €, à compter du {{DATE_CESSION_FR}}.', { spacing: 200 })
    + p('{/IS_CESSION_PARTS}', {})
    + p('{#IS_PROROGATION}', {})
    + p('RÉSOLUTION — PROROGATION', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('L\'assemblée décide de proroger la durée de {{DUREE_ACTUELLE}} ans à {{NOUVELLE_DUREE}} ans.', { spacing: 200 })
    + p('{/IS_PROROGATION}', {})
    + p('Plus rien n\'étant à l\'ordre du jour, la séance est levée.', { spacing: 400 })
    + p('Fait au siège social, le {{DATE_AGE}}.', { spacing: 400 })
    + p('Signatures des associés :', { bold: true, spacing: 200 })
    + p('{#ASSOCIES}', {})
    + p('{{nomComplet}}', { spacing: 100 })
    + p('____________________________', { spacing: 200 })
    + p('{/ASSOCIES}', {});
}

// ====== Avenant aux statuts (générique) ======
function avenantStatuts() {
  return p('AVENANT AUX STATUTS', { bold: true, size: 32, center: true, underline: true, spacing: 400 })
    + p('{{SOCIETE}}', { bold: true, size: 28, center: true })
    + p('{{FORME_JURIDIQUE}} au capital de {{CAPITAL_FORMATE}} euros', { center: true, size: 20 })
    + p('Siège social : {{SIEGE_SOCIAL}}', { center: true, size: 20 })
    + p('RCS {{RCS_VILLE}} — SIREN : {{SIREN}}', { center: true, size: 20, spacing: 400 })
    + p('Suite à la décision {{#IS_UNIPERSONNELLE}}de l\'associé unique{{/IS_UNIPERSONNELLE}}{{^IS_UNIPERSONNELLE}}de l\'assemblée générale extraordinaire{{/IS_UNIPERSONNELLE}} en date du {{DATE_AGE}}, les statuts de la société sont modifiés comme suit :', { spacing: 400 })
    // Transfert siège
    + p('{#IS_TRANSFERT_SIEGE}', {})
    + p('Article — Siège social', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('Ancienne rédaction :', { bold: true })
    + p('« Le siège social est fixé au {{SIEGE_SOCIAL}}. »', { spacing: 200 })
    + p('Nouvelle rédaction :', { bold: true })
    + p('« Le siège social est fixé au {{NOUVEAU_SIEGE}}. »', { spacing: 200 })
    + p('{/IS_TRANSFERT_SIEGE}', {})
    // Dénomination
    + p('{#IS_DENOMINATION}', {})
    + p('Article — Dénomination sociale', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('Ancienne rédaction :', { bold: true })
    + p('« La société prend la dénomination de : {{SOCIETE}}. »', { spacing: 200 })
    + p('Nouvelle rédaction :', { bold: true })
    + p('« La société prend la dénomination de : {{NOUVELLE_DENOMINATION}}. »', { spacing: 200 })
    + p('{/IS_DENOMINATION}', {})
    // Objet social
    + p('{#IS_OBJET_SOCIAL}', {})
    + p('Article — Objet social', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('Nouvelle rédaction :', { bold: true })
    + p('« {{NOUVEL_OBJET_SOCIAL}} »', { spacing: 200 })
    + p('{/IS_OBJET_SOCIAL}', {})
    // Capital
    + p('{#IS_AUGMENTATION_CAPITAL}', {})
    + p('Article — Capital social', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('Ancienne rédaction :', { bold: true })
    + p('« Le capital social est fixé à {{CAPITAL_ACTUEL_AUGM}} euros. »', { spacing: 200 })
    + p('Nouvelle rédaction :', { bold: true })
    + p('« Le capital social est fixé à {{NOUVEAU_CAPITAL_AUGM}} euros. »', { spacing: 200 })
    + p('{/IS_AUGMENTATION_CAPITAL}', {})
    + p('{#IS_REDUCTION_CAPITAL}', {})
    + p('Article — Capital social', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('Ancienne rédaction :', { bold: true })
    + p('« Le capital social est fixé à {{CAPITAL_ACTUEL_RED}} euros. »', { spacing: 200 })
    + p('Nouvelle rédaction :', { bold: true })
    + p('« Le capital social est fixé à {{NOUVEAU_CAPITAL_RED}} euros. »', { spacing: 200 })
    + p('{/IS_REDUCTION_CAPITAL}', {})
    // Prorogation
    + p('{#IS_PROROGATION}', {})
    + p('Article — Durée', { bold: true, size: 24, underline: true, spacing: 200 })
    + p('Ancienne rédaction :', { bold: true })
    + p('« La durée de la société est fixée à {{DUREE_ACTUELLE}} ans. »', { spacing: 200 })
    + p('Nouvelle rédaction :', { bold: true })
    + p('« La durée de la société est fixée à {{NOUVELLE_DUREE}} ans. »', { spacing: 200 })
    + p('{/IS_PROROGATION}', {})
    // Closing
    + p('Les autres articles des statuts demeurent inchangés.', { spacing: 400 })
    + p('Fait au siège social, le {{DATE_AGE}}.', { spacing: 400 })
    + p('{#ASSOCIES}', {})
    + p('{{nomComplet}}', { spacing: 100 })
    + p('____________________________', { spacing: 200 })
    + p('{/ASSOCIES}', {});
}

// ====== Acte de cession ======
/*
 * L'acte de cession de parts.
 *
 * L'ancien tenait en quatre articles : objet, prix, date, formalités. Il ne portait ni
 * la garantie du cédant, ni les déclarations des parties, ni l'agrément, ni le sort des
 * droits d'enregistrement, ni l'opposabilité à la société et aux tiers - c'est-à-dire
 * tout ce qui fait qu'un acte de cession protège celui qui le signe.
 *
 * Chaque article est rédigé pour tenir seul : un acte se relit article par article,
 * souvent des années après, par quelqu'un qui n'était pas là.
 */
function acteCession() {
  return p('ACTE DE CESSION DE PARTS SOCIALES', { bold: true, size: 32, center: true, underline: true, spacing: 400 })
    + p('ENTRE LES SOUSSIGNÉS :', { bold: true, size: 24, spacing: 200 })
    + p('{{CEDANT_NOM}},', { spacing: 100 })
    + p('ci-après dénommé « le Cédant », d\'une part,', { spacing: 300 })
    + p('{{CESSIONNAIRE_NOM}},', { spacing: 100 })
    + p('ci-après dénommé « le Cessionnaire », d\'autre part,', { spacing: 400 })
    + p('IL A ÉTÉ PRÉALABLEMENT EXPOSÉ CE QUI SUIT :', { bold: true, size: 24, spacing: 200 })
    + p('La société {{SOCIETE}}, {{FORME_EN_CLAIR}} au capital de {{CAPITAL_FORMATE}} euros, dont le siège social est situé {{SIEGE_SOCIAL}}, immatriculée au registre du commerce et des sociétés {{RCS_DE}} sous le numéro {{SIREN}}, a un capital divisé en {{TOTAL_PARTS_FORMATE}} parts.', { spacing: 200 })
    + p('Le Cédant est propriétaire de parts de cette société, dont il souhaite céder une partie au Cessionnaire, qui accepte.', { spacing: 400 })
    + p('CECI EXPOSÉ, IL A ÉTÉ CONVENU CE QUI SUIT :', { bold: true, size: 24, spacing: 300 })

    + p('Article 1 - Cession', { bold: true, underline: true, spacing: 200 })
    + p('Le Cédant cède au Cessionnaire, qui accepte, {{NB_PARTS_CEDEES}} parts de la société {{SOCIETE}}, avec tous les droits et obligations qui y sont attachés.', { spacing: 400 })

    + p('Article 2 - Prix et paiement', { bold: true, underline: true, spacing: 200 })
    + p('La présente cession est consentie et acceptée moyennant le prix de {{PRIX_CESSION}} euros, que le Cédant reconnaît avoir reçu du Cessionnaire au jour des présentes, dont quittance.', { spacing: 400 })

    + p('Article 3 - Propriété et jouissance', { bold: true, underline: true, spacing: 200 })
    + p('Le Cessionnaire est propriétaire des parts cédées à compter du {{DATE_CESSION_FR}}. Il est subrogé dans tous les droits et obligations attachés à ces parts à compter de cette date, notamment le droit aux bénéfices non encore distribués.', { spacing: 400 })

    + p('Article 4 - Agrément', { bold: true, underline: true, spacing: 200 })
    + p('{#IS_AGREMENT_REQUIS}La présente cession a été agréée par les associés dans les conditions prévues par la loi et les statuts, ainsi qu\'il résulte du procès-verbal de l\'assemblée générale en date du {{DATE_AGE}}, demeuré annexé aux présentes.{/IS_AGREMENT_REQUIS}', { spacing: 200 })
    + p('{^IS_AGREMENT_REQUIS}La présente cession n\'est soumise à aucune procédure d\'agrément, ni la loi ni les statuts ne l\'imposant pour une cession de cette nature.{/IS_AGREMENT_REQUIS}', { spacing: 400 })

    + p('Article 5 - Déclarations du Cédant', { bold: true, underline: true, spacing: 200 })
    + p('Le Cédant déclare que les parts cédées sont libres de tout nantissement, gage, saisie ou droit quelconque au profit d\'un tiers, qu\'elles sont intégralement libérées, et qu\'il a la pleine capacité de les céder.', { spacing: 200 })
    + p('Il garantit le Cessionnaire contre toute éviction et contre tout trouble de jouissance qui trouverait sa cause dans un fait antérieur aux présentes.', { spacing: 400 })

    + p('Article 6 - Déclarations du Cessionnaire', { bold: true, underline: true, spacing: 200 })
    + p('Le Cessionnaire déclare avoir pris connaissance des statuts de la société et, le cas échéant, du pacte d\'associés en vigueur, et s\'engage à les respecter. Il prend les parts cédées dans l\'état où elles se trouvent.', { spacing: 400 })

    + p('Article 7 - Opposabilité et formalités', { bold: true, underline: true, spacing: 200 })
    + p('La cession est opposable à la société par le dépôt d\'un original des présentes au siège social. Elle est opposable aux tiers par le dépôt, au registre du commerce et des sociétés, des statuts mis à jour de la répartition du capital.', { spacing: 200 })
    + p('Les parties donnent tous pouvoirs au porteur d\'un original ou d\'une copie des présentes pour accomplir ces formalités.', { spacing: 400 })

    + p('Article 8 - Droits d\'enregistrement', { bold: true, underline: true, spacing: 200 })
    + p('Les droits d\'enregistrement exigibles au titre de la présente cession sont à la charge du Cessionnaire, qui s\'engage à faire enregistrer l\'acte dans le délai légal d\'un mois à compter de sa signature.', { spacing: 400 })

    + p('Article 9 - Élection de domicile', { bold: true, underline: true, spacing: 200 })
    + p('Pour l\'exécution des présentes, les parties élisent domicile au siège social de la société.', { spacing: 400 })

    + p('Fait en autant d\'exemplaires originaux que de parties, augmenté d\'un exemplaire destiné à la société et d\'un exemplaire destiné à l\'enregistrement, au siège social, le {{DATE_AGE}}.', { spacing: 400 })
    + p('Le Cédant :', { bold: true, spacing: 100 })
    + p('{{CEDANT_NOM}}', { spacing: 100 })
    + p('____________________________', { spacing: 400 })
    + p('Le Cessionnaire :', { bold: true, spacing: 100 })
    + p('{{CESSIONNAIRE_NOM}}', { spacing: 100 })
    + p('____________________________', { spacing: 200 });
}

// ====== Generate all templates ======
const templates = {
  'modif-pv-transfert-siege-sas.docx': pvAgeSAS(),
  'modif-pv-transfert-siege-sasu.docx': pvAgeSASU(),
  'modif-pv-transfert-siege-sci.docx': pvAgeSCI(),
  'modif-avenant-statuts.docx': avenantStatuts(),
  'modif-acte-cession.docx': acteCession(),
};

// SARL uses same as SAS (AGE), EURL uses SASU
templates['modif-pv-transfert-siege-sarl.docx'] = pvAgeSAS().replace(
  'Société par Actions Simplifiée',
  'Société à Responsabilité Limitée'
).replace('actionnaires', 'associés').replace('actions', 'parts');

for (const [name, content] of Object.entries(templates)) {
  const buf = createDocx(content);
  fs.writeFileSync(path.join(TEMPLATES_DIR, name), buf);
  console.log('Created:', name, '(' + buf.length + ' bytes)');
}

console.log('\nAll modification templates created successfully!');
