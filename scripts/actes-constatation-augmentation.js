#!/usr/bin/env node
/**
 * Fabrique les quatre actes d'une augmentation de capital déjà réalisée.
 *
 *   node scripts/actes-constatation-augmentation.js
 *
 * L'article L. 225-149 du code de commerce dit que l'augmentation résultant de
 * l'exercice de bons « est définitivement réalisée du seul fait de l'exercice des
 * droits ». Il n'y a donc rien à faire décider par une assemblée : le président
 * constate, sur délégation, et modifie corrélativement les statuts. Le même texte écarte
 * les formalités de publicité de l'article L. 225-142 et le dépôt des souscriptions du
 * premier alinéa de L. 225-146 - aucune attestation bancaire n'est due.
 *
 * Quatre actes en découlent, et chacun répond à une question précise :
 *
 * 1. la renonciation individuelle au droit préférentiel de souscription. Supprimer ce
 *    droit par décision collective appelle le rapport spécial de l'article L. 225-138
 *    III, et faute de commissaire aux comptes en place il faut en désigner un pour
 *    l'occasion. Y renoncer un à un (article L. 225-132 alinéa 5) n'emporte aucune
 *    suppression : ni rapport, ni commissaire. Elle suppose l'unanimité ;
 * 2. les décisions collectives, qui divisent le nominal quand il est trop gros pour
 *    porter des arrondis honnêtes, et ratifient l'émission consentie par le seul
 *    président (article 1156 alinéa 3 du code civil ; l'action en nullité s'éteint dès
 *    que la cause a cessé, article L. 235-3 du code de commerce) ;
 * 3. l'avenant de conversion anticipée, parce que la clôture du tour dans lequel les
 *    bons ont été souscrits n'est pas un cas de conversion automatique : les accords
 *    visent une levée ultérieure, et convertir plus tôt suppose l'accord écrit de chaque
 *    souscripteur ;
 * 4. la décision du président constatant la réalisation, seul acte que le greffe attend.
 *
 * Relancer ce script réécrit les quatre fichiers entièrement : ils n'ont pas d'autre
 * source.
 */
const fs = require("fs");
const path = require("path");
const { p, si, creerDocx, tableau, BLOC, TEMPLATES } = require("./fabrique-docx");

/* L'identification de la société, telle que la portent tous les actes de la maison. */
const ENTETE = [
  p("{{SOCIETE}}", { centre: true, gras: true, taille: 26, apres: 0 }),
  p("{{FORME_EN_CLAIR_CAPITALE}} au capital de {{CAPITAL_FORMATE}} euros", { centre: true, taille: 20, apres: 0 }),
  p("Siège social : {{SIEGE_SOCIAL}}", { centre: true, taille: 20, apres: 0 }),
  p("{{SIREN_ESPACE}} R.C.S. {{RCS_VILLE}}", { centre: true, taille: 20, apres: BLOC }),
].join("");

function titre(texte, sous) {
  return (
    p("**" + texte + "**", { centre: true, taille: 26, apres: sous ? 60 : BLOC }) +
    (sous ? p(sous, { centre: true, taille: 21, apres: BLOC }) : "")
  );
}

/*
 * Le tableau des souscripteurs, annexé à trois des quatre actes.
 *
 * C'est la pièce que l'on relira dans dix ans pour savoir d'où viennent les actions de
 * chacun : le montant investi, la valorisation qui lui était propre, le prix qui en
 * résulte et le nombre d'actions reçues. Deux accords d'un même tour ne retiennent pas
 * toujours la même valorisation - c'est pourquoi elle figure ligne par ligne, et non
 * une fois en tête.
 */
const TABLEAU = tableau(
  [
    ["Souscripteur", "Montant", "Valorisation", "Prix par action", "Actions", "Part"],
    ["{{INVESTISSEUR}}", "{{MONTANT}}", "{{VALORISATION}}", "{{PRIX}}", "{{ACTIONS}}", "{{PART}}"],
  ],
  [2500, 1350, 1500, 1450, 1100, 1126],
  { boucle: "AIR_LIGNES" }
);

/* ===================== 1. La renonciation individuelle au DPS ===================== */

