import { natureDeLaForme } from "@/domain/formalite/formes";
import { dateEnFrancais, nombreEnFrancais } from "@/domain/formalite/lettres";
import { formeEnToutesLettres } from "./annonce";
import { agrementDeDroit, nomDeLAssocie, type Cession } from "./cession";
import { adresseLisible, enCapitaleInitiale, type ContexteGabarit } from "./gabarit";
import { montant, sirenEspace } from "./pv-age";
import { courDAppel } from "./traite-apport";

/**
 * L'acte de cession de titres, traduit vers le modèle universel.
 *
 * Même stratégie que le procès-verbal et le traité d'apport : le .docx ne porte aucune
 * donnée, et cette couche traduit le dossier vers ses balises. Le modèle est écrit par
 * scripts/modele-acte-cession.js, à partir de deux actes réels dont il ne reste rien
 * d'autre que la structure.
 *
 * Deux choses le distinguent de l'acte qu'il remplace. Il parle la langue de la forme
 * sociale - une SAS cède des actions, pas des parts sociales, et l'ancien acte écrivait
 * « parts sociales » jusque dans son titre. Et il groupe : une assemblée qui décide
 * trois cessions vers le même acquéreur produit un acte, non trois, parce que c'est un
 * seul contrat, un seul prix global et un seul enregistrement fiscal. L'ancien gabarit
 * n'employait que des balises au singulier, alimentées par la première cession : les
 * suivantes n'avaient aucun acte.
 */

/* ------------------------------------------------------------ Petites lectures */

function texte(valeur: unknown): string {
  return typeof valeur === "string" ? valeur.trim() : typeof valeur === "number" ? String(valeur) : "";
}

/** Les lettres qui ouvrent une énumération : a), b), c)… */
function puce(rang: number): string {
  return String.fromCharCode(97 + rang) + ")";
}

/* --------------------------------------------------- La terminologie de la forme */

export interface MotsDeLaCession {
  /** « actions » ou « parts sociales ». */
  titres: string;
  titreSingulier: string;
  /** « d'actions » ou « de parts sociales », pour le titre de l'acte. */
  deTitres: string;
  associesPluriel: string;
  /** Le texte qui fonde l'agrément dans cette forme. */
  fondementAgrement: string;
}

export function motsDeLaCession(forme: string | null | undefined): MotsDeLaCession {
  /*
   * Cette fonction tenait sa propre liste - SAS, SASU, SA - et une SELAS y cédait des
   * parts sociales. La nature de la forme est déclarée une fois, dans le domaine.
   */
  const nature = natureDeLaForme(forme);
  const parActions = nature.titres === "actions";
  const civile = nature.categorie === "civile" || nature.categorie === "civile-agricole";

  return {
    titres: nature.titres,
    titreSingulier: nature.titreSingulier,
    deTitres: parActions ? "d'actions" : "de parts sociales",
    associesPluriel: nature.associesPluriel,
    /*
     * L'agrément d'une société par actions simplifiée ne vient pas de la loi mais d'une
     * clause : l'article L. 227-14 renvoie aux statuts, il ne l'impose pas. Une société
     * civile, elle, le tient de l'article 1861 du code civil.
     */
    fondementAgrement: civile
      ? "l'article 1861 du code civil"
      : parActions
        ? "l'article L. 227-14 du code de commerce"
        : "l'article L. 223-14 du code de commerce",
  };
}

/* ----------------------------------------------------- Qui cède, qui acquiert */

