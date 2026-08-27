import { natureDeLaForme } from "@/domain/formalite/formes";
import { dateEnFrancais, nombreEnFrancais } from "@/domain/formalite/lettres";
import { evaluationDesApports, planDeCapital } from "./apport";
import { formeEnToutesLettres } from "./annonce";
import { adresseLisible, enCapitaleInitiale, type ContexteGabarit } from "./gabarit";
import type { Valeurs } from "./types";
import { montant, sirenEspace } from "./pv-age";

/**
 * Le traité d'apport de titres, traduit vers le modèle universel du cabinet.
 *
 * Même stratégie que pour le procès-verbal : le .docx livré n'est pas modifié, et
 * cette fonction pure traduit les champs de Formalist vers ses balises. Le modèle sert
 * les deux sens de l'opération - avec ou sans augmentation en numéraire préalable,
 * avec ou sans commissaire aux apports, sous report ou sous sursis d'imposition - et
 * c'est ici que le dossier décide lequel il écrit.
 *
 * Une particularité par rapport au procès-verbal : le traité se renvoie à lui-même.
 * « les conditions suspensives prévues à l'Article {a_conditions} » est écrit dans les
 * définitions, à dix pages de l'article en question. Les numéros sont donc des
 * variables calculées, employées à la fois dans les intitulés et dans les renvois :
 * un article qui disparaît décale les suivants sans qu'aucun renvoi ne devienne faux.
 */

/* ------------------------------------------------------------ Petites lectures */

function texte(valeur: unknown): string {
  return typeof valeur === "string" ? valeur.trim() : typeof valeur === "number" ? String(valeur) : "";
}

