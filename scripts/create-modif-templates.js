#!/usr/bin/env node
/**
 * Create DOCX templates for modification module
 * Run: node scripts/create-modif-templates.js
 *
 * ATTENTION - ce script est en retard sur les gabarits livrés.
 *
 * Les DOCX de templates/ ont reçu depuis des blocs qu'il ne produit pas : l'apport de
 * titres et sa double augmentation de capital, la cession sans agrément, la mention de
 * l'article 1832-2 du code civil. Le relancer tel quel les efface - vérifié le
 * 24 août 2026, sur modif-pv-transfert-siege-sarl.docx.
 *
 * Une modification ponctuelle se fait donc par un script dédié qui insère dans les
 * fichiers existants, sur le modèle de scripts/mention-1832-2.js. Ce générateur ne
 * reprendra du service que le jour où il rendra ce que les gabarits portent.
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
  if (opts.italic) rpr += '<w:i/>';
  const rprXml = rpr ? `<w:rPr>${rpr}</w:rPr>` : '';

  let ppr = '';
  if (opts.center) ppr += '<w:jc w:val="center"/>';
  if (opts.left) ppr += '<w:jc w:val="left"/>';
  if (opts.spacing || opts.avant) {
    const avant = opts.avant ? ` w:before="${opts.avant}"` : '';
    ppr += `<w:spacing${avant} w:after="${opts.spacing || 0}"/>`;
  }
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

/**
 * Une section conditionnelle, dont les marqueurs occupent leur propre paragraphe.
 *
 * Un marqueur écrit au début d'un paragraphe de texte laisse, quand la condition est
 * fausse, un paragraphe vide : le procès-verbal sortait avec un trou sous chaque titre
 * de résolution, à l'endroit des cas non retenus. Seul sur sa ligne, le paragraphe
 * disparaît avec sa condition.
 */
function si(drapeau, corps) {
  return p('{#' + drapeau + '}', {}) + corps + p('{/' + drapeau + '}', {});
}

/** La même chose, à la négative : ce qui ne s'écrit que si la condition est fausse. */
function sinon(drapeau, corps) {
  return p('{^' + drapeau + '}', {}) + corps + p('{/' + drapeau + '}', {});
}

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ================================ Le procès-verbal ================================
 *
 * Un seul texte pour les cinq formes.
 *
 * Il y en avait trois, divergents : le procès-verbal de SAS avait un ordre du jour et
 * des résolutions rédigées, celui de SASU tenait en une phrase par décision - « décide
 * de réduire le capital de X à Y pour motif : Pertes » - et la SARL était fabriquée en
 * remplaçant « actions » par « parts » dans celui de la SAS. Ce remplacement portait
 * sur une chaîne, donc sur la première occurrence seulement : le gabarit de SARL
 * parlait encore d'actionnaires et d'actions partout ailleurs.
 *
 * Ce qui change d'une forme à l'autre tient en quatre mots - qui décide, comment
 * s'appelle l'acte, comment s'appellent les titres et ceux qui les détiennent. Le reste
 * est identique parce que le droit l'est : le délai d'opposition des créanciers, le
 * quitus au dirigeant sortant, l'article des statuts modifié, les pouvoirs au porteur.
 */

/**
 * @param titre     le nom de l'acte : procès-verbal d'assemblée, décision de l'associé unique
 * @param sujet     qui délibère : « L'assemblée générale », « L'associé unique »
 * @param mot       l'intitulé d'un point : « RÉSOLUTION », « DÉCISION »
 * @param titres    « actions » ou « parts sociales »
 * @param porteurs  « actionnaires » ou « associés »
 * @param convoque  qui convoque : le président en SAS, la gérance en SARL et en SCI
 * @param preside   qui préside la séance et met aux voix : président ou gérant
 * @param seul      un associé unique ne tient pas d'assemblée : ni convocation, ni bureau
 */