const RENONCIATION = [
  titre("RENONCIATION INDIVIDUELLE", "au droit préférentiel de souscription"),
  p("Je soussigné(e) ....................................................., agissant en qualité d'associé de la société **{{SOCIETE}}**, {{FORME_EN_CLAIR}} au capital de {{CAPITAL_FORMATE}} euros, dont le siège social est {{SIEGE_SOCIAL}}, immatriculée au registre du commerce et des sociétés {{RCS_DE}} sous le numéro {{SIREN_ESPACE}} (la « Société »),", { apres: BLOC }),
  p("Propriétaire de ................... {{MOT_TITRES}} de la Société,", { apres: BLOC }),
  p("**Déclare renoncer**, à titre individuel et de manière irrévocable, au droit préférentiel de souscription attaché à mes {{MOT_TITRES}}, conformément à l'article L. 225-132 alinéa 5 du code de commerce, pour l'émission des bons de souscription d'actions consentie par la Société ainsi que pour l'émission des actions ordinaires auxquelles ces bons donnent droit.", { apres: BLOC }),
  p("Cette renonciation est faite **au profit des souscripteurs nommément désignés** dans le tableau annexé aux présentes.", { apres: BLOC }),
  p("Elle porte sur la totalité de mes droits et vaut pour l'ensemble des bons émis, quelle que soit la date de leur souscription.", { apres: BLOC }),
  p("Je reconnais avoir été informé(e) de l'effet dilutif de cette opération : à l'issue de la conversion, les associés actuels conserveront ensemble {{AIR_PART_FONDATEURS}} du capital social. J'y consens en pleine connaissance de cause.", { apres: BLOC }),
  p("La présente renonciation est notifiée ce jour à la Société.", { apres: BLOC * 2 }),
  p("Fait à {{VILLE_SIGNATURE}}, le ......................................, en deux exemplaires.", { apres: BLOC * 2 }),
  p("Signature de l'associé", { apres: BLOC * 2 }),
  p("**ACCEPTATION DES BÉNÉFICIAIRES**", { apres: BLOC }),
  p("Les souscripteurs désignés ci-dessous acceptent la présente renonciation, faite à leur profit, et déclarent souscrire les bons de souscription d'actions correspondants aux conditions des accords qu'ils ont signés.", { apres: BLOC }),
  TABLEAU,
  p("", { apres: BLOC }),
].join("");

/* ===================== 2. Les décisions collectives des associés ================== */