/** L'identité d'un acquéreur tiers, telle qu'un acte enregistré la porte. */
export function identificationDuTiers(cession: Cession): string {
  const nom = texte(cession.nom);
  const adresse = adresseLisible(texte(cession.adresse));

  if (cession.nature === "morale") {
    const morceaux = [nom];
    const forme = texte(cession.forme);
    const capital = typeof cession.capital === "number" ? cession.capital : null;

    if (forme && capital !== null) {
      morceaux.push(
        formeEnToutesLettres(forme).toLowerCase() + " au capital de " + montant(capital) + " euros"
      );
    } else if (forme) {
      morceaux.push(formeEnToutesLettres(forme).toLowerCase());
    }

    const siren = texte(cession.siren);
    if (siren) {
      morceaux.push(
        "immatriculée au registre du commerce et des sociétés de " +
          enCapitaleInitiale(texte(cession.villeRcs)) +
          " sous le numéro " +
          sirenEspace(siren)
      );
    }
    if (adresse && adresse !== "-") morceaux.push("dont le siège social est situé " + adresse);

    const representant = texte(cession.representant);
    if (representant) morceaux.push("représentée par " + representant);

    return morceaux.filter(Boolean).join(", ");
  }

  /*
   * Une personne physique : l'état civil que réclame l'enregistrement.
   *
   * Chaque mention manquante disparaît plutôt que de laisser un blanc entre deux
   * virgules - un acte à trous se lit comme un brouillon.
   */
  return [
    nom,
    texte(cession.neLe) ? "né le " + dateEnFrancais(texte(cession.neLe)) : "",
    texte(cession.neA) ? "à " + texte(cession.neA) : "",
    texte(cession.nationalite) ? "de nationalité " + texte(cession.nationalite).toLowerCase() : "",
    adresse && adresse !== "-" ? "demeurant " + adresse : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** L'identité d'un associé de la société, cédant ou intervenant. */
function identificationDeLAssocie(
  associe: ContexteGabarit["assemblee"]["associes"] extends (infer A)[] | undefined ? A : never
): string {
  const a = associe as Record<string, unknown>;

  if (a.nature === "morale") {
    const morceaux = [];
    const denomination = texte(a.denomination);
    if (denomination) morceaux.push("la société " + denomination);

    const forme = texte(a.forme);
    const capital = typeof a.capital === "number" ? a.capital : null;
    if (forme && capital !== null) {
      morceaux.push(
        formeEnToutesLettres(forme).toLowerCase() + " au capital de " + montant(capital) + " euros"
      );
    } else if (forme) {
      morceaux.push(formeEnToutesLettres(forme).toLowerCase());
    }

    const siren = texte(a.siren);
    if (siren) {
      morceaux.push(
        "immatriculée au registre du commerce et des sociétés sous le numéro " + sirenEspace(siren)
      );
    }
    const siege = texte(a.siege);
    if (siege) morceaux.push("dont le siège social est situé " + adresseLisible(siege));

    const representant = texte(a.representant);
    if (representant) morceaux.push("représentée par " + representant);

    return morceaux.join(", ");
  }

  return [texte(a.civilite), texte(a.prenom), texte(a.nom)].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------- Le groupement */

export interface ActeDeCession {
  /** Les cessions qui composent cet acte : elles vont toutes au même acquéreur. */
  cessions: Cession[];
  /** Comment l'acquéreur se nomme, pour distinguer les actes entre eux. */
  acquereur: string;
}

/**
 * Les actes à produire, un par acquéreur.
 *
 * Trois associés qui cèdent au même acquéreur signent un contrat, pas trois : un prix
 * global, un enregistrement, une seule liasse. Deux acquéreurs distincts, en revanche,
 * n'ont rien à faire dans le même acte - ils ne sont pas parties l'un pour l'autre, et
 * la confidentialité de l'article s'en trouverait vidée de sens.
 */
export function actesDeCession(contexte: ContexteGabarit): ActeDeCession[] {
  const associes = contexte.assemblee.associes ?? [];
  const groupes = new Map<string, ActeDeCession>();

  for (const cession of contexte.cessions ?? []) {
    const cle =
      cession.vers === "associe"
        ? "associe:" + String(cession.cessionnaire ?? "")
        : "tiers:" + texte(cession.nom).toLowerCase();

    const acquereur =
      cession.vers === "associe"
        ? nomDeLAssocie(associes[cession.cessionnaire ?? -1], cession.cessionnaire ?? 0)
        : texte(cession.nom);

    const groupe = groupes.get(cle);
    if (groupe) groupe.cessions.push(cession);
    else groupes.set(cle, { cessions: [cession], acquereur });
  }

  return [...groupes.values()];
}

/* ------------------------------------------------- Les contrôles de cohérence */

export interface AlerteDeCession {
  gravite: "bloquant" | "avertissement";
  message: string;
  champ: string;
}

/**
 * Ce qui rendrait l'acte faux.
 *
 * Les contrôles de forme - un cédant qui cède plus qu'il ne détient, un prix absent -
 * vivent dans `verifierCessions`, qui garde l'écran de saisie. Ceux-ci portent sur ce
 * que l'acte affirme : un pourcentage qui ne peut pas se calculer, un acquéreur qui
 * n'est pas identifié, une garantie sans durée.
 */
export function verifierLActeDeCession(contexte: ContexteGabarit): AlerteDeCession[] {
  const alertes: AlerteDeCession[] = [];
  const { valeurs, assemblee } = contexte;
  const cessions = contexte.cessions ?? [];
  if (cessions.length === 0) return alertes;

  /*
   * Sans le nombre total de titres, aucun pourcentage n'est calculable.
   *
   * L'acte annonce « représentant X % du capital social et des droits de vote » : c'est
   * la mention que l'administration fiscale regarde, et un blanc à cet endroit fait
   * refuser l'enregistrement.
   */
  const total =
    typeof assemblee.totalParts === "number" && assemblee.totalParts > 0
      ? assemblee.totalParts
      : (assemblee.associes ?? []).reduce((somme, a) => somme + (a.parts ?? 0), 0);

  if (total <= 0) {
    alertes.push({
      gravite: "bloquant",
      champ: "assemblee-total-parts",
      message:
        "Le nombre total de titres de la société est nécessaire : c'est lui qui donne le pourcentage cédé, que l'acte doit porter.",
    });
  }

  /* Une garantie d'actif et de passif sans durée n'engage sur rien. */
  if (texte(valeurs.cessionGarantiePassif) === "Oui" && !texte(valeurs.cessionDureeGarantie)) {
    alertes.push({
      gravite: "bloquant",
      champ: "cessionDureeGarantie",
      message: "Indiquez la durée de la garantie d'actif et de passif.",
    });
  }

  /* Un acquéreur tiers non nommé laisse l'acte sans partie. */
  for (const [rang, cession] of cessions.entries()) {
    if (cession.vers !== "tiers") continue;
    if (!texte(cession.nom)) {
      alertes.push({
        gravite: "bloquant",
        champ: "cession-" + rang + "-nom",
        message: "Nommez l'acquéreur : l'acte ne peut pas désigner une partie sans nom.",
      });
    }
  }

  return alertes;
}

/** Les incohérences de l'acte, au format du formulaire. */
export function anomaliesDeLActeDeCession(
  contexte: ContexteGabarit
): { champ: string; message: string }[] {
  return verifierLActeDeCession(contexte)
    .filter((alerte) => alerte.gravite === "bloquant")
    .map((alerte) => ({ champ: alerte.champ, message: alerte.message }));
}

/* ------------------------------------------------------------ Le jeu de balises */

/**
 * L'acte de cession, écrit dans les balises du modèle.
 *
 * @param acte les cessions d'un même acquéreur, telles que `actesDeCession` les groupe
 */
export function donneesDeLActeDeCession(
  contexte: ContexteGabarit,
  acte: ActeDeCession
): Record<string, unknown> {
  const { societe, valeurs, assemblee } = contexte;
  const associes = assemblee.associes ?? [];
  const mots = motsDeLaCession(societe.forme);

  const capital = typeof societe.capital === "number" ? societe.capital : 0;
  const total =
    typeof assemblee.totalParts === "number" && assemblee.totalParts > 0
      ? assemblee.totalParts
      : associes.reduce((somme, a) => somme + (a.parts ?? 0), 0);

  const nominale = total > 0 ? Math.round((capital / total) * 100) / 100 : 0;

  const titresCedes = acte.cessions.reduce((somme, c) => somme + (c.parts ?? 0), 0);
  const prixTotal = acte.cessions.reduce((somme, c) => somme + (c.prix ?? 0), 0);
  const prixParTitre = titresCedes > 0 ? Math.round((prixTotal / titresCedes) * 100) / 100 : 0;

  const premiere = acte.cessions[0];
  const plusieurs = acte.cessions.length > 1;

  /* Les cédants, dans l'ordre où ils cèdent. */
  const cedants = acte.cessions.map((cession) => ({
    identification: identificationDeLAssocie(associes[cession.cedant ?? -1] ?? {}),
    nom: nomDeLAssocie(associes[cession.cedant ?? -1], cession.cedant ?? 0),
    titres: cession.parts ?? 0,
  }));

  const acquereurEstAssocie = premiere?.vers === "associe";
  const identificationAcquereur = acquereurEstAssocie
    ? identificationDeLAssocie(associes[premiere.cessionnaire ?? -1] ?? {})
    : identificationDuTiers(premiere ?? ({} as Cession));

  /*
   * Les autres associés interviennent à l'acte.
   *
   * Ils ne sont pas parties, mais ils reconnaissent la répartition du capital et
   * déclarent ne pas s'opposer à l'entrée de l'acquéreur : c'est ce qui rend la cession
   * paisible, et c'est ce que fait l'un des deux actes de référence.
   */
  const rangsConcernes = new Set<number>();
  for (const cession of acte.cessions) {
    if (cession.cedant !== null && cession.cedant !== undefined) rangsConcernes.add(cession.cedant);
    if (acquereurEstAssocie && premiere.cessionnaire !== null && premiere.cessionnaire !== undefined) {
      rangsConcernes.add(premiere.cessionnaire);
    }
  }
  const intervenants = associes
    .map((associe, rang) => ({ associe, rang }))
    .filter(({ rang }) => !rangsConcernes.has(rang))
    .map(({ associe }) => ({
      identification: identificationDeLAssocie(associe),
      qualite: "d'autre " + mots.associesPluriel.replace(/s$/, "") + " de la Société",
    }));

  /* L'agrément : de droit dans certaines formes, statutaire dans les autres. */
  const agrementDuDroit = acte.cessions.some(
    (cession) => agrementDeDroit(societe.forme, cession.vers).requis
  );
  const agrement = agrementDuDroit || texte(valeurs.agrementRequis) === "Oui";

  const garantiePassif = texte(valeurs.cessionGarantiePassif) === "Oui";

  /* La numérotation : l'agrément et le passif sont là ou non, les suivants suivent. */
  const articles = [
    "a_objet",
    "a_origine",
    "a_prix",
    "a_modalites",
    "a_agrement",
    "a_garanties",
    "a_passif",
    "a_jouissance",
    "a_confidentialite",
    "a_frais",
    "a_formalites",
    "a_domicile",
  ];
  const numeros: Record<string, string> = {};
  articles.forEach((article, rang) => {
    numeros[article] = String(rang + 1);
  });

  const dateTransfert =
    texte(valeurs.cessionDateTransfert) || texte(premiere?.date) || texte(assemblee.date);

  return {
    ...numeros,

    /* ------------------------------------------------------------ La forme */
    de_titres: mots.deTitres,
    euro_capital: euro(capital),
    euro_nominal: euro(nominale),
    euro_prix: euro(prixParTitre),
    euro_prix_total: euro(prixTotal),

    /*
     * Les accords que le nombre de cédants commande.
     *
     * Le modèle sert un cédant comme il en sert trois : « Les Cédants déclare » se lit
     * dans un acte enregistré aux impôts, et rien dans le document ne peut le prévenir.
     */
    declare: plusieurs ? "déclarent" : "déclare",
    garantit: plusieurs ? "garantissent" : "garantit",
    sengage: plusieurs ? "s'engagent" : "s'engage",
    sinterdit: plusieurs ? "s'interdisent" : "s'interdit",
    disposera: plusieurs ? "disposeront" : "disposera",
    quil_dispose: plusieurs ? "qu'ils disposent" : "qu'il dispose",
    a_son_nom: plusieurs ? "à leur nom" : "à son nom",
    sa_connaissance: plusieurs ? "leur connaissance" : "sa connaissance",
    proprietaire_des_titres:
      (plusieurs ? "pleins et entiers propriétaires des " : "plein et entier propriétaire des ") +
      mots.titres +
      " cédées",
    titres: mots.titres,
    titre_singulier: mots.titreSingulier,

    /* --------------------------------------------------------- Les parties */
    cedants,
    plusieurs_cedants: plusieurs,
    detail_cedants: cedants.map((cedant, rang) => ({
      puce: puce(rang),
      ligne:
        cedant.nom +
        ", " +
        montant(cedant.titres) +
        " " +
        (cedant.titres > 1 ? mots.titres : mots.titreSingulier) +
        (total > 0
          ? ", soit " + pourcentage(cedant.titres, total) + " % du capital social"
          : ""),
    })),
    le_cedant: plusieurs ? "les Cédants" : "le Cédant",
    le_cedant_maj: plusieurs ? "Les Cédants" : "Le Cédant",
    denomme_cedant: plusieurs ? "dénommés ensemble" : "dénommé",
    sengage_a_garantir: plusieurs ? "s'engagent solidairement à garantir" : "s'engage à garantir",

    identification_acquereur: identificationAcquereur,
    denomme_acquereur: acquereurEstAssocie ? "désigné" : "désigné",

    intervenants_presents: intervenants.length > 0,
    intervenants,
    denomme_intervenant: intervenants.length > 1 ? "désignés" : "désignée",
    les_intervenants:
      intervenants.length > 1 ? "les Associés Intervenants" : "l'Associé Intervenant",

    /* -------------------------------------------------------- La société */
    denomination: texte(societe.denomination),
    forme_sociale: formeEnToutesLettres(texte(societe.forme)).toLowerCase(),
    capital: montant(capital),
    siege_social: adresseLisible(
      [
        texte(societe.adresse),
        [texte(societe.codePostal), texte(societe.ville)].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ")
    ),
    rcs_ville: enCapitaleInitiale(texte(societe.villeRcs) || texte(societe.ville)),
    rcs_numero: sirenEspace(texte(societe.siren)),
    representant_societe: texte(valeurs.cessionRepresentantSociete) || "son représentant légal",
    objet_societe: texte(valeurs.cessionObjetSociete) || "l'activité définie par ses statuts",
    total_titres: montant(total),
    valeur_nominale: montant(nominale),

    repartition_avant: associes
      .filter((associe) => (associe.parts ?? 0) > 0)
      .map((associe, rang) => ({
        puce: puce(rang),
        ligne:
          nomDeLAssocie(associe, rang) +
          ", " +
          montant(associe.parts ?? 0) +
          " " +
          mots.titres +
          (total > 0 ? ", soit " + pourcentage(associe.parts ?? 0, total) + " %" : ""),
      })),

    /* ---------------------------------------------------------- La cession */
    nb_titres_cedes: montant(titresCedes),
    nb_titres_cedes_lettres: nombreEnFrancais(titresCedes),
    pourcentage_cede: total > 0 ? pourcentage(titresCedes, total) : "",
    titre_onereux: "à titre onéreux",
    origine_propriete:
      texte(premiere?.origine) || "ont été souscrites lors de la constitution de la Société",
    contexte_operation:
      texte(valeurs.cessionContexte) ||
      "Les parties ont convenu de réorganiser la détention du capital social de la Société.",

    /* ------------------------------------------------------------- Le prix */
    prix: montant(prixTotal),
    prix_lettres: nombreEnFrancais(prixTotal),
    prix_par_titre: montant(prixParTitre),
    justification_prix:
      texte(valeurs.cessionJustificationPrix) ||
      "Ce prix a été librement convenu entre les parties, qui reconnaissent que la valeur retenue demeure soumise aux règles fiscales applicables en matière de détermination de la valeur réelle des titres.",
    modalites_paiement: modalitesDePaiement(texte(valeurs.cessionModalitePaiement)),

    /* -------------------------------------------------------- Les modalités */
    formule_transfert:
      mots.titres === "actions"
        ? "La transmission des actions s'opère à l'égard de la Société et des tiers par virement du compte du cédant au compte de l'acquéreur, sur production d'un ordre de mouvement signé."
        : "La cession est opposable à la Société par le dépôt d'un original des présentes au siège social, et aux tiers par le dépôt au registre du commerce et des sociétés des statuts mis à jour de la répartition du capital.",
    date_transfert: dateEnFrancais(dateTransfert),
    clause_compte_courant:
      texte(valeurs.cessionCompteCourant) === "Cédé séparément"
        ? "La créance de compte courant d'associé que le cédant détient à l'encontre de la Société fait l'objet d'une convention séparée, extérieure au champ des présentes."
        : "Il est expressément convenu que la présente cession porte exclusivement sur les " +
          mots.titres +
          ". Toute créance, dette, compte courant d'associé ou relation contractuelle distincte entre le cédant et la Société demeure extérieure au champ des présentes, sauf accord écrit contraire.",

    /* --------------------------------------------------------- L'agrément */
    agrement,
    fondement_agrement: mots.fondementAgrement,
    des_associes: "des " + mots.associesPluriel,
    les_associes_maj: "Les " + mots.associesPluriel,
    date_agrement: dateEnFrancais(texte(assemblee.date)),

    /* ------------------------------------------------- L'actif et le passif */
    garantie_passif: garantiePassif,
    duree_garantie: texte(valeurs.cessionDureeGarantie) || "trois ans",
    plafond_garantie: texte(valeurs.cessionPlafondGarantie)
      ? "Elle est plafonnée à " + texte(valeurs.cessionPlafondGarantie) + "."
      : "",
    motif_absence_garantie:
      texte(valeurs.cessionMotifAbsenceGarantie) ||
      "Compte tenu de la nature de l'opération et de la connaissance que l'Acquéreur déclare avoir de la situation de la Société, aucune garantie d'actif et de passif n'est consentie au titre des présentes, au-delà des garanties de propriété, de capacité et de libre disposition expressément stipulées.",

    /* ------------------------------------------------------------- Le reste */
    debiteur_droits: "l'Acquéreur",
    qui_enregistre: "L'Acquéreur en assure le règlement.",
    tribunal: courDAppel(texte(societe.codePostal), texte(societe.villeRcs) || texte(societe.ville)),
    lieu_signature: enCapitaleInitiale(
      texte(valeurs.cessionLieuSignature) || texte(societe.ville)
    ),
    date_signature: dateEnFrancais(texte(premiere?.date) || texte(assemblee.date)),
    nb_exemplaires: String(acte.cessions.length + 3),
    nb_exemplaires_lettres: nombreEnFrancais(acte.cessions.length + 3),

    signataires: [
      ...cedants.map((cedant) => ({
        nom_signataire: cedant.nom,
        qualite_signataire: plusieurs ? "Cédant" : "Le Cédant",
      })),
      { nom_signataire: acte.acquereur, qualite_signataire: "L'Acquéreur" },
      ...intervenants.map((intervenant) => ({
        nom_signataire: intervenant.identification.split(",")[0],
        qualite_signataire: "Intervenant",
      })),
      {
        nom_signataire: texte(societe.denomination),
        qualite_signataire: "La Société, pour prise d'acte",
      },
    ],
  };
}

/**
 * L'euro s'accorde, comme tout nom compté.
 *
 * « une valeur nominale de 1 euros » se lit dans un acte signé, et la cession à l'euro
 * symbolique n'est pas une hypothèse d'école : le modèle ne peut pas écrire l'unité en
 * dur.
 */
function euro(valeur: number): string {
  return Math.abs(valeur) < 2 ? "euro" : "euros";
}

/** Un pourcentage à deux décimales, à la française. */
function pourcentage(part: number, total: number): string {
  return String(Math.round((part / total) * 10000) / 100).replace(".", ",");
}

/** Comment le prix se règle, en une phrase d'acte. */
function modalitesDePaiement(choix: string): string {
  if (choix.startsWith("Échelonné")) {
    return "Le prix est payable selon l'échéancier convenu entre les parties, dont le détail est annexé aux présentes. Le cédant conserve, jusqu'au complet paiement, les recours de droit commun.";
  }
  if (choix.startsWith("Séquestre")) {
    return "Le prix est consigné entre les mains d'un séquestre, qui le libérera au profit du cédant dans les conditions convenues entre les parties.";
  }
  return "Le prix est payable comptant au jour de la signature des présentes, par virement bancaire au profit du cédant. La preuve du règlement résultera de l'avis d'exécution du virement ou de tout autre justificatif bancaire correspondant.";
}
