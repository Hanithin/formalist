/*
 * Le modèle universel d'acte de cession de titres.
 *
 * Il est écrit ici plutôt que dans Word, pour trois raisons. Il doit porter les mêmes
 * styles que le procès-verbal et le traité d'apport du cabinet - même police, mêmes
 * interlignes, même pied paginé - et les reprendre du paquet existant les garantit à
 * l'identique. Il doit ensuite ne contenir aucune donnée : un modèle tiré d'un acte
 * réel garde des noms, des montants, un siège, et ils ressortent un jour dans le
 * dossier d'un autre client. Il doit enfin se relire : le texte est ici en clair,
 * article par article, au lieu d'être enfoui dans du XML.
 *
 * La numérotation des articles est faite de variables, comme dans le traité d'apport.
 * L'agrément et la garantie d'actif et de passif ne paraissent pas toujours, et un
 * article absent décale tous les suivants - un renvoi écrit en dur deviendrait faux
 * sans que rien ne le signale.
 *
 * Idempotent : relancé, il réécrit le fichier à l'identique.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const SOURCE = path.join(__dirname, "..", "templates", "modif-pv-age-universel.docx");
const CIBLE = path.join(__dirname, "..", "templates", "modif-acte-cession-universel.docx");

/* ------------------------------------------------------------- La mise en forme */

const POLICE =
  '<w:rFonts w:ascii="Garamond" w:cs="Garamond" w:eastAsia="Garamond" w:hAnsi="Garamond"/>';

const RUNS = {
  titre: POLICE + "<w:b/><w:bCs/><w:smallCaps/><w:sz w:val=\"32\"/><w:szCs w:val=\"32\"/>",
  article: POLICE + "<w:b/><w:bCs/><w:smallCaps/><w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/>",
  gras: POLICE + '<w:b/><w:bCs/><w:sz w:val="23"/><w:szCs w:val="23"/>',
  italique: POLICE + '<w:i/><w:iCs/><w:sz w:val="23"/><w:szCs w:val="23"/>',
  normal: POLICE + '<w:sz w:val="23"/><w:szCs w:val="23"/>',
};

const PARAGRAPHES = {
  titre: '<w:spacing w:after="480" w:before="200"/><w:jc w:val="center"/>',
  partie: '<w:spacing w:after="120" w:before="240"/><w:jc w:val="both"/>',
  corps: '<w:spacing w:after="160" w:line="300"/><w:jc w:val="both"/>',
  serre: '<w:spacing w:after="100" w:line="300"/><w:jc w:val="both"/>',
  muet: '<w:spacing w:after="0"/>',
  droite: '<w:spacing w:after="160"/><w:jc w:val="right"/>',
  article:
    '<w:keepNext/><w:spacing w:after="140" w:before="360"/><w:jc w:val="left"/>',
  sousArticle: '<w:keepNext/><w:spacing w:after="100" w:before="200"/><w:jc w:val="left"/>',
  liste:
    '<w:tabs><w:tab w:val="left" w:pos="567"/></w:tabs><w:spacing w:after="100" w:line="300"/>' +
    '<w:ind w:left="567" w:hanging="425"/><w:jc w:val="both"/>',
  retrait: '<w:spacing w:after="160" w:line="300"/><w:ind w:left="567"/><w:jc w:val="both"/>',
  signatureTrait: '<w:spacing w:after="40" w:before="600"/>',
  signatureNom: '<w:spacing w:after="40"/>',
  signatureQualite: '<w:spacing w:after="240"/>',
};