function nombre(valeurs: Valeurs, cle: string): number {
  const brut = valeurs[cle];
  if (typeof brut === "number") return Number.isFinite(brut) ? brut : 0;
  if (typeof brut !== "string" || !brut.trim()) return 0;
  const lu = Number(brut.replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

/** Les chiffres romains, pour les titres du traité. */
const ROMAINS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/* ------------------------------------------------- La numérotation du document */

/**
 * Les titres du traité, dans l'ordre où le modèle les porte.
 *
 * `t_numeraire` ne paraît que si une augmentation en numéraire précède l'apport ;
 * c'est le seul titre conditionnel.
 */
export const TITRES_DU_TRAITE = [
  "t_def",
  "t_numeraire",
  "t_apport",
  "t_declarations",
  "t_modalites",
  "t_fiscal",
  "t_general",
] as const;

/**
 * Les articles, dans le même ordre canonique.
 *
 * Trois sont conditionnels : les deux du numéraire, et celui de l'article 1161 du
 * code civil, qui n'a d'objet que si la même personne signe des deux côtés.
 */
export const ARTICLES_DU_TRAITE = [
  "a_definitions",
  "a_interpretation",
  "a_num_engagement",
  "a_num_liberation",
  "a_objet",
  "a_origine",
  "a_valorisation",
  "a_remuneration",
  "a_transfert",
  "a_decl_apporteur",
  "a_decl_beneficiaire",
  "a_1161",
  "a_charges",
  "a_conditions",
  "a_remise",
  "a_fiscal",
  "a_frais",
  "a_notifications",
  "a_domicile",
  "a_pouvoirs",
  "a_divisibilite",
  "a_integralite",
  "a_modification",
  "a_confidentialite",
  "a_loi",
  "a_exemplaires",
] as const;

export type TitreDuTraite = (typeof TITRES_DU_TRAITE)[number];
export type ArticleDuTraite = (typeof ARTICLES_DU_TRAITE)[number];

/**
 * Les numéros des titres et des articles réellement présents.
 *
 * Ils se comptent sur les seuls éléments actifs, et se posent dans les balises. Un
 * traité sans augmentation en numéraire n'a pas de Titre II vide : il n'a pas de
 * Titre II du tout, et son Titre « Apport en nature » porte le numéro II.
 */
export function numerotationDuTraite(options: {
  souscriptionNumeraire: boolean;
  doubleRepresentation: boolean;
}): Record<string, string> {
  const numeros: Record<string, string> = {};

  const titres = TITRES_DU_TRAITE.filter(
    (titre) => titre !== "t_numeraire" || options.souscriptionNumeraire
  );
  titres.forEach((titre, rang) => {
    numeros[titre] = ROMAINS[rang] ?? String(rang + 1);
  });

  const articles = ARTICLES_DU_TRAITE.filter((article) => {
    if (article === "a_num_engagement" || article === "a_num_liberation") {
      return options.souscriptionNumeraire;
    }
    if (article === "a_1161") return options.doubleRepresentation;
    return true;
  });
  articles.forEach((article, rang) => {
    numeros[article] = String(rang + 1);
  });

  return numeros;
}

/* --------------------------------------------------- La terminologie de l'acte */

/**
 * Le texte qui fonde un apport en nature, selon la forme de la bénéficiaire.
 *
 * Une SAS renvoie à L. 227-1, qui rend applicables les règles des sociétés anonymes,
 * dont L. 225-147 sur les apports en nature ; une SARL a son propre texte. Nommer le
 * mauvais article dans un acte déposé au greffe se voit.
 */
export function fondementLegalDeLApport(forme: string | null | undefined): string {
  /*
   * Comparer le sigle à « SARL » et « EURL » laissait la SELARL, qui suit pourtant le
   * régime de la SARL, se voir citer l'article des sociétés par actions.
   */
  const regime = natureDeLaForme(forme).regime;
  if (regime === "sarl") return "l'article L. 223-33 du code de commerce";
  if (regime === "sa" || regime === "commandite") {
    return "l'article L. 225-147 du code de commerce";
  }
  return "les articles L. 227-1 et L. 225-147 du code de commerce";
}

/**
 * Le texte qui permet de se dispenser de commissaire aux apports.
 *
 * La dispense est écrite pour les SARL (L. 223-9) et étendue aux sociétés par actions
 * simplifiées par L. 227-1. La citer de travers priverait la clause de fondement.
 */
export function fondementDeLaDispense(forme: string | null | undefined): string {
  const regime = natureDeLaForme(forme).regime;
  if (regime === "sarl") return "l'article L. 223-9 du code de commerce";
  return "l'article L. 227-1 du code de commerce, renvoyant à l'article L. 223-9 du même code";
}

/**
 * La cour d'appel dans le ressort de laquelle les litiges se portent.
 *
 * Elle ne se confond pas avec la ville du registre : un dossier immatriculé à Nanterre
 * relève de Versailles, un dossier de Bobigny relève de Paris, un dossier de Marseille
 * relève d'Aix-en-Provence. Une table de villes serait toujours incomplète - il y a
 * cent trente greffes - et rendrait une clause attributive fausse sans le dire.
 *
 * Le découpage se fait donc sur le département, que le code postal donne, et non sur
 * la ville : chaque département relève d'une cour et d'une seule, et les cent une
 * entrées ci-dessous couvrent le territoire entier. La Corse n'a qu'une cour pour ses
 * deux départements, ce qui laisse « 20 » suffire.
 */
const COURS_PAR_DEPARTEMENT: Record<string, string> = {
  "01": "Lyon",
  "02": "Amiens",
  "03": "Riom",
  "04": "Aix-en-Provence",
  "05": "Grenoble",
  "06": "Aix-en-Provence",
  "07": "Nîmes",
  "08": "Reims",
  "09": "Toulouse",
  10: "Reims",
  11: "Montpellier",
  12: "Montpellier",
  13: "Aix-en-Provence",
  14: "Caen",
  15: "Riom",
  16: "Bordeaux",
  17: "Poitiers",
  18: "Bourges",
  19: "Limoges",
  20: "Bastia",
  21: "Dijon",
  22: "Rennes",
  23: "Limoges",
  24: "Bordeaux",
  25: "Besançon",
  26: "Grenoble",
  27: "Rouen",
  28: "Versailles",
  29: "Rennes",
  30: "Nîmes",
  31: "Toulouse",
  32: "Agen",
  33: "Bordeaux",
  34: "Montpellier",
  35: "Rennes",
  36: "Bourges",
  37: "Orléans",
  38: "Grenoble",
  39: "Besançon",
  40: "Pau",
  41: "Orléans",
  42: "Lyon",
  43: "Riom",
  44: "Rennes",
  45: "Orléans",
  46: "Agen",
  47: "Agen",
  48: "Nîmes",
  49: "Angers",
  50: "Caen",
  51: "Reims",
  52: "Dijon",
  53: "Angers",
  54: "Nancy",
  55: "Nancy",
  56: "Rennes",
  57: "Metz",
  58: "Bourges",
  59: "Douai",
  60: "Amiens",
  61: "Caen",
  62: "Douai",
  63: "Riom",
  64: "Pau",
  65: "Pau",
  66: "Montpellier",
  67: "Colmar",
  68: "Colmar",
  69: "Lyon",
  70: "Besançon",
  71: "Dijon",
  72: "Angers",
  73: "Chambéry",
  74: "Chambéry",
  75: "Paris",
  76: "Rouen",
  77: "Paris",
  78: "Versailles",
  79: "Poitiers",
  80: "Amiens",
  81: "Toulouse",
  82: "Toulouse",
  83: "Aix-en-Provence",
  84: "Nîmes",
  85: "Poitiers",
  86: "Poitiers",
  87: "Limoges",
  88: "Nancy",
  89: "Paris",
  90: "Besançon",
  91: "Paris",
  92: "Versailles",
  93: "Paris",
  94: "Paris",
  95: "Versailles",
  971: "Basse-Terre",
  972: "Fort-de-France",
  973: "Cayenne",
  974: "Saint-Denis de La Réunion",
  /* Saint-Pierre-et-Miquelon relève du ressort de Paris. */
  975: "Paris",
  976: "Mamoudzou",
  986: "Nouméa",
  987: "Papeete",
  988: "Nouméa",
};

/**
 * Le département d'un code postal.
 *
 * Les collectivités d'outre-mer se lisent sur trois chiffres, la métropole sur deux.
 * La Corse s'écrit « 20 » en code postal alors que ses départements se nomment 2A et
 * 2B : comme les deux relèvent de Bastia, la distinction n'a pas d'objet ici.
 */
function departement(codePostal: string): string {
  const chiffres = codePostal.replace(/\D/g, "");
  if (chiffres.length < 2) return "";
  if (chiffres.startsWith("97") || chiffres.startsWith("98")) return chiffres.slice(0, 3);
  return chiffres.slice(0, 2);
}

/**
 * La cour compétente, lue sur le siège de la société.
 *
 * La ville ne sert que si le code postal manque - un dossier importé sans lui - et
 * elle n'est alors qu'un pis-aller que l'avocat relit.
 */
export function courDAppel(
  codePostal: string | null | undefined,
  ville?: string | null
): string {
  const cour = COURS_PAR_DEPARTEMENT[departement((codePostal ?? "").trim())];
  if (cour) return cour;
  return enCapitaleInitiale((ville ?? "").trim());
}

/* ------------------------------------------------------ Ce que le dossier décide */

/** L'apporteur signe-t-il aussi pour la bénéficiaire ? */
export function doubleRepresentation(valeurs: Valeurs): boolean {
  /*
   * La qualité de l'apporteur dans la holding le dit : « représentant légal » y
   * figure dans les deux premières options, et dans elles seules. C'est exactement la
   * situation que l'article 1161 du code civil vise - un représentant qui contracte
   * avec lui-même - et le traité doit alors porter l'autorisation expresse.
   */
  return texte(valeurs.apporteurQualite).includes("représentant légal");
}

/** La méthode retenue, et ce qu'elle regarde. */
function criteresDeValorisation(methode: string): string[] {
  const commun = [
    "la rentabilité actuelle et prévisionnelle de l'activité ;",
    "les perspectives de développement de la société.",
  ];

  if (methode.startsWith("Actif net")) {
    return ["l'actif net comptable de la société, retraité le cas échéant ;", ...commun];
  }
  if (methode.startsWith("Rentabilité")) {
    return [
      "les résultats des derniers exercices clos et le budget de l'exercice en cours ;",
      ...commun,
    ];
  }
  if (methode.startsWith("Multiple")) {
    return [
      "l'excédent brut d'exploitation des derniers exercices, et le multiple retenu sur des sociétés comparables ;",
      ...commun,
    ];
  }
  return ["la situation comptable et patrimoniale de la société ;", ...commun];
}

/** D'où l'apporteur tient ses titres, et ce qui le prouve. */
function origineEtJustificatif(
  valeurs: Valeurs,
  cible: string
): { origine: string; justificatif: string } {
  const choix = texte(valeurs.apportOrigineTitres);
  const dateStatuts = dateEnFrancais(texte(valeurs.apporteeDateStatuts));
  /*
   * Le modèle écrit « ainsi qu'il résulte de {justificatif_origine} » : la valeur suit
   * une préposition. Un justificatif qui commencerait par « des statuts » donnerait
   * « résulte de des statuts ». Elle s'ouvre donc sur ce qu'on a examiné.
   */
  const registre = "du registre des mouvements de titres de la société " + cible;

  if (choix === "Souscription à la constitution") {
    return {
      origine: "sa souscription au capital lors de la constitution de la société",
      justificatif:
        "l'examen " +
        (dateStatuts ? "des statuts constitutifs en date du " + dateStatuts + " et " : "") +
        registre,
    };
  }
  if (choix === "Souscription à une augmentation de capital") {
    return {
      origine: "sa souscription à une augmentation du capital de la société",
      justificatif:
        "l'examen des décisions collectives ayant décidé cette augmentation et " + registre,
    };
  }
  if (choix === "Acquisition auprès d'un tiers") {
    return {
      origine: "leur acquisition auprès d'un précédent titulaire",
      justificatif: "l'examen de l'acte de cession correspondant et " + registre,
    };
  }
  if (choix === "Donation ou succession") {
    return {
      origine: "une transmission à titre gratuit",
      justificatif: "l'examen de l'acte notarié correspondant et " + registre,
    };
  }
  return { origine: choix.toLowerCase(), justificatif: "l'examen " + registre };
}

/**
 * Ce que l'apport met au capital, et ce qu'il met en prime.
 *
 * Sans nombre de titres saisi, la valeur entre entièrement au capital et le nominal
 * doit la diviser. Avec un nombre saisi, c'est lui qui commande : les titres émis
 * portent le nominal, et l'écart avec la valeur apportée devient la prime.
 */
export function paritéDeLApport(valeurs: Valeurs): {
  actions: number;
  nominal: number;
  prime: number;
} {
  const valeurApport = nombre(valeurs, "apportValeur");
  const nominale = nombre(valeurs, "apportNominaleBeneficiaire");
  const saisies = nombre(valeurs, "apportActionsEmises");

  const actions = saisies > 0 ? saisies : nominale > 0 ? valeurApport / nominale : 0;
  /* Les centimes évitent qu'un nominal décimal ne laisse une prime d'un millième d'euro. */
  const nominal = Math.round(actions * nominale * 100) / 100;

  return { actions, nominal, prime: Math.max(0, Math.round((valeurApport - nominal) * 100) / 100) };
}

/* ------------------------------------------------- Les contrôles de cohérence */

export interface AlerteDuTraite {
  gravite: "bloquant" | "avertissement";
  message: string;
  champ: string;
}

/**
 * Ce qui rendrait le traité faux, et ce qui mérite un regard.
 *
 * Les contrôles de la notice, dans son ordre. Ils portent sur ce qui se dément d'un
 * article à l'autre - un capital final qui n'est pas la somme des deux augmentations,
 * un pourcentage qui ne correspond pas au nombre de titres - et sur ce qui rendrait
 * l'acte inopposable : un commissaire aux apports qui n'est pas indépendant.
 */
export function verifierLeTraite(contexte: ContexteGabarit): AlerteDuTraite[] {
  const { societe, valeurs } = contexte;
  const alertes: AlerteDuTraite[] = [];

  const capitalActuel = typeof societe.capital === "number" ? societe.capital : 0;
  const numeraire = nombre(valeurs, "apportNumeraire");
  const valeurApport = nombre(valeurs, "apportValeur");

  /*
   * a) Ce qui est émis doit correspondre à ce qui est apporté.
   *
   * Sans nombre de titres saisi, la valeur entre entièrement au capital : le nominal
   * doit alors la diviser, sans reste. Avec un nombre saisi, le reste devient la prime
   * d'apport - c'est permis, et c'est même l'usage quand on ne veut pas diluer. Ce qui
   * ne l'est pas, c'est d'émettre pour plus que la valeur apportée : les titres
   * seraient libérés sans contrepartie.
   */
  const saisies = nombre(valeurs, "apportActionsEmises");
  const parite = paritéDeLApport(valeurs);

  /*
   * La divisibilité sans nombre de titres saisi est déjà relevée par `verifierApport`,
   * sur le même champ : la redire ici afficherait deux fois le même refus sous la même
   * case. Ne restent que les contrôles propres à la parité choisie.
   */
  if (saisies > 0) {
    if (Math.abs(saisies - Math.round(saisies)) > 0.0001) {
      alertes.push({
        gravite: "bloquant",
        champ: "apportActionsEmises",
        message: "Un nombre de titres ne se compte pas en fractions.",
      });
    } else if (parite.nominal > valeurApport + 0.005) {
      alertes.push({
        gravite: "bloquant",
        champ: "apportActionsEmises",
        message:
          "Ces " +
          montant(saisies) +
          " titres valent " +
          montant(parite.nominal) +
          " euros au nominal, pour un apport de " +
          montant(valeurApport) +
          " euros : ils seraient libérés sans contrepartie.",
      });
    }
  }

  /*
   * d) Le régime fiscal suit le contrôle, et rien d'autre.
   *
   * Répondre « Non » au contrôle tout en attendant le report d'imposition est la
   * confusion la plus coûteuse du dossier : le report est de plein droit quand il y a
   * contrôle, le sursis l'est quand il n'y en a pas, et aucune des deux ne s'opte.
   */
  const controle = texte(valeurs.apportControle);
  if (controle && controle !== "Oui" && controle !== "Non") {
    alertes.push({
      gravite: "bloquant",
      champ: "apportControle",
      message: "Dites si l'apporteur contrôlera la holding : c'est ce qui décide du régime fiscal.",
    });
  }

  /*
   * e) Le commissaire aux apports est un tiers.
   *
   * Il engage sa responsabilité sur la valeur qu'il retient : le désigner parmi les
   * associés ou les dirigeants de l'une des deux sociétés vide le rapport de son sens
   * et fait tomber la garantie que le greffe attend de lui.
   */
  const commissaire = texte(valeurs.apportCommissaireNom);
  if (commissaire) {
    const proches = [
      texte(valeurs.apporteurNomComplet),
      texte(valeurs.beneficiaireRepresentant),
      ...(contexte.assemblee.associes ?? []).map((associe) =>
        [texte(associe.civilite), texte(associe.prenom), texte(associe.nom)]
          .filter(Boolean)
          .join(" ")
      ),
    ].filter(Boolean);

    const normaliser = (valeur: string) =>
      valeur
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z]+/g, " ")
        .trim();

    if (proches.some((proche) => normaliser(proche) === normaliser(commissaire))) {
      alertes.push({
        gravite: "bloquant",
        champ: "apportCommissaireNom",
        message:
          "Le commissaire aux apports doit être indépendant des deux sociétés : celui-ci est partie à l'opération.",
      });
    }
  }

  /*
   * Une dispense de commissaire hors des conditions légales.
   *
   * Elle ne se décide pas : au-dessus de 30 000 euros, ou quand l'apport dépasse la
   * moitié du capital final, la loi impose le rapport. C'est un avertissement plutôt
   * qu'un blocage parce qu'une augmentation en numéraire préalable peut encore
   * ramener l'opération sous le seuil - le formulaire le propose.
   */
  const plan = planDeCapital({
    capitalActuelCentimes: Math.round(capitalActuel * 100),
    numeraireCentimes: Math.round(numeraire * 100),
    valeurApportCentimes: Math.round(valeurApport * 100),
    primeCentimes: Math.round(parite.prime * 100),
  });
  const verdict = evaluationDesApports({
    formeBeneficiaire: societe.forme,
    valeurApportCentimes: plan.valeurApportCentimes,
    capitalFinalCentimes: plan.capitalFinalCentimes,
  });
  if (verdict.commissaireRequis && texte(valeurs.apportCommissaire).startsWith("Non")) {
    alertes.push({
      gravite: "bloquant",
      champ: "apportCommissaire",
      message:
        "La dispense de commissaire aux apports n'est pas ouverte ici : " +
        verdict.motifs.join(" "),
    });
  }

  return alertes;
}