const DECISIONS = [
  ENTETE,
  titre("PROCÈS-VERBAL DES DÉCISIONS COLLECTIVES DES ASSOCIÉS"),
  p("Le {{DATE_AGE}}, les associés de la société {{SOCIETE}} se sont réunis au siège social, sur convocation du {{AIR_SIGNATAIRE_QUALITE}}.", { apres: BLOC }),
  p("Sont présents ou représentés les associés figurant sur la feuille de présence annexée, propriétaires ensemble de {{TOTAL_PARTS_FORMATE}} {{MOT_TITRES}} représentant la totalité du capital et des droits de vote. La collectivité des associés peut valablement délibérer.", { apres: BLOC }),
  p("{{AIR_SIGNATAIRE_NOM}} préside la séance en sa qualité de {{AIR_SIGNATAIRE_QUALITE}}.", { apres: BLOC }),

  p("**RAPPORT DU {{AIR_SIGNATAIRE_QUALITE_MAJ}}**", { apres: 120 }),
  p("Le {{AIR_SIGNATAIRE_QUALITE}} rappelle que la Société a conclu avec les souscripteurs figurant au tableau annexé des accords portant émission de bons de souscription d'actions, pour un montant total de {{AIR_TOTAL_INVESTI}} euros, intégralement versé et encaissé par la Société.", { apres: 120 }),
  si("IS_RATIFICATION",
    p("Il expose que ces accords ont été signés en son nom, au nom de la Société, sans qu'une décision collective préalable ait été adoptée par les associés, alors que l'émission de valeurs mobilières donnant accès au capital relève de leur compétence. Il propose en conséquence de décider cette émission et de ratifier les engagements pris, avec effet à la date de signature de chaque accord.", { apres: 120 })),
  si("IS_RENONCIATION_INDIVIDUELLE",
    p("Il précise que chaque associé a, par acte séparé, renoncé à titre individuel à son droit préférentiel de souscription au profit des souscripteurs nommément désignés, de sorte que l'émission n'emporte pas suppression de ce droit.", { apres: 120 })),
  si("IS_DIVISION",
    p("Il indique enfin que la valeur nominale actuelle, fixée à {{AIR_NOMINALE_AVANT}} euros, ne permet pas d'attribuer à chaque souscripteur un nombre entier d'actions correspondant à ses droits, et propose de la diviser préalablement par {{AIR_DIVISEUR}}.", { apres: 120 })),
  p("Après discussion, les décisions suivantes sont mises aux voix.", { apres: BLOC }),

  si("IS_DIVISION",
    p("**PREMIÈRE DÉCISION - Division de la valeur nominale**", { apres: 60 }) +
    p("La collectivité des associés décide de diviser par {{AIR_DIVISEUR}} ({{AIR_DIVISEUR_LETTRES}}) la valeur nominale des {{MOT_TITRES}} composant le capital social, laquelle est ramenée de {{AIR_NOMINALE_AVANT}} euros à {{AIR_NOMINALE}} euros.", { apres: 60 }) +
    p("En conséquence, les {{MOT_TITRES}} existantes sont échangées contre {{AIR_ACTIONS_AVANT}} actions nouvelles. Le montant du capital social demeure inchangé, à {{AIR_CAPITAL_AVANT}} euros.", { apres: 60 }) +
    p("Cette décision est adoptée à l'unanimité.", { apres: BLOC })),

  si("IS_RATIFICATION",
    p("**DÉCISION - Émission des bons de souscription d'actions et ratification**", { apres: 60 }) +
    p("La collectivité des associés, connaissance prise du rapport du {{AIR_SIGNATAIRE_QUALITE}} et des accords annexés,", { apres: 60 }) +
    p("**décide** l'émission, au profit des souscripteurs nommément désignés au tableau annexé, de bons de souscription d'actions, aux conditions de prix, de conversion et d'exercice stipulées dans chacun de ces accords, dont les termes sont expressément approuvés ;", { apres: 60 }) +
    p("**ratifie** expressément, avec effet à la date de signature de chaque accord, les engagements souscrits en son nom par le {{AIR_SIGNATAIRE_QUALITE}} à ce titre, ainsi que les souscriptions intervenues et les versements reçus, conformément à l'article 1156 alinéa 3 du code civil ;", { apres: 60 }) +
    p("**constate** que la cause d'irrégularité affectant ces émissions a ainsi cessé d'exister, au sens de l'article L. 235-3 du code de commerce.", { apres: 60 }) +
    p("Cette décision est adoptée à l'unanimité.", { apres: BLOC })),

  si("IS_RENONCIATION_INDIVIDUELLE",
    p("**DÉCISION - Renonciations individuelles au droit préférentiel de souscription**", { apres: 60 }) +
    p("La collectivité des associés **constate** que chacun des associés a, par acte séparé annexé au présent procès-verbal, renoncé à titre individuel à son droit préférentiel de souscription au profit des souscripteurs nommément désignés, conformément à l'article L. 225-132 alinéa 5 du code de commerce, et que ces renonciations ont été acceptées par leurs bénéficiaires.", { apres: 60 }) +
    p("Elle **constate en conséquence** que la présente émission n'emporte pas suppression du droit préférentiel de souscription au sens des articles L. 225-135 et L. 225-138 du code de commerce, et qu'elle n'appelle donc pas l'établissement du rapport spécial du commissaire aux comptes prévu par ces textes.", { apres: 60 }) +
    p("Cette décision est adoptée à l'unanimité.", { apres: BLOC })),

  p("**DÉCISION - Modalités de conversion et règle d'arrondi**", { apres: 60 }),
  p("La collectivité des associés constate que chaque accord retient la valorisation qui lui est propre, et que le nombre d'actions revenant à chaque souscripteur s'obtient en divisant son investissement par un prix de souscription égal à cette valorisation rapportée au nombre total d'actions composant le capital après conversion de l'ensemble des bons.", { apres: 60 }),
  p("Elle arrête en conséquence la méthode suivante, commune à tous les accords :", { apres: 60 }),
  p("- le nombre total d'actions après conversion est égal au nombre d'actions existantes divisé par la différence entre l'unité et la somme, pour l'ensemble des souscripteurs, du rapport entre le montant investi et la valorisation qui lui est applicable ;", { retrait: 283, apres: 40 }),
  p("- le prix de souscription applicable à chaque souscripteur est égal à sa valorisation divisée par ce nombre total d'actions ;", { retrait: 283, apres: 40 }),
  p("- le nombre d'actions attribué à chaque souscripteur est arrondi à l'entier le plus proche, la fraction d'action restant sans effet et le souscripteur en faisant son affaire personnelle.", { retrait: 283, apres: 60 }),
  p("Le tableau annexé applique cette méthode et arrête, pour chaque souscripteur, le nombre d'actions à créer, soit {{AIR_ACTIONS_CREEES}} actions au total.", { apres: 60 }),
  p("Cette décision est adoptée à l'unanimité.", { apres: BLOC }),

  p("**DÉCISION - Délégation au {{AIR_SIGNATAIRE_QUALITE}}**", { apres: 60 }),
  p("La collectivité des associés délègue au {{AIR_SIGNATAIRE_QUALITE}}, conformément à l'article L. 225-149 du code de commerce, tous pouvoirs à l'effet de constater le nombre et le montant nominal des actions créées au profit des titulaires de bons, de constater la réalisation définitive de l'augmentation de capital qui en résulte, et d'apporter aux statuts les modifications corrélatives portant sur le montant du capital social et le nombre d'actions qui le composent.", { apres: 60 }),
  p("Cette délégation est consentie pour une durée de vingt-six mois.", { apres: 60 }),
  p("Cette décision est adoptée à l'unanimité.", { apres: BLOC }),

  p("**DÉCISION - Pouvoirs**", { apres: 60 }),
  p("La collectivité des associés donne tous pouvoirs au porteur d'un original, d'une copie ou d'un extrait du présent procès-verbal à l'effet d'accomplir les formalités de publicité, de dépôt et d'inscription prévues par la loi.", { apres: 60 }),
  p("Cette décision est adoptée à l'unanimité.", { apres: BLOC }),

  p("L'ordre du jour étant épuisé, la séance est levée.", { apres: BLOC * 2 }),
  /*
    Une signature par associé, déroulée comme une section.

    Les deux balises tiennent chacune dans son paragraphe : `paragraphLoop` les retire
    avec le leur, et posées en texte nu entre deux paragraphes elles ne sont plus dans
    le document mais entre ses éléments - docxtemplater les laisse alors telles quelles.
  */
  si("ASSOCIES", p("{{nomSignature}}", { apres: BLOC })),
  p("**ANNEXE - Souscripteurs, valorisations et actions à créer**", { avant: BLOC, apres: 120 }),
  TABLEAU,
  p("Le capital social est porté de {{AIR_CAPITAL_AVANT}} euros à {{AIR_CAPITAL_APRES}} euros, divisé en {{AIR_ACTIONS_APRES}} actions de {{AIR_NOMINALE}} euro de valeur nominale chacune.", { avant: 120, apres: 0 }),
].join("");