function procesVerbal({ titre, sujet, mot, titres, porteurs, convoque, preside, seul }) {
  const enTete =
    p('{{SOCIETE}}', { bold: true, size: 32, center: true })
    + p('{{FORME_EN_CLAIR}} au capital de {{CAPITAL_FORMATE}} euros', { center: true, size: 20 })
    + p('Siège social : {{SIEGE_SOCIAL}}', { center: true, size: 20 })
    + p('Immatriculée au registre du commerce et des sociétés {{RCS_DE}} sous le numéro {{SIREN}}', { center: true, size: 20, spacing: 400 })
    + p(titre, { bold: true, size: 28, center: true, underline: true })
    + p('EN DATE DU {{DATE_AGE}}', { bold: true, size: 24, center: true, spacing: 400 });

  const ouverture = seul
    ? p('Le soussigné, {{ASSOCIE_UNIQUE}}, associé unique de la société {{SOCIETE}}, propriétaire de la totalité des {{TOTAL_PARTS_FORMATE}} ' + titres + ' composant le capital social, a pris les décisions suivantes : {{LABEL_MODIFICATION}}.', { spacing: 200 })
      + p('Conformément à la loi, ces décisions sont consignées dans le présent procès-verbal, reporté sur le registre des décisions de l\'associé unique.', { spacing: 400 })
    : p('Les ' + porteurs + ' de la société {{SOCIETE}} se sont réunis au siège social, en assemblée générale, sur convocation ' + convoque + '.', { spacing: 200 })
      + p('Sont présents :', { bold: true, spacing: 100 })
      + p('{{ASSOCIE_LISTE}}', { spacing: 200 })
      + p('soit {{NB_ASSOCIES}} ' + porteurs + ' détenant ensemble {{TOTAL_PARTS_FORMATE}} ' + titres + ', représentant la totalité du capital social.', { spacing: 200 })
      + p('La feuille de présence, arrêtée et certifiée exacte par le bureau, fait apparaître que l\'assemblée réunit la totalité des ' + porteurs + '. Elle peut donc valablement délibérer sans qu\'il soit justifié de l\'accomplissement des formalités de convocation.', { spacing: 200 })
      + p('Le ' + preside + ' rappelle que l\'assemblée est appelée à délibérer sur l\'ordre du jour suivant : {{LABEL_MODIFICATION}}, et sur les pouvoirs à donner pour l\'accomplissement des formalités.', { spacing: 200 })
      + p('Les documents prévus par la loi et les statuts ont été tenus à la disposition des ' + porteurs + '. Personne ne demandant plus la parole, le ' + preside + ' met successivement aux voix les résolutions inscrites à l\'ordre du jour.', { spacing: 400 });

  // « Cette résolution est adoptée » ne se dit pas d'une décision prise seul.
  // Rien, et non un paragraphe vide : la mise en page en garderait le blanc.
  const adoptee = seul
    ? ''
    : p('Cette résolution, mise aux voix, est adoptée.', { italic: true, spacing: 300 });

  const titreDe = (libelle) => p(mot + ' - ' + libelle, { bold: true, size: 24, underline: true, spacing: 200 });

  const transfert =
    p('{#IS_TRANSFERT_SIEGE}', {})
    + titreDe('TRANSFERT DU SIÈGE SOCIAL')
    + p(sujet + ' décide de transférer le siège social, actuellement fixé {{SIEGE_SOCIAL}}, à l\'adresse suivante :', { spacing: 200 })
    + p('{{NOUVEAU_SIEGE}}', { bold: true, spacing: 200 })
    + p('Ce transfert prend effet à compter du {{DATE_EFFET_TRANSFERT_FR}}. L\'article des statuts relatif au siège social est modifié en conséquence et rédigé comme suit :', { spacing: 200 })
    + p('« Le siège social est fixé {{NOUVEAU_SIEGE}}. Il peut être transféré en tout autre lieu dans les conditions prévues par la loi. »', { bold: true, spacing: 200 })
    + si('IS_HORS_RESSORT', p('Le nouveau siège relevant du ressort du registre du commerce et des sociétés {{NOUVEAU_RCS_DE}}, la société sera radiée du registre {{RCS_DE}} et immatriculée au registre {{NOUVEAU_RCS_DE}}. Un avis sera publié dans chacun de ces deux ressorts.', { spacing: 200 }))
    + adoptee
    + p('{/IS_TRANSFERT_SIEGE}', {});

  const denomination =
    p('{#IS_DENOMINATION}', {})
    + titreDe('CHANGEMENT DE DÉNOMINATION SOCIALE')
    + p(sujet + ' décide de modifier la dénomination sociale, actuellement « {{SOCIETE}} », qui devient :', { spacing: 200 })
    + p('« {{NOUVELLE_DENOMINATION}} »', { bold: true, spacing: 200 })
    + p('Ce changement prend effet à compter du {{DATE_EFFET_DENOMINATION_FR}}. L\'article des statuts relatif à la dénomination sociale est modifié en conséquence et rédigé comme suit :', { spacing: 200 })
    + p('« La société a pour dénomination sociale : {{NOUVELLE_DENOMINATION}}. »', { bold: true, spacing: 200 })
    + p('Tous les actes et documents émanant de la société porteront désormais cette dénomination, suivie de l\'indication de la forme sociale, du montant du capital et du numéro d\'immatriculation.', { spacing: 200 })
    + adoptee
    + p('{/IS_DENOMINATION}', {});

  const objet =
    p('{#IS_OBJET_SOCIAL}', {})
    + titreDe('MODIFICATION DE L\'OBJET SOCIAL')
    + p(sujet + ' décide de modifier l\'objet social, qui sera désormais le suivant :', { spacing: 200 })
    + p('« {{NOUVEL_OBJET_SOCIAL}} »', { bold: true, spacing: 200 })
    + p('Ce changement prend effet à compter du {{DATE_EFFET_OBJET_FR}}. L\'article des statuts relatif à l\'objet social est modifié en conséquence.', { spacing: 200 })
    + adoptee
    + p('{/IS_OBJET_SOCIAL}', {});

  const dirigeant =
    p('{#IS_DIRIGEANT}', {})
    + titreDe('CHANGEMENT DE DIRIGEANT')
    + si('IS_NOMINATION',
      p(sujet + ' décide de nommer en qualité de {{FONCTION_DIRIGEANT}}, à compter du {{DATE_EFFET_DIRIGEANT_FR}} et pour une durée indéterminée :', { spacing: 200 })
      + p('{{NOUVEAU_DIRIGEANT_CIVILITE}} {{NOUVEAU_DIRIGEANT_PRENOM}} {{NOUVEAU_DIRIGEANT_NOM}}, né(e) le {{NOUVEAU_DIRIGEANT_DATE_NAISSANCE}} à {{NOUVEAU_DIRIGEANT_LIEU_NAISSANCE}}, de nationalité {{NOUVEAU_DIRIGEANT_NATIONALITE}}, demeurant {{NOUVEAU_DIRIGEANT_ADRESSE}}.', { bold: true, spacing: 200 })
      + p('L\'intéressé(e) déclare accepter ces fonctions et n\'être frappé(e) d\'aucune interdiction, incapacité ou déchéance susceptible de lui en interdire l\'exercice. Sa rémunération est fixée comme suit : {{REMUNERATION_DIRIGEANT}}.', { spacing: 200 }))
    + si('IS_REVOCATION', p(sujet + ' décide de révoquer {{DIRIGEANT_REVOQUE_NOM}} de ses fonctions de {{FONCTION_DIRIGEANT}}, avec effet au {{DATE_EFFET_DIRIGEANT_FR}}.{#IS_MOTIF_REVOCATION} Le motif de cette révocation est le suivant : {{MOTIF_REVOCATION}}.{/IS_MOTIF_REVOCATION}', { spacing: 200 }))
    + si('IS_DEMISSION', p(sujet + ' prend acte de la démission de {{DIRIGEANT_DEMISSIONNAIRE_NOM}} de ses fonctions de {{FONCTION_DIRIGEANT}}, avec effet au {{DATE_EFFET_DIRIGEANT_FR}}, et lui donne quitus entier et sans réserve de sa gestion jusqu\'à cette date.', { spacing: 200 }))
    /*
     * Il n'y a de dirigeant sortant que s'il en part un : la phrase s'écrivait sous une
     * nomination, où elle désigne quelqu'un qui n'existe pas.
     */
    + sinon('IS_NOMINATION', p('Le dirigeant sortant restituera sans délai les documents et biens sociaux en sa possession.', { spacing: 200 }))
    + p('Ce changement sera porté au registre du commerce et des sociétés.', { spacing: 200 })
    + adoptee
    + p('{/IS_DIRIGEANT}', {});

  const augmentation =
    p('{#IS_AUGMENTATION_CAPITAL}', {})
    + titreDe('AUGMENTATION DU CAPITAL SOCIAL')
    + p(sujet + ' décide d\'augmenter le capital social pour le porter de {{CAPITAL_ACTUEL_AUGM}} euros à {{NOUVEAU_CAPITAL_AUGM}} euros.', { spacing: 200 })
    + si('IS_APPORT_NUMERAIRE', p('Cette augmentation est réalisée par apport en numéraire. Les fonds correspondants ont été déposés auprès de {{BANQUE_DEPOT}}, qui en a délivré attestation. Les ' + titres + ' nouvelles sont intégralement libérées.', { spacing: 200 }))
    + si('IS_COMPENSATION_CREANCES', p('Cette augmentation est réalisée par compensation avec une créance certaine, liquide et exigible détenue sur la société par {{TITULAIRE_CREANCE}}, d\'un montant de {{MONTANT_CREANCE}} euros, telle qu\'elle ressort de l\'arrêté de compte établi le {{DATE_ARRETE_COMPTE_FR}}.', { spacing: 200 }))
    + si('IS_INCORPORATION_RESERVES', p('Cette augmentation est réalisée par incorporation d\'une somme de {{MONTANT_INCORPORE}} euros prélevée sur le poste « {{POSTE_INCORPORE}} », sans apport nouveau ni modification de la répartition entre ' + porteurs + '.', { spacing: 200 }))
    + si('IS_APPORT_NATURE',
      p('Cette augmentation est réalisée par apport en nature portant sur : {{DESCRIPTION_APPORT}}, évalué à {{VALEUR_APPORT}} euros.', { spacing: 200 })
      + si('IS_COMMISSAIRE_DISPENSE', p('Les ' + porteurs + ', statuant à l\'unanimité, décident de ne pas recourir à un commissaire aux apports, aucun apport en nature n\'excédant trente mille euros et leur valeur totale n\'excédant pas la moitié du capital. Ils déclarent avoir connaissance de ce qu\'ils répondent solidairement, pendant cinq ans et à l\'égard des tiers, de la valeur attribuée à cet apport.', { spacing: 200 }))
      + sinon('IS_COMMISSAIRE_DISPENSE', p('Au vu du rapport établi par {{COMMISSAIRE_APPORTS}}, commissaire aux apports, l\'évaluation qui y figure est approuvée et retenue pour la valeur de l\'apport.', { spacing: 200 })))
    + p('Il est en conséquence créé {{NB_PARTS_NOUVELLES}} ' + titres + ' nouvelles d\'une valeur nominale de {{VALEUR_NOMINALE_AUGM}} euros{#IS_PRIME_EMISSION}, assorties d\'une prime d\'émission de {{PRIME_EMISSION}} euros{/IS_PRIME_EMISSION}.', { spacing: 200 })
    + p('Cette augmentation prend effet à compter du {{DATE_EFFET_AUGM_FR}}. L\'article des statuts relatif au capital social est modifié en conséquence.', { spacing: 200 })
    + adoptee
    + p('{/IS_AUGMENTATION_CAPITAL}', {});

  const reduction =
    p('{#IS_REDUCTION_CAPITAL}', {})
    + titreDe('RÉDUCTION DU CAPITAL SOCIAL')
    + p(sujet + ' décide de réduire le capital social de {{CAPITAL_ACTUEL_RED}} euros à {{NOUVEAU_CAPITAL_RED}} euros, réduction motivée par {{MOTIF_REDUCTION_EN_CLAIR}}.', { spacing: 200 })
    + p('Il est en conséquence annulé {{NB_PARTS_ANNULEES}} ' + titres + '.', { spacing: 200 })
    + si('IS_REDUCTION_HORS_PERTES', p('La réduction n\'étant pas motivée par des pertes, les créanciers dont la créance est antérieure au dépôt du présent acte au greffe pourront former opposition dans le délai légal. Le dépôt de la formalité n\'interviendra qu\'à l\'expiration de ce délai et, en cas d\'opposition, qu\'après règlement de celle-ci.', { spacing: 200 }))
    + p('Cette réduction prend effet à compter du {{DATE_EFFET_RED_FR}}. L\'article des statuts relatif au capital social est modifié en conséquence.', { spacing: 200 })
    + adoptee
    + p('{/IS_REDUCTION_CAPITAL}', {});

  const cession =
    p('{#IS_CESSION_PARTS}', {})
    + titreDe('AGRÉMENT DE LA CESSION')
    + p(sujet + ', statuant aux conditions de majorité prévues par la loi et les statuts, agrée en qualité de nouvel associé {{CESSIONNAIRE_NOM}} et autorise la cession de {{NB_PARTS_CEDEES}} ' + titres + ' consentie par {{CEDANT_NOM}} à son profit, moyennant le prix de {{PRIX_CESSION}} euros, avec effet au {{DATE_CESSION_FR}}.', { spacing: 200 })
    + p('L\'article des statuts relatif à la répartition du capital est modifié pour tenir compte de cette cession. Les statuts mis à jour seront déposés au registre du commerce et des sociétés.', { spacing: 200 })
    + adoptee
    + p('{/IS_CESSION_PARTS}', {});

  const prorogation =
    p('{#IS_PROROGATION}', {})
    + titreDe('PROROGATION DE LA DURÉE DE LA SOCIÉTÉ')
    + p(sujet + ', consulté avant l\'expiration du terme statutaire ainsi que l\'exige l\'article 1844-6 du code civil, décide de proroger la durée de la société, actuellement fixée à {{DUREE_ACTUELLE}} ans et venant à expiration le {{DATE_EXPIRATION_ACTUELLE_FR}}, pour une nouvelle durée de {{NOUVELLE_DUREE}} ans.', { spacing: 200 })
    + p('L\'article des statuts relatif à la durée de la société est modifié en conséquence.', { spacing: 200 })
    + adoptee
    + p('{/IS_PROROGATION}', {});

  const cloture =
    titreDe('POUVOIRS POUR LES FORMALITÉS')
    + p('Tous pouvoirs sont donnés au porteur d\'un original, d\'une copie ou d\'un extrait du présent acte à l\'effet d\'accomplir les formalités de publicité, de dépôt et d\'inscription modificative prévues par la loi.', { spacing: 200 })
    + adoptee
    + (seul
      ? p('De tout ce que dessus, il a été dressé le présent procès-verbal, signé par l\'associé unique.', { spacing: 400 })
      : p('Plus rien n\'étant à l\'ordre du jour, la séance est levée. De tout ce que dessus, il a été dressé le présent procès-verbal, signé par les membres du bureau et les ' + porteurs + ' présents.', { spacing: 400 }))
    + p('Fait au siège social, le {{DATE_AGE}}.', { spacing: 400 })
    /*
     * « Signé par », non « Signature des » : la mise en page trace une bordure sur le
     * paragraphe qui suit tout intitulé commençant par « Signature », et le premier nom
     * recevait donc deux traits - le sien et celui-là, sur toute la largeur.
     */
    + p(seul ? 'L\'associé unique :' : 'Signé par les ' + porteurs + ' présents :', { bold: true, spacing: 600 })
    + p('{#ASSOCIES}', {})
    /*
     * Le trait au-dessus du nom, dans le même paragraphe que lui.
     *
     * Trois manières se sont révélées fausses. Une ligne de soulignés seule : la mise
     * en page la retire, parce que les actes de création tracent le trait en bordure
     * haute du nom en gras. Une bordure haute ici : Word fond en un seul bloc deux
     * paragraphes de bordures identiques, et le second nom n'avait plus de trait. Une
     * ligne vide entre les deux pour rompre le bloc : la mise en page la retire aussi,
     * une ligne vide qui précède un titre étant du bruit - et le nom en gras est vu
     * comme un titre. Le trait tient donc au nom, séparé par un simple retour.
     */
    /*
     * 720 twips, et non une valeur ronde quelconque : la mise en page ramène à 120 tout
     * espacement supérieur à 240 hors de sa liste - la place pour signer disparaissait.
     */
    + p('____________________________\n{{nomComplet}}', { left: true, avant: 600, spacing: 240 })
    + p('{/ASSOCIES}', {});

  return enTete + ouverture + transfert + denomination + objet + dirigeant
    + augmentation + reduction + cession + prorogation + cloture;
}