/** Les incohérences du traité, au format du formulaire. */
export function anomaliesDuTraite(contexte: ContexteGabarit): { champ: string; message: string }[] {
  return verifierLeTraite(contexte)
    .filter((alerte) => alerte.gravite === "bloquant")
    .map((alerte) => ({ champ: alerte.champ, message: alerte.message }));
}

/* ------------------------------------------------------------- Le jeu de balises */

/**
 * Le traité d'apport, écrit dans les balises du modèle du cabinet.
 *
 * Tout ce qui se calcule se calcule ici : les numéros des titres et des articles, le
 * capital d'après, le nombre d'actions émises, les critères de valorisation, les
 * conditions suspensives et les annexes. Le formulaire ne demande que ce qu'aucun
 * calcul ne peut donner.
 */
export function donneesDuTraite(contexte: ContexteGabarit): Record<string, unknown> {
  const { societe, valeurs, assemblee } = contexte;

  const capitalActuel = typeof societe.capital === "number" ? societe.capital : 0;
  const numeraire = nombre(valeurs, "apportNumeraire");
  const valeurApport = nombre(valeurs, "apportValeur");
  const nominale = nombre(valeurs, "apportNominaleBeneficiaire");
  const titresApportes = nombre(valeurs, "apportNbTitres");
  const titresCible = nombre(valeurs, "apporteeNbTitres");

  const souscriptionNumeraire = numeraire > 0;
  const double = doubleRepresentation(valeurs);

  const parite = paritéDeLApport(valeurs);
  const plan = planDeCapital({
    capitalActuelCentimes: Math.round(capitalActuel * 100),
    numeraireCentimes: Math.round(numeraire * 100),
    valeurApportCentimes: Math.round(valeurApport * 100),
    primeCentimes: Math.round(parite.prime * 100),
  });

  const actionsNature = Math.round(parite.actions);
  const actionsNumeraire = nominale > 0 ? Math.round(numeraire / nominale) : 0;

  const cible = texte(valeurs.apporteeDenomination);
  const apporteur = texte(valeurs.apporteurNomComplet);
  const commissaire = texte(valeurs.apportCommissaire) === "Oui";
  const controle = texte(valeurs.apportControle) === "Oui";

  /*
   * L'état civil de l'apporteur, en une ligne.
   *
   * Le traité l'identifie pour un tiers - un commissaire, un greffe, un contrôleur des
   * impôts des années plus tard : la seule civilité et le nom ne suffisent pas là où
   * un procès-verbal s'en contente.
   */
  const naissance = [
    texte(valeurs.apporteurNeLe) ? "né le " + dateEnFrancais(texte(valeurs.apporteurNeLe)) : "",
    aLieu(texte(valeurs.apporteurNeA)),
  ]
    .filter(Boolean)
    /* « né le 9 juillet 2003 au Chesnay » : la date et le lieu font une seule mention. */
    .join(" ");

  const identification = [
    apporteur,
    naissance,
    texte(valeurs.apporteurNationalite)
      ? "de nationalité " + texte(valeurs.apporteurNationalite).toLowerCase()
      : "",
    texte(valeurs.apporteurAdresse)
      ? "demeurant " + adresseLisible(texte(valeurs.apporteurAdresse))
      : "",
  ]
    .filter(Boolean)
    .join(", ");

  /*
   * Qui engage la holding.
   *
   * Quand l'apporteur en est le représentant légal, c'est lui, et le formulaire ne le
   * redemande pas : il l'a déjà dit en déclarant sa qualité.
   */
  const representantBeneficiaire = double
    ? apporteur + ", en sa qualité de représentant légal"
    : texte(valeurs.beneficiaireRepresentant);

  const associes = assemblee.associes ?? [];
  const nomsDesAssocies = associes
    .map((associe) =>
      associe.nature === "morale"
        ? "la société " + texte(associe.denomination)
        : [texte(associe.civilite), texte(associe.prenom), texte(associe.nom)]
            .filter(Boolean)
            .join(" ")
    )
    .filter((nom) => nom.trim() && nom.trim() !== "la société");

  const titresBeneficiaire =
    typeof assemblee.totalParts === "number" && assemblee.totalParts > 0
      ? assemblee.totalParts
      : associes.reduce((somme, associe) => somme + (associe.parts ?? 0), 0);

  const { origine, justificatif } = origineEtJustificatif(valeurs, cible);
  const numerotation = texte(valeurs.apportNumerotation);

  /*
   * Les conditions suspensives, dans l'ordre où elles se lèvent.
   *
   * L'approbation par l'organe compétent vient toujours ; le rapport du commissaire
   * n'y figure que s'il y en a un. Le modèle citait « décision de l'associé unique »
   * en dur : l'organe se nomme ici d'après la composition réelle de la bénéficiaire.
   */
  const organeCompetent =
    associes.length <= 1
      ? "décision de l'associé unique de la Société Bénéficiaire"
      : "décision collective des associés de la Société Bénéficiaire statuant en assemblée générale extraordinaire";

  const conditions = [
    "approbation du présent traité et de l'augmentation de capital rémunérant l'Apport par " +
      organeCompetent +
      (commissaire ? " ;" : "."),
    ...(commissaire ? ["remise du rapport du commissaire aux apports."] : []),
  ];

  const annexes = [
    "Attestation de valorisation établie par les Parties",
    ...(commissaire ? ["Rapport du commissaire aux apports"] : []),
    "Statuts à jour de la société " + cible,
  ];

  const lettre = (rang: number) => String.fromCharCode(97 + rang) + ")";

  return {
    ...numerotationDuTraite({ souscriptionNumeraire, doubleRepresentation: double }),

    /* ------------------------------------------------------------- Les parties */
    apporteur_court: apporteur,
    identification_apporteur: identification,
    double_representation: double,
    nom_representant_commun: apporteur,

    denomination_beneficiaire: texte(societe.denomination),
    forme_beneficiaire: formeEnToutesLettres(texte(societe.forme)).toLowerCase(),
    capital_beneficiaire: montant(capitalActuel),
    siege_beneficiaire: adresseLisible(
      [texte(societe.adresse), [texte(societe.codePostal), texte(societe.ville)].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ")
    ),
    rcs_ville_beneficiaire: enCapitaleInitiale(texte(societe.villeRcs) || texte(societe.ville)),
    rcs_numero_beneficiaire: sirenEspace(texte(societe.siren)),
    representant_beneficiaire: representantBeneficiaire,
    objet_beneficiaire: texte(valeurs.beneficiaireObjet),
    nb_titres_beneficiaire: montant(titresBeneficiaire),
    valeur_nominale_beneficiaire: montant(nominale),
    /*
     * « réparti entre » ne se dit pas d'un associé unique : rien n'est réparti quand
     * une seule main détient tout.
     */
    repartition_capital_beneficiaire:
      nomsDesAssocies.length === 0
        ? "intégralement souscrit et libéré"
        : nomsDesAssocies.length === 1
          ? "détenu en totalité par " + nomsDesAssocies[0]
          : "réparti entre " +
            nomsDesAssocies.slice(0, -1).join(", ") +
            " et " +
            nomsDesAssocies.at(-1),

    /* --------------------------------------------- La société dont les titres viennent */
    denomination_cible: cible,
    forme_cible: formeEnToutesLettres(texte(valeurs.apporteeForme)).toLowerCase(),
    capital_cible: montant(nombre(valeurs, "apporteeCapital")),
    siege_cible: adresseLisible(texte(valeurs.apporteeSiege)),
    rcs_ville_cible: enCapitaleInitiale(texte(valeurs.apporteeRcs)),
    rcs_numero_cible: sirenEspace(texte(valeurs.apporteeSiren)),
    nb_titres_total_cible: montant(titresCible),
    nature_titres_cible: naturDesTitres(texte(valeurs.apporteeForme)),
    valeur_nominale_cible: montant(nombre(valeurs, "apporteeNominale")),

    /* ---------------------------------------------------------- L'apport lui-même */
    nb_titres_apportes: montant(titresApportes),
    nb_titres_apportes_lettres: nombreEnFrancais(titresApportes),
    pourcentage_capital: titresCible
      ? String(Math.round((titresApportes / titresCible) * 10000) / 100).replace(".", ",")
      : "",
    origine_propriete: origine,
    justificatif_origine: justificatif,
    /*
     * La numérotation ne se cite que si elle existe.
     *
     * Des parts sociales ne se numérotent pas, et des actions ne le sont pas toujours.
     * Le modèle attend un fragment de phrase prêt à s'insérer, virgule comprise.
     */
    numerotation_titres: numerotation ? ", numérotées " + numerotation : "",
    contexte_operation: "une opération de restructuration patrimoniale",
    /*
     * Les lettres de l'objet du traité, au préambule (G).
     *
     * La première ligne - la souscription en numéraire - n'existe pas toujours. Sans
     * elle, l'énumération commençait à « b) » et le lecteur cherchait un a) absent.
     */
    g_apport: souscriptionNumeraire ? "b)" : "a)",
    g_acceptation: souscriptionNumeraire ? "c)" : "b)",
    fondement_legal_apport: fondementLegalDeLApport(societe.forme),

    /* ------------------------------------------------------------ La valorisation */
    methode_valorisation: texte(valeurs.apportMethodeValorisation).toLowerCase(),
    valeur_titres: montant(valeurApport),
    valeur_titres_lettres: nombreEnFrancais(valeurApport),
    criteres_valorisation: criteresDeValorisation(
      texte(valeurs.apportMethodeValorisation)
    ).map((texteDuCritere, rang) => ({ lettre: lettre(rang), texte: texteDuCritere })),
    /*
     * L'attestation des parties, dans les deux cas.
     *
     * Elle ne concurrence pas le rapport du commissaire : elle dit ce dont les parties
     * sont convenues, il dit ce qu'un tiers indépendant retient. Le modèle numérote
     * ses sous-articles en dur - 5.1 la valeur, 5.2 l'attestation, 5.3 le rapport ou
     * la dispense : éteindre 5.2 faisait sauter le document de 5.1 à 5.3.
     */
    attestation_valorisation: true,
    commissaire,
    commissaire_apports: texte(valeurs.apportCommissaireNom),
    modalite_designation_commissaire:
      "à l'unanimité des " +
      (naturDesTitres(texte(societe.forme)) === "actions" ? "actionnaires" : "associés") +
      " de la Société Bénéficiaire",
    fondement_dispense_commissaire: fondementDeLaDispense(societe.forme),

    /* ----------------------------------------------------------- La rémunération */
    /*
     * L'augmentation porte ce qui monte au capital, non ce qui est apporté.
     *
     * La prime va en réserve. Écrire la valeur entière ferait annoncer un capital que
     * les statuts ne porteraient pas, et le greffe verrait l'écart avant nous.
     */
    montant_augmentation: montant(parite.nominal),
    montant_augmentation_lettres: nombreEnFrancais(parite.nominal),
    mention_prime_apport:
      parite.prime > 0
        ? "assorties d'une prime d'apport globale de " +
          montant(parite.prime) +
          " euros, soit " +
          montant(Math.round((parite.prime / (actionsNature || 1)) * 100) / 100) +
          " euros par titre, portée à un compte de prime d'apport au passif du bilan"
        : "sans prime d'apport",
    nb_actions_nouvelles: montant(actionsNature),
    nb_actions_nouvelles_lettres: nombreEnFrancais(actionsNature),
    capital_avant: montant(plan.capitalApresNumeraireCentimes / 100),
    capital_avant_lettres: nombreEnFrancais(plan.capitalApresNumeraireCentimes / 100),
    capital_apres: montant(plan.capitalFinalCentimes / 100),
    capital_apres_lettres: nombreEnFrancais(plan.capitalFinalCentimes / 100),
    repartition_post_operations:
      "conformément à la décision de l'organe compétent de la Société Bénéficiaire approuvant l'opération",

    /* ------------------------------------- L'augmentation en numéraire préalable */
    souscription_numeraire: souscriptionNumeraire,
    nb_actions_numeraire: montant(actionsNumeraire),
    montant_numeraire: montant(numeraire),
    mention_prime_numeraire: "sans prime d'émission",
    modalites_liberation_numeraire:
      "intégralement en numéraire lors de leur souscription, par versement en espèces ou par virement",

    /* --------------------------------------------------------------- Le fiscal */
    regime_150_0_b_ter: controle,
    /*
     * Les deux derniers sous-articles du régime fiscal, numérotés selon le régime.
     *
     * Le report d'imposition occupe les sous-articles 2 à 5 ; le sursis n'occupe que
     * le 2. Les droits d'enregistrement et la TVA suivent l'un ou l'autre, et leur
     * numéro ne peut donc pas être écrit dans le modèle.
     */
    sf_enregistrement: controle ? "6" : "3",
    sf_tva: controle ? "7" : "4",
    detail_controle:
      "compte tenu de la détention, à l'issue de l'opération, de la majorité du capital et des droits de vote de la Société Bénéficiaire",

    /* ----------------------------------------------- Conditions et dispositions */
    conditions_suspensives: conditions.map((texteDeLaCondition, rang) => ({
      lettre: lettre(rang),
      texte: texteDeLaCondition,
    })),
    date_butoir: dateEnFrancais(texte(valeurs.apportDateLimiteCondition)),
    debiteur_frais: "la Société Bénéficiaire",
    cour_appel: courDAppel(texte(societe.codePostal), texte(societe.villeRcs) || texte(societe.ville)),
    /*
     * Un exemplaire par partie, un pour les formalités.
     *
     * L'usage, et ce que le greffe attend : l'original déposé n'est jamais rendu, et
     * chaque partie doit garder le sien.
     */
    nb_exemplaires: "3",
    nb_exemplaires_lettres: "trois",

    annexes_presentes: annexes.length > 0,
    annexes: annexes.map((intitule, rang) => ({ num: String(rang + 1), intitule })),

    lieu_signature: enCapitaleInitiale(texte(valeurs.apportLieuSignature) || texte(societe.ville)),
    date_signature: dateEnFrancais(texte(valeurs.apportDateSignature)),

    /*
     * Deux signatures, même quand une seule main les trace.
     *
     * En double représentation, l'apporteur signe en son nom puis pour la société :
     * ce sont deux engagements distincts, et l'acte doit porter les deux qualités.
     */
    signataires: [
      { nom_signataire: apporteur, qualite_signataire: "L'Apporteur" },
      {
        nom_signataire: double ? apporteur : representantBeneficiaire,
        qualite_signataire: "La Société Bénéficiaire",
      },
    ],
  };
}

/**
 * Le lieu de naissance, avec la préposition que le nom appelle.
 *
 * « à Le Chesnay-Rocquencourt » se lit dans un acte comme une faute de saisie. Les
 * communes dont le nom porte un article se contractent - au Havre, aux Sables-d'Olonne
 * - et c'est le seul point où l'état civil français réserve une surprise.
 */
function aLieu(lieu: string): string {
  if (!lieu) return "";
  if (/^Le /.test(lieu)) return "au " + lieu.slice(3);
  if (/^Les /.test(lieu)) return "aux " + lieu.slice(4);
  if (/^La /.test(lieu)) return "à la " + lieu.slice(3);
  if (/^L'/.test(lieu)) return "à l'" + lieu.slice(2);
  return "à " + lieu;
}

/** Actions ou parts sociales, selon la forme. */
function naturDesTitres(forme: string): string {
  return natureDeLaForme(forme).titres;
}