function echapper(texte) {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

/** Un paragraphe : un style de bloc, un style de texte, et le texte. */
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

/** Une ligne de contrôle - ouverture ou fermeture de bloc - qui ne laisse pas de blanc. */
function bloc(marque) {
  return p("muet", "normal", marque);
}

/* ------------------------------------------------------------------- Le contenu */

const CORPS = [];
const a = (bloc_, run, texte) => CORPS.push(p(bloc_, run, texte));
const b = (marque) => CORPS.push(bloc(marque));

/* ---------------------------------------------------------- En-tête et parties */

a("titre", "titre", "Contrat de cession {de_titres}");

a("partie", "gras", "Entre les soussignés :");

b("{#cedants}");
a("serre", "normal", "{identification}");
b("{/cedants}");

a("droite", "italique", "ci-après {denomme_cedant} « {le_cedant} »");
a("droite", "normal", "D'UNE PART,");

a("partie", "gras", "Et :");
a("serre", "normal", "{identification_acquereur}");
a("droite", "italique", "ci-après {denomme_acquereur} « l'Acquéreur »");
a("droite", "normal", "D'AUTRE PART,");

a("partie", "gras", "En présence de :");
a(
  "serre",
  "normal",
  "La société {denomination}, {forme_sociale} au capital de {capital} {euro_capital}, " +
    "immatriculée au registre du commerce et des sociétés de {rcs_ville} sous le numéro " +
    "{rcs_numero}, dont le siège social est situé {siege_social}, représentée par " +
    "{representant_societe},"
);
a("droite", "italique", "ci-après désignée la « Société »");

b("{#intervenants_presents}");
a("partie", "gras", "Et, intervenant aux présentes :");
b("{#intervenants}");
a("serre", "normal", "{identification}, en sa qualité {qualite},");
b("{/intervenants}");
a(
  "droite",
  "italique",
  "ci-après {denomme_intervenant} « {les_intervenants} »"
);
b("{/intervenants_presents}");

/* --------------------------------------------------------------------- Préambule */

a("article", "article", "Préambule");

a(
  "corps",
  "normal",
  "La Société a pour objet {objet_societe}. Son capital social est fixé à {capital} {euro_capital}, " +
    "divisé en {total_titres} {titres} d'une valeur nominale de {valeur_nominale} {euro_nominal} " +
    "chacune, intégralement libérées."
);

a("serre", "normal", "Préalablement aux présentes, le capital social est réparti comme suit :");
b("{#repartition_avant}");
a("liste", "normal", "{puce}\t{ligne}");
b("{/repartition_avant}");

a("corps", "normal", "{contexte_operation}");

a(
  "corps",
  "normal",
  "Les parties ont, en conséquence, convenu de formaliser la cession {titre_onereux} de " +
    "{nb_titres_cedes_lettres} ({nb_titres_cedes}) {titres} de la Société, représentant " +
    "{pourcentage_cede} % de son capital social et de ses droits de vote, selon les termes " +
    "et conditions du présent contrat."
);

a("corps", "normal", "Ceci exposé, il a été convenu et arrêté ce qui suit :");

/* ------------------------------------------------------------------- Article 1 */

a("article", "article", "Article {a_objet} - Objet");

a(
  "corps",
  "normal",
  "Le présent contrat a pour objet la cession par {le_cedant} à l'Acquéreur, qui " +
    "accepte, de {nb_titres_cedes_lettres} ({nb_titres_cedes}) {titres} ordinaires de la " +
    "Société, d'une valeur nominale de {valeur_nominale} {euro_nominal} chacune, représentant " +
    "{pourcentage_cede} % du capital social et des droits de vote."
);

a(
  "corps",
  "normal",
  "La cession porte sur la pleine propriété des {titres} cédées et comprend, à compter de " +
    "sa réalisation, l'ensemble des droits politiques et financiers qui leur sont attachés, " +
    "notamment le droit de participer aux décisions collectives, le droit de vote, le droit " +
    "aux distributions et le droit au boni de liquidation, sous réserve des dispositions " +
    "légales et statutaires applicables."
);

a(
  "corps",
  "normal",
  "La cession est ferme et définitive. Elle emporte, à compter de la date de transfert " +
    "définie à l'Article {a_modalites}, tous les droits attachés aux {titres} cédées."
);

/* ------------------------------------------------------------------- Article 2 */

a("article", "article", "Article {a_origine} - Origine de propriété");

a(
  "corps",
  "normal",
  "{le_cedant_maj} {declare} être, à la date des présentes, {proprietaire_des_titres}, " +
    "lesquelles {origine_propriete} et sont intégralement libérées."
);

b("{#plusieurs_cedants}");
a("serre", "normal", "La détention se répartit comme suit :");
b("{#detail_cedants}");
a("liste", "normal", "{puce}\t{ligne}");
b("{/detail_cedants}");
b("{/plusieurs_cedants}");

a(
  "corps",
  "normal",
  "{le_cedant_maj} {declare} que les {titres} cédées sont inscrites {a_son_nom} dans les " +
    "registres de la Société et {garantit} qu'elles sont librement cessibles, qu'elles ne sont " +
    "grevées d'aucune sûreté, charge, gage, nantissement ni droit de tiers, et qu'elles ne " +
    "font l'objet d'aucune contestation, judiciaire ou extrajudiciaire."
);

/* ------------------------------------------------------------------- Article 3 */

a("article", "article", "Article {a_prix} - Prix de cession");

a(
  "corps",
  "normal",
  "Le prix global de la cession est fixé à la somme de {prix_lettres} {euro_prix_total} ({prix} €), " +
    "correspondant à un prix de {prix_par_titre} {euro_prix} par {titre_singulier}."
);

a("corps", "normal", "{justification_prix}");

a("corps", "normal", "{modalites_paiement}");

a(
  "corps",
  "normal",
  "Il est expressément convenu que le paiement effectif du prix constitue une condition " +
    "essentielle et déterminante de la présente cession."
);

/* ------------------------------------------------------------------- Article 4 */

a("article", "article", "Article {a_modalites} - Modalités de la cession");

a("sousArticle", "gras", "{a_modalites}.1 - Réalisation du transfert");

a(
  "corps",
  "normal",
  "{formule_transfert} La Société procédera à l'inscription de l'Acquéreur dans ses " +
    "registres et à la mise à jour de la répartition du capital."
);

a(
  "corps",
  "normal",
  "Les parties s'engagent à signer sans délai tout ordre de mouvement, formulaire ou " +
    "document complémentaire requis pour constater le transfert et assurer son opposabilité."
);

a("sousArticle", "gras", "{a_modalites}.2 - Date de transfert");

a(
  "corps",
  "normal",
  "Sous réserve du paiement du prix conformément à l'Article {a_prix}, le transfert de " +
    "propriété et l'entrée en jouissance sont fixés au {date_transfert}. Les résultats " +
    "sociaux attachés aux {titres} cédées, qu'ils soient bénéficiaires ou déficitaires, " +
    "bénéficieront ou incomberont à l'Acquéreur à compter de cette date."
);

a("sousArticle", "gras", "{a_modalites}.3 - Compte courant d'associé");

a("corps", "normal", "{clause_compte_courant}");

/* --------------------------------------------------------- Article 5, l'agrément */

b("{#agrement}");
a("article", "article", "Article {a_agrement} - Agrément");

a(
  "corps",
  "normal",
  "Conformément à {fondement_agrement} et aux stipulations des statuts de la Société, la " +
    "présente cession a été soumise à l'agrément préalable {des_associes}."
);

a(
  "corps",
  "normal",
  "{les_associes_maj} ont, par décision collective régulièrement prise, expressément " +
    "approuvé la cession, tant en ce qui concerne la personne de l'Acquéreur que les " +
    "conditions de l'opération, ainsi qu'il résulte du procès-verbal en date du " +
    "{date_agrement}, demeuré annexé aux présentes."
);

a(
  "corps",
  "normal",
  "En conséquence, la cession est définitive à l'égard de la Société et opposable tant à " +
    "cette dernière qu'aux tiers, à compter de la date de transfert."
);
b("{/agrement}");

b("{^agrement}");
a("article", "article", "Article {a_agrement} - Absence de procédure d'agrément");

a(
  "corps",
  "normal",
  "Les statuts de la Société ne subordonnent pas la cession des {titres} à une procédure " +
    "d'agrément ou de préemption, et la loi ne l'impose pas pour une cession de cette " +
    "nature. Le transfert résulte de l'inscription en compte opérée sur production d'un " +
    "ordre de mouvement signé."
);
b("{/agrement}");

/* --------------------------------------------------------------- Les garanties */

a("article", "article", "Article {a_garanties} - Garanties");

a("sousArticle", "gras", "{a_garanties}.1 - Garantie de propriété et de libre disposition");

a(
  "corps",
  "normal",
  "{le_cedant_maj} {garantit} à l'Acquéreur {quil_dispose} de la pleine propriété et de la " +
    "libre disposition des {titres} cédées, libres de tout gage, nantissement, saisie, " +
    "indivision, promesse de cession ou restriction quelconque, et {quil_dispose} des " +
    "pouvoirs nécessaires pour consentir la présente cession."
);

a("sousArticle", "gras", "{a_garanties}.2 - Garantie de jouissance paisible");

a(
  "corps",
  "normal",
  "{le_cedant_maj} {sengage} à ne pas troubler l'Acquéreur dans la jouissance paisible des " +
    "{titres} cédées et à l'assister, en tant que de besoin, dans toute démarche visant à " +
    "faire reconnaître les droits qui y sont attachés."
);

/* ------------------------------------------- L'actif et le passif, ou son absence */

b("{#garantie_passif}");
a("article", "article", "Article {a_passif} - Garantie d'actif et de passif");

a(
  "corps",
  "normal",
  "{le_cedant_maj} {declare} qu'à {sa_connaissance}, à la date des présentes, la Société ne " +
    "fait l'objet d'aucun engagement, dette, charge, litige ou obligation susceptible " +
    "d'affecter sa situation comptable, fiscale, sociale ou juridique, telle qu'elle a été " +
    "présentée à l'Acquéreur."
);

a(
  "corps",
  "normal",
  "{le_cedant_maj} {sengage_a_garantir} l'Acquéreur contre toute réclamation, dette, passif " +
    "ou engagement de nature certaine, liquide et exigible, d'origine antérieure à la date " +
    "des présentes, non révélé à l'Acquéreur à cette date, et qui viendrait à se manifester " +
    "postérieurement à la cession. Sans que cette énumération soit limitative, la garantie " +
    "porte sur les impôts et taxes dus au titre d'exercices clos avant la cession, les " +
    "charges sociales afférentes à des périodes antérieures, les dettes fournisseurs non " +
    "comptabilisées, et les litiges d'origine antérieure à la cession."
);

a(
  "corps",
  "normal",
  "L'Acquéreur informera {le_cedant} par écrit et sans délai excessif de tout élément " +
    "relevant de la présente garantie. {le_cedant_maj} {disposera} d'un délai raisonnable pour " +
    "examiner la demande et, le cas échéant, rembourser les sommes dues dans un délai de " +
    "trente jours à compter de la réception de la demande accompagnée de ses justificatifs."
);

a(
  "corps",
  "normal",
  "La présente garantie est consentie pour une durée de {duree_garantie} à compter des " +
    "présentes. En matière fiscale et sociale, elle est prorogée jusqu'à l'expiration du " +
    "délai légal de reprise. {plafond_garantie}"
);
b("{/garantie_passif}");

b("{^garantie_passif}");
a("article", "article", "Article {a_passif} - Absence de garantie d'actif et de passif");

a("corps", "normal", "{motif_absence_garantie}");

a(
  "corps",
  "normal",
  "L'Acquéreur reconnaît avoir eu la possibilité de prendre connaissance des statuts, des " +
    "registres sociaux, des documents comptables et de tout élément qu'il a estimé utile " +
    "avant la signature. Il accepte en conséquence d'acquérir les {titres} dans leur état " +
    "juridique et économique à la date des présentes, sans recours contre {le_cedant} au " +
    "titre de la situation future de la Société, sous réserve de la fraude ou du dol."
);
b("{/garantie_passif}");

/* ----------------------------------------------------------- Entrée en jouissance */

a("article", "article", "Article {a_jouissance} - Entrée en jouissance");

a(
  "corps",
  "normal",
  "L'Acquéreur entrera en jouissance des {titres} cédées à compter du {date_transfert}. À " +
    "compter de cette date, il sera seul titulaire de l'ensemble des droits attachés aux " +
    "{titres}, notamment du droit de vote, du droit de participer aux décisions " +
    "collectives, du droit aux dividendes et de tout autre droit financier attaché aux titres."
);

a(
  "corps",
  "normal",
  "{le_cedant_maj} {sinterdit}, à compter de cette date, d'exercer tout droit ou de prendre " +
    "tout engagement au nom ou pour le compte des {titres} cédées."
);

/* --------------------------------------------------------------- Confidentialité */

a("article", "article", "Article {a_confidentialite} - Confidentialité");

a(
  "corps",
  "normal",
  "Les parties s'engagent à conserver confidentiels les termes du présent contrat ainsi que " +
    "les informations non publiques échangées à l'occasion de sa préparation et de son " +
    "exécution. Cette obligation ne fait pas obstacle aux communications exigées par la loi, " +
    "une autorité administrative ou judiciaire, l'administration fiscale, les greffes, les " +
    "établissements bancaires ou les conseils professionnels des parties tenus au secret."
);

a(
  "corps",
  "normal",
  "L'obligation de confidentialité demeurera en vigueur pendant cinq années à compter de la " +
    "date des présentes."
);

/* ------------------------------------------------------------------------- Frais */

a("article", "article", "Article {a_frais} - Frais");

a(
  "corps",
  "normal",
  "Les droits d'enregistrement légalement dus au titre de la cession seront supportés par " +
    "{debiteur_droits}. Chacune des parties conservera à sa charge les honoraires de ses " +
    "propres conseils. Les frais internes de mise à jour des registres de la Société seront " +
    "supportés par la Société."
);

a(
  "corps",
  "normal",
  "Toute pénalité ou majoration résultant du manquement d'une partie à une formalité lui " +
    "incombant restera à sa charge exclusive."
);

/* -------------------------------------------------------------------- Formalités */

a("article", "article", "Article {a_formalites} - Formalités légales");

a(
  "corps",
  "normal",
  "Le présent acte sera présenté à l'enregistrement auprès du service des impôts des " +
    "entreprises territorialement compétent dans le délai d'un mois à compter de sa " +
    "signature, conformément à l'article 635 du code général des impôts. {qui_enregistre}"
);

a(
  "corps",
  "normal",
  "La Société procédera à la mise à jour de ses registres et, le cas échéant, au dépôt au " +
    "registre du commerce et des sociétés des statuts mis à jour de la répartition du " +
    "capital. Toute formalité relative aux bénéficiaires effectifs sera accomplie dans les " +
    "délais légaux si la structure de contrôle s'en trouve modifiée."
);

a(
  "corps",
  "normal",
  "Les parties donnent tous pouvoirs au porteur d'un original, d'une copie ou d'un extrait " +
    "du présent contrat pour accomplir les formalités requises."
);

/* --------------------------------------------------- Domicile et juridiction */

a("article", "article", "Article {a_domicile} - Élection de domicile et juridiction");

a(
  "corps",
  "normal",
  "Pour l'exécution des présentes et de leurs suites, les parties élisent domicile aux " +
    "adresses indiquées en tête du présent contrat. Tout changement d'adresse devra être " +
    "notifié à l'autre partie par écrit."
);

a(
  "corps",
  "normal",
  "Le présent contrat est soumis au droit français. Tout litige relatif à sa validité, son " +
    "interprétation, son exécution ou ses suites sera porté devant le tribunal de commerce " +
    "de {tribunal}, nonobstant pluralité de défendeurs ou appel en garantie."
);

/* ------------------------------------------------------------------- Signatures */

a(
  "corps",
  "normal",
  "Fait à {lieu_signature}, le {date_signature}, en {nb_exemplaires_lettres} " +
    "({nb_exemplaires}) exemplaires originaux, dont un pour chaque partie, un pour la " +
    "Société et un pour l'enregistrement."
);

b("{#signataires}");
a("signatureTrait", "normal", "_________________________");
a("signatureNom", "normal", "{nom_signataire}");
a("signatureQualite", "italique", "{qualite_signataire}");
b("{/signataires}");

/* ------------------------------------------------------------------ L'assemblage */

const zip = new PizZip(readFileSync(SOURCE));
const modele = zip.file("word/document.xml").asText();

/* On garde l'enveloppe du paquet - styles, numérotation, pied paginé - et son sectPr. */
const avant = modele.slice(0, modele.indexOf("<w:body>") + "<w:body>".length);
const sectPr = modele.match(/<w:sectPr.*?<\/w:sectPr>/s)[0];
const apres = "</w:body></w:document>";

zip.file("word/document.xml", avant + CORPS.join("") + sectPr + apres);

/* Les commentaires du modèle d'origine n'ont rien à faire ici. */
if (zip.file("word/comments.xml")) zip.file("word/comments.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>');

writeFileSync(CIBLE, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(CORPS.length + " paragraphes écrits dans " + path.basename(CIBLE));