/* ===================== 3. L'avenant de conversion anticipée ======================= */

const AVENANT = [
  titre("AVENANT", "à l'accord d'investissement portant émission de bons de souscription d'actions"),
  p("**ENTRE LES SOUSSIGNÉS :**", { apres: 120 }),
  p("La société **{{SOCIETE}}**, {{FORME_EN_CLAIR}} au capital de {{CAPITAL_FORMATE}} euros, dont le siège social est {{SIEGE_SOCIAL}}, immatriculée au registre du commerce et des sociétés {{RCS_DE}} sous le numéro {{SIREN_ESPACE}}, représentée par {{AIR_SIGNATAIRE_NOM}}, en sa qualité de {{AIR_SIGNATAIRE_QUALITE}},", { apres: 120 }),
  p("ci-après la « Société »,", { apres: 120 }),
  p("**ET**", { apres: 120 }),
  p(".............................................................................................................................", { apres: 60 }),
  p("(identité complète du souscripteur : nom, date et lieu de naissance, nationalité et adresse pour une personne physique ; dénomination, forme, capital, siège, numéro d'immatriculation et représentant pour une personne morale)", { apres: 120, taille: 19 }),
  p("ci-après le « Souscripteur »,", { apres: BLOC }),

  p("**IL A ÉTÉ PRÉALABLEMENT EXPOSÉ CE QUI SUIT :**", { apres: 120 }),
  p("Le Souscripteur a souscrit un accord portant émission d'un bon de souscription d'actions, aux termes duquel la conversion du bon en actions ordinaires intervient à la survenance de l'un des événements déclencheurs qu'il énumère, et au plus tard à l'expiration du délai qu'il fixe.", { apres: 120 }),
  si("IS_CONVERSION_ANTICIPEE",
    p("La Société a clôturé son tour de financement le {{AIR_DATE_FR}}. Les Parties conviennent que cette clôture ne constitue pas, par elle-même, un événement déclencheur au sens de l'accord, celui-ci visant une levée de fonds ultérieure. Elles souhaitent néanmoins procéder dès à présent à la conversion, afin de faire coïncider l'entrée au capital de l'ensemble des souscripteurs du tour.", { apres: 120 })),
  p("Par décisions collectives, les associés de la Société ont arrêté la méthode de détermination du nombre d'actions revenant à chaque souscripteur.", { apres: BLOC }),

  p("**IL A ÉTÉ CONVENU CE QUI SUIT :**", { apres: 120 }),
  p("**Article 1 - Conversion**", { apres: 40 }),
  p("Par dérogation aux stipulations de l'accord relatives aux événements déclencheurs, les Parties conviennent que le bon souscrit par le Souscripteur est converti en actions ordinaires de la Société à la date du {{AIR_DATE_FR}}.", { apres: 120 }),
  p("**Article 2 - Nombre d'actions et règle d'arrondi**", { apres: 40 }),
  p("En application de la formule de l'accord et de la méthode arrêtée par les associés, le nombre d'actions revenant au Souscripteur est celui que porte, en regard de son nom, le tableau annexé au présent avenant. Les actions ont une valeur nominale de {{AIR_NOMINALE}} euro chacune.", { apres: 120 }),
  p("Ce nombre résulte d'un arrondi à l'entier le plus proche. Le Souscripteur reconnaît que la fraction d'action non attribuée reste sans effet et déclare en faire son affaire personnelle, sans indemnité ni recours.", { apres: 120 }),
  p("**Article 3 - Libération du prix d'exercice**", { apres: 40 }),
  si("IS_LIBERATION_IMPUTEE",
    p("Les actions sont souscrites à leur valeur nominale. Les Parties conviennent que le prix d'exercice est libéré par imputation sur le prix de souscription du bon, déjà intégralement versé par le Souscripteur et encaissé par la Société, laquelle en donne quittance.", { apres: 120 })),
  p("Les actions sont ainsi intégralement libérées à la date des présentes. Conformément à l'article L. 225-149 du code de commerce, l'augmentation de capital qui en résulte n'est soumise ni aux formalités de l'article L. 225-142, ni à celles du premier alinéa de l'article L. 225-146.", { apres: 120 }),
  si("IS_PACTE_CONDITION",
    p("**Article 4 - Adhésion au pacte d'associés**", { apres: 40 }) +
    p("L'adhésion au pacte d'associés conditionnant la conversion aux termes de l'accord, le Souscripteur déclare avoir pris connaissance du pacte en vigueur au sein de la Société, dont un exemplaire lui a été remis, et y adhérer purement et simplement, en qualité d'associé, à compter de la date des présentes.", { apres: 120 }) +
    p("Il s'oblige à en respecter l'ensemble des stipulations et à signer, à première demande, tout acte d'adhésion complémentaire que la Société jugerait utile.", { apres: 120 })),
  p("**Article 5 - Confirmation de l'accord**", { apres: 40 }),
  p("Le Souscripteur reconnaît que l'émission de son bon a été décidée par les associés de la Société et confirme, en tant que de besoin, sa souscription. Toutes les stipulations de l'accord non modifiées par le présent avenant demeurent en vigueur ; en cas de contradiction, le présent avenant prévaut.", { apres: BLOC * 2 }),
  p("Fait à {{VILLE_SIGNATURE}}, le ......................................, en deux exemplaires originaux.", { apres: BLOC * 2 }),
  p("Pour la Société\t\t\t\tLe Souscripteur", { apres: 40 }),
  p("{{AIR_SIGNATAIRE_NOM}}, {{AIR_SIGNATAIRE_QUALITE}}", { apres: BLOC }),
  p("**ANNEXE - Souscripteurs et actions attribuées**", { avant: BLOC, apres: 120 }),
  TABLEAU,
].join("");