function pvAgeSAS() {
  return procesVerbal({
    titre: 'PROCÈS-VERBAL DE L\'ASSEMBLÉE GÉNÉRALE EXTRAORDINAIRE',
    sujet: 'L\'assemblée générale',
    mot: 'RÉSOLUTION',
    titres: 'actions',
    porteurs: 'actionnaires',
    convoque: 'du président',
    preside: 'président',
    seul: false,
  });
}

function pvAgeSARL() {
  return procesVerbal({
    titre: 'PROCÈS-VERBAL DE L\'ASSEMBLÉE GÉNÉRALE EXTRAORDINAIRE',
    sujet: 'L\'assemblée générale',
    mot: 'RÉSOLUTION',
    titres: 'parts sociales',
    porteurs: 'associés',
    convoque: 'de la gérance',
    preside: 'gérant',
    seul: false,
  });
}

function pvAgeSASU() {
  return procesVerbal({
    titre: 'DÉCISION DE L\'ASSOCIÉ UNIQUE',
    sujet: 'L\'associé unique',
    mot: 'DÉCISION',
    titres: 'actions',
    porteurs: 'associés',
    seul: true,
  });
}

function pvAgeEURL() {
  return procesVerbal({
    titre: 'DÉCISION DE L\'ASSOCIÉ UNIQUE',
    sujet: 'L\'associé unique',
    mot: 'DÉCISION',
    titres: 'parts sociales',
    porteurs: 'associés',
    seul: true,
  });
}

function pvAgeSCI() {
  return procesVerbal({
    titre: 'PROCÈS-VERBAL DE L\'ASSEMBLÉE GÉNÉRALE DES ASSOCIÉS',
    sujet: 'L\'assemblée générale',
    mot: 'RÉSOLUTION',
    titres: 'parts sociales',
    porteurs: 'associés',
    convoque: 'de la gérance',
    preside: 'gérant',
    seul: false,
  });
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

/*
 * La SARL avait le procès-verbal de la SAS, où l'on remplaçait « actions » par
 * « parts ». Le remplacement portait sur une chaîne, donc sur la première occurrence :
 * le reste du document parlait toujours d'actions et d'actionnaires. Chaque forme a
 * désormais son texte, tiré du même modèle.
 */
templates['modif-pv-transfert-siege-sarl.docx'] = pvAgeSARL();
templates['modif-pv-transfert-siege-eurl.docx'] = pvAgeEURL();

for (const [name, content] of Object.entries(templates)) {
  const buf = createDocx(content);
  fs.writeFileSync(path.join(TEMPLATES_DIR, name), buf);
  console.log('Created:', name, '(' + buf.length + ' bytes)');
}

console.log('\nAll modification templates created successfully!');