/* ===================== 4. La constatation par le président ======================= */

const CONSTATATION = [
  ENTETE,
  titre("DÉCISION DU {{AIR_SIGNATAIRE_QUALITE_MAJ}}", "constatant la réalisation définitive de l'augmentation de capital"),
  p("Le soussigné, {{AIR_SIGNATAIRE_NOM}}, {{AIR_SIGNATAIRE_QUALITE}} de la société {{SOCIETE}},", { apres: 120 }),
  p("**Vu** les décisions collectives des associés ayant arrêté la méthode de détermination du nombre d'actions et délégué au {{AIR_SIGNATAIRE_QUALITE}}, conformément à l'article L. 225-149 du code de commerce, les pouvoirs nécessaires pour constater la réalisation de l'augmentation de capital et modifier corrélativement les statuts ;", { apres: 120 }),
  si("IS_RENONCIATION_INDIVIDUELLE",
    p("**Vu** les renonciations individuelles au droit préférentiel de souscription consenties par chacun des associés au profit des souscripteurs nommément désignés, et leur acceptation par ces derniers ;", { apres: 120 })),
  si("IS_CONVERSION_ANTICIPEE",
    p("**Vu** les avenants de conversion signés avec chacun des souscripteurs ;", { apres: 120 })),
  p("**Vu** l'article L. 225-149 du code de commerce, aux termes duquel l'augmentation de capital résultant de l'exercice des droits attachés aux valeurs mobilières donnant accès au capital est définitivement réalisée du seul fait de l'exercice de ces droits et des versements correspondants, sans qu'il y ait lieu aux formalités de l'article L. 225-142 ni à celles du premier alinéa de l'article L. 225-146 ;", { apres: BLOC }),

  p("**CONSTATE CE QUI SUIT :**", { apres: 120 }),
  p("**1.** Les titulaires de bons de souscription d'actions dont la liste figure en annexe, au nombre de {{AIR_NOMBRE_ACCORDS}}, ont exercé la totalité de leurs droits de souscription à la date du {{AIR_DATE_FR}}.", { apres: 120 }),
  p("**2.** Il a été créé de ce fait **{{AIR_ACTIONS_CREEES}} actions ordinaires nouvelles** d'une valeur nominale de {{AIR_NOMINALE}} euro chacune, soit un montant nominal total de **{{AIR_NOMINAL_CREE}} euros**.", { apres: 120 }),
  si("IS_LIBERATION_IMPUTEE",
    p("**3.** Ces actions sont intégralement libérées, le prix d'exercice ayant été libéré par imputation sur le prix de souscription des bons, déjà versé et encaissé par la Société.", { apres: 120 })),
  p("**4.** L'augmentation de capital est définitivement réalisée à la date du {{AIR_DATE_FR}}. Le capital social est porté de {{AIR_CAPITAL_AVANT}} euros à **{{AIR_CAPITAL_APRES}} euros**{{#IS_CAPITAL_ENTIER}} ({{AIR_CAPITAL_APRES_LETTRES}} euros){{/IS_CAPITAL_ENTIER}}, divisé en **{{AIR_ACTIONS_APRES}} actions** de {{AIR_NOMINALE}} euro de valeur nominale chacune, toutes de même catégorie et intégralement libérées.", { apres: BLOC }),

  p("**DÉCIDE EN CONSÉQUENCE :**", { apres: 120 }),
  p("L'article des statuts relatif au capital social est modifié comme suit, le reste de cet article demeurant inchangé :", { apres: 120 }),
  p("« Le capital social est fixé à la somme de {{AIR_CAPITAL_APRES}} euros{{#IS_CAPITAL_ENTIER}} ({{AIR_CAPITAL_APRES_LETTRES}} euros){{/IS_CAPITAL_ENTIER}}.", { apres: 40 }),
  p("Il est divisé en {{AIR_ACTIONS_APRES}} actions de {{AIR_NOMINALE}} euro de valeur nominale chacune, toutes de même catégorie, intégralement souscrites et libérées. »", { apres: BLOC }),
  p("Tous pouvoirs sont donnés au porteur d'un original ou d'une copie des présentes à l'effet d'accomplir les formalités de publicité et de dépôt.", { apres: BLOC * 2 }),
  p("Fait à {{VILLE_SIGNATURE}}, le {{AIR_DATE_FR}}.", { apres: BLOC * 2 }),
  p("{{AIR_SIGNATAIRE_NOM}}", { apres: 0 }),
  p("{{AIR_SIGNATAIRE_QUALITE_TETE}}", { apres: BLOC }),
  p("**ANNEXE - Titulaires ayant exercé leurs bons**", { avant: BLOC, apres: 120 }),
  TABLEAU,
].join("");

const FICHIERS = [
  ["modif-air-renonciation-dps.docx", RENONCIATION],
  ["modif-air-decisions-collectives.docx", DECISIONS],
  ["modif-air-avenant-conversion.docx", AVENANT],
  ["modif-air-constatation.docx", CONSTATATION],
];

for (const [nom, corps] of FICHIERS) {
  fs.writeFileSync(path.join(TEMPLATES, nom), creerDocx(corps));
}
console.log(FICHIERS.map(([nom]) => nom).join(", ") + " écrits dans templates/");
