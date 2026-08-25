import { dateEnFrancais, nombreEnFrancais } from "@/domain/formalite/lettres";
import { formeEnToutesLettres, avecMajusculeInitiale } from "./annonce";
import { agrementDeDroit, cessionsRedigees, type Cession } from "./cession";
import { paritéDeLApport } from "./traite-apport";
import { definitions, type Valeurs } from "./types";
import { planDeCapital } from "./apport";
import {
  adresseLisible,
  adresseSurUneLigne,
  type Assemblee,
  type AssociePresent,
  type ContexteGabarit,
  type SocieteModifiee,
} from "./gabarit";

/**
 * Le procès-verbal d'assemblée, dans le modèle universel du cabinet.
 *
 * Formalist rendait ses procès-verbaux depuis cinq gabarits - un par forme - écrits au
 * fil des besoins. Le cabinet en a fourni un seul, plus rigoureux : identification
 * complète des présents, ordre du jour numéroté, résolutions titrées et sous-titrées,
 * formule d'adoption, signatures avec la qualité de chacun.
 *
 * On ne réécrit pas ce modèle : c'est un livrable, remplaçable par une version corrigée
 * sans toucher au code. Ce module est la couche d'adaptation demandée - une fonction
 * pure qui traduit le contexte Formalist vers ses balises. Le .docx reste intact, et la
 * traduction se teste.
 *
 * Deux principes le gouvernent :
 *
 *   1. L'ordre canonique est celui des blocs du modèle, jamais celui de la saisie. Un
 *      client qui coche « prorogation » puis « transfert de siège » obtient le transfert
 *      en première résolution, comme il se doit.
 *
 *   2. La terminologie découle de la forme sociale, demandée une seule fois. « actions »
 *      ou « parts sociales », « actionnaires » ou « associés », convocation du président
 *      ou de la gérance : rien de tout cela ne se ressaisit.
 */

/* ------------------------------------------------------- La terminologie */

export interface MotsDeLaForme {
  /** « actionnaires » ou « associés ». */
  associesPluriel: string;
  /** « actions » ou « parts sociales ». */
  titres: string;
  /** Qui convoque : « du Président », « de la gérance ». */
  convocationPar: string;
  /** Qui préside la séance. */
  presidentSeance: string;
  /** L'article du code de commerce sur les capitaux propres inférieurs à la moitié. */
  articleCapitauxPropres: string;
  /** Ce qui fonde l'agrément d'un tiers. */
  fondementAgrement: string;
  /** Les titres sont-ils des parts non négociables, au sens de l'article 1832-2 ? */
  partsNonNegociables: boolean;
}

const PAR_ACTIONS = new Set(["SAS", "SASU", "SA", "SASU "]);

export function motsDeLaForme(forme: string | null | undefined): MotsDeLaForme {
  const nette = (forme ?? "").trim().toUpperCase();
  const parActions = PAR_ACTIONS.has(nette);
  const civile = nette === "SCI" || nette === "SC";

  return {
    associesPluriel: parActions ? "actionnaires" : "associés",
    titres: parActions ? "actions" : "parts sociales",
    convocationPar: parActions ? "du Président" : "de la gérance",
    presidentSeance: parActions ? "le Président de la Société" : "le gérant",
    articleCapitauxPropres: parActions ? "L. 225-248" : "L. 223-42",
    fondementAgrement: civile
      ? "1861 du code civil"
      : parActions
        ? "les statuts"
        : "L. 223-14 du code de commerce",
    /*
     * L'article 1832-2 vise les parts non négociables : il ne s'applique pas aux
     * actions, librement négociables, dont l'apport ne requiert pas l'avertissement du
     * conjoint.
     */
    partsNonNegociables: !parActions,
  };
}

/* ------------------------------------------------ Les mises en forme locales */

const ROMAINS = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

const ORDINAUX = [
  "PREMIÈRE",
  "DEUXIÈME",
  "TROISIÈME",
  "QUATRIÈME",
  "CINQUIÈME",
  "SIXIÈME",
  "SEPTIÈME",
  "HUITIÈME",
  "NEUVIÈME",
  "DIXIÈME",
  "ONZIÈME",
  "DOUZIÈME",
  "TREIZIÈME",
  "QUATORZIÈME",
  "QUINZIÈME",
];

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « (i) », « (ii) » : la numérotation des présents dans un acte. */
export function numeroDePresent(rang: number): string {
  return "(" + (ROMAINS[rang] ?? String(rang + 1)) + ")";
}

/** « PREMIÈRE », « DEUXIÈME » : au-delà de quinze, le chiffre reprend ses droits. */
export function ordinalDeResolution(rang: number): string {
  return ORDINAUX[rang] ?? String(rang + 1) + "E";
}

/** « 908 221 138 » : un numéro RCS se lit par groupes de trois. */
export function sirenEspace(siren: string | null | undefined): string {
  const chiffres = (siren ?? "").replace(/\D/g, "");
  if (chiffres.length !== 9) return (siren ?? "").trim();
  return chiffres.slice(0, 3) + " " + chiffres.slice(3, 6) + " " + chiffres.slice(6);
}

/**
 * « 15 000 » : une espace ordinaire, comme dans les autres actes de Formalist.
 *
 * Selon la version d'ICU, toLocaleString rend une espace fine insécable (U+202F) ou une
 * insécable (U+00A0). La première manque dans certaines polices : elle apparaît alors
 * comme un carré au milieu d'un montant, dans un acte déposé au greffe. La typographie
 * française est reposée ensuite, sur le document rendu.
 */
export function montant(valeur: number): string {
  return valeur
    .toLocaleString("fr-FR", { maximumFractionDigits: 2 })
    .replace(/[\u202f\u00a0]/g, " ");
}

/**
 * « le quinze septembre » : le jour d'une assemblée s'écrit en lettres.
 *
 * Le premier du mois fait exception - « le premier septembre » - comme dans tous les
 * actes.
 */
export function jourEnLettres(iso: string | null | undefined): string {
  const date = lire(iso);
  if (!date) return "";

  const jour = date.getUTCDate();
  const enLettres = jour === 1 ? "premier" : nombreEnFrancais(jour);
  return enLettres + " " + MOIS[date.getUTCMonth()];
}

/** « deux mille vingt-six ». */
export function anneeEnLettres(iso: string | null | undefined): string {
  const date = lire(iso);
  return date ? nombreEnFrancais(date.getUTCFullYear()) : "";
}

function lire(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const date = new Date(iso.length <= 10 ? iso + "T00:00:00Z" : iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function texte(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

function nombre(valeurs: Valeurs, cle: string): number {
  const valeur = valeurs[cle];
  if (typeof valeur === "number") return valeur;
  const lu = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

/* -------------------------------------------------------- Les présents */

/**
 * Comment un associé se désigne dans l'acte.
 *
 * Une personne morale s'identifie complètement - forme, capital, siège, immatriculation,
 * représentant - parce que c'est elle qui s'engage. Une personne physique devrait porter
 * son état civil ; Formalist ne le recueille pas pour les associés, seulement pour un
 * dirigeant nommé. On écrit donc ce qu'on a, sans laisser de crochets dans un acte signé.
 */
export function identificationDeLAssocie(associe: AssociePresent): string {
  if (associe.nature === "morale") {
    /*
     * Une société dont la dénomination manque ne s'annonce pas « la société , ».
     *
     * Le formulaire laisse le champ ouvert, et l'acte se lisait alors avec une virgule
     * suspendue au milieu de la feuille de présence. Sans dénomination, on n'ouvre pas
     * la phrase : les autres mentions - forme, capital, siège, numéro - suffisent à
     * identifier l'associé, et le blanc se voit là où il est.
     */
    const denomination = texte(associe.denomination);
    const morceaux = denomination ? ["la société " + denomination] : [];

    const forme = texte(associe.forme);
    const capital = typeof associe.capital === "number" ? associe.capital : null;
    if (forme && capital !== null) {
      morceaux.push(
        formeEnToutesLettres(forme).toLowerCase() + " au capital de " + montant(capital) + " euros"
      );
    } else if (forme) {
      morceaux.push(formeEnToutesLettres(forme).toLowerCase());
    }

    const siege = texte(associe.siege);
    if (siege) morceaux.push("dont le siège social est situé " + adresseLisible(siege));

    const siren = texte(associe.siren);
    if (siren) {
      morceaux.push(
        "immatriculée au registre du commerce et des sociétés sous le numéro " + sirenEspace(siren)
      );
    }

    const representant = texte(associe.representant);
    if (representant) {
      const qualite = texte(associe.qualiteRepresentant);
      morceaux.push(
        "représentée par " +
          representant +
          (qualite ? " en sa qualité de " + qualite.toLowerCase() : "")
      );
    }

    return morceaux.join(", ");
  }

  return [texte(associe.civilite), texte(associe.prenom), texte(associe.nom)]
    .filter(Boolean)
    .join(" ");
}

/** Le nom court d'un associé, pour une signature ou une phrase. */
export function nomDeLAssocie(associe: AssociePresent): string {
  if (associe.nature === "morale") {
    const denomination = texte(associe.denomination);
    const representant = texte(associe.representant);
    if (!denomination) return representant;
    return representant
      ? "la société " + denomination + ", représentée par " + representant
      : "la société " + denomination;
  }
  return [texte(associe.civilite), texte(associe.prenom), texte(associe.nom)]
    .filter(Boolean)
    .join(" ");
}

/* --------------------------------------------- L'ordre canonique des blocs */

/**
 * Les résolutions, dans l'ordre où le modèle les porte.
 *
 * C'est cet ordre qui numérote, et lui seul : la saisie du client n'a pas à décider de
 * la place d'une résolution dans un acte. Les pouvoirs ferment toujours la marche, sans
 * bloc propre - le modèle les écrit en dur.
 */
export const BLOCS_DU_MODELE = [
  "r_transfert_siege",
  "r_denomination",
  "r_objet_social",
  "r_date_cloture",
  "r_dirigeant",
  "r_augmentation_numeraire",
  "r_augmentation_nature",
  "r_incorporation",
  "r_reduction",
  "r_continuation",
  "r_cession",
  "r_prorogation",
  "r_transformation",
  "r_apport_titres",
  "r_augmentation_remuneration",
  "r_dissolution",
  "r_libres",
] as const;

export type BlocDuModele = (typeof BLOCS_DU_MODELE)[number];

/** Ce que chaque bloc annonce à l'ordre du jour. */
const LIBELLES: Record<BlocDuModele, (mots: MotsDeLaForme, contexte: ContexteGabarit) => string> = {
  r_transfert_siege: () => "transfert du siège social",
  r_denomination: () => "changement de dénomination sociale",
  r_objet_social: () => "modification de l'objet social",
  r_date_cloture: () => "modification de la date de clôture de l'exercice social",
  r_dirigeant: () => "changement de dirigeant",
  r_augmentation_numeraire: () => "augmentation du capital social par apport en numéraire",
  r_augmentation_nature: () => "augmentation du capital social par apport en nature",
  r_incorporation: () => "augmentation du capital social par incorporation de réserves",
  r_reduction: (_, contexte) =>
    texte(contexte.valeurs.motifReduction) === "Pertes"
      ? "réduction du capital social motivée par des pertes"
      : "réduction du capital social",
  r_continuation: () =>
    "poursuite de l'activité malgré des capitaux propres inférieurs à la moitié du capital social",
  r_cession: (mots) => "constatation d'une cession " + (mots.titres === "actions" ? "d'actions" : "de parts sociales"),
  r_prorogation: () => "prorogation de la durée de la Société",
  r_transformation: () => "transformation de la Société",
  r_apport_titres: (_, contexte) =>
    "approbation d'un traité d'apport portant sur des titres de la société " +
    texte(contexte.valeurs.apporteeDenomination),
  r_augmentation_remuneration: () =>
    "augmentation du capital social en rémunération de l'apport de titres",
  r_dissolution: () => "dissolution anticipée de la Société et nomination d'un liquidateur",
  r_libres: () => "résolution particulière",
};

/**
 * Quels blocs du modèle une modification allume.
 *
 * Un même code Formalist peut en allumer deux - l'apport de titres s'approuve puis se
 * rémunère - ou l'un des trois selon un mode d'augmentation.
 */
export function blocsActives(codes: string[], valeurs: Valeurs): BlocDuModele[] {
  const actifs = new Set<BlocDuModele>();

  if (codes.includes("transfert_siege")) actifs.add("r_transfert_siege");
  if (codes.includes("denomination")) actifs.add("r_denomination");
  if (codes.includes("objet_social")) actifs.add("r_objet_social");
  if (codes.includes("dirigeant")) actifs.add("r_dirigeant");
  if (codes.includes("reduction_capital")) actifs.add("r_reduction");
  if (codes.includes("cession_parts")) actifs.add("r_cession");
  if (codes.includes("prorogation")) actifs.add("r_prorogation");

  if (codes.includes("augmentation_capital")) {
    const mode = texte(valeurs.modeAugmentation);
    if (mode === "Apport en nature") actifs.add("r_augmentation_nature");
    else if (mode === "Incorporation de réserves") actifs.add("r_incorporation");
    /*
     * La compensation de créances n'a pas de bloc propre : c'est une souscription en
     * numéraire, libérée par compensation avec une créance liquide et exigible. Les
     * modalités de souscription le disent.
     */ else actifs.add("r_augmentation_numeraire");
  }

  if (codes.includes("apport_titres")) {
    actifs.add("r_apport_titres");
    actifs.add("r_augmentation_remuneration");
  }

  return BLOCS_DU_MODELE.filter((bloc) => actifs.has(bloc));
}

/* ------------------------------------------------- Les contrôles de cohérence */

export interface AlerteDuPv {
  bloc: BlocDuModele | "assemblee";
  gravite: "bloquant" | "avertissement";
  message: string;
  /**
   * Le champ du formulaire d'où vient l'incohérence.
   *
   * Le bloc dit dans quelle résolution le document se contredirait ; il ne dit pas où
   * l'on corrige. Sans cet identifiant, le formulaire sait qu'un dossier ne passera
   * pas mais ne peut pas montrer lequel de ses champs le retient - et l'utilisateur
   * relit les vingt-six lignes d'un apport de titres pour en trouver une.
   */
  champ: string;
}

/**
 * Ce qui rendrait l'acte faux, et ce qui mérite un regard.
 *
 * Bloquant : le document sortirait avec une contradiction qu'un greffe relève -
 * un capital qui ne suit pas, une cession de parts à un tiers sans agrément.
 * Avertissement : l'acte est régulier mais une conséquence en découle, et l'oublier
 * coûte cher - le délai d'opposition des créanciers, par exemple.
 */
export function verifierLePvAge(contexte: ContexteGabarit): AlerteDuPv[] {
  const { societe, valeurs, codes } = contexte;
  const mots = motsDeLaForme(societe.forme);
  const alertes: AlerteDuPv[] = [];
  const blocs = blocsActives(codes, valeurs);

  const capitalDepart = typeof societe.capital === "number" ? societe.capital : 0;

  /* La chaîne des capitaux : chaque opération part de ce que la précédente a laissé. */
  if (codes.includes("augmentation_capital")) {
    const avant = nombre(valeurs, "capitalActuelAugm");
    if (avant && Math.abs(avant - capitalDepart) > 0.005) {
      alertes.push({
        bloc: blocs.find((b) => b.startsWith("r_augmentation")) ?? "r_augmentation_numeraire",
        gravite: "bloquant",
        champ: "capitalActuelAugm",
        message:
          "Le capital de départ de l'augmentation (" +
          montant(avant) +
          " euros) ne correspond pas au capital de la société (" +
          montant(capitalDepart) +
          " euros).",
      });
    }

    const apres = nombre(valeurs, "nouveauCapitalAugm");
    const parts = nombre(valeurs, "nbPartsNouvelles");
    const nominale = nombre(valeurs, "valeurNominaleAugm");
    const prime = nombre(valeurs, "primeEmission");

    if (parts && nominale && apres) {
      const attendu = avant + parts * nominale;
      if (Math.abs(attendu - apres) > 0.005) {
        alertes.push({
          bloc: blocs.find((b) => b.startsWith("r_augmentation")) ?? "r_augmentation_numeraire",
          gravite: "bloquant",
          champ: "nouveauCapitalAugm",
          message:
            "Le nouveau capital devrait être de " +
            montant(attendu) +
            " euros : " +
            montant(parts) +
            " titres à " +
            montant(nominale) +
            " euros de nominal. La prime d'émission (" +
            montant(prime) +
            " euros) ne s'ajoute pas au capital.",
        });
      }
    }
  }

  if (codes.includes("reduction_capital")) {
    const avant = nombre(valeurs, "capitalActuelRed");
    const capitalAvantReduction = codes.includes("augmentation_capital")
      ? nombre(valeurs, "nouveauCapitalAugm") || capitalDepart
      : capitalDepart;

    if (avant && Math.abs(avant - capitalAvantReduction) > 0.005) {
      alertes.push({
        bloc: "r_reduction",
        gravite: "bloquant",
        champ: "capitalActuelRed",
        message:
          "Le capital de départ de la réduction (" +
          montant(avant) +
          " euros) ne correspond pas à celui laissé par la résolution précédente (" +
          montant(capitalAvantReduction) +
          " euros).",
      });
    }

    if (texte(valeurs.motifReduction) !== "Pertes") {
      alertes.push({
        bloc: "r_reduction",
        gravite: "avertissement",
        champ: "motifReduction",
        message:
          "La réduction n'est pas motivée par des pertes : les créanciers disposent d'un délai d'opposition, et le dépôt n'a lieu qu'à son terme.",
      });
    }
  }

  /* L'agrément d'un tiers, obligatoire là où les titres ne sont pas librement cessibles. */
  for (const cession of contexte.cessions ?? []) {
    if (cession.vers !== "tiers") continue;
    const regle = agrementDeDroit(societe.forme, cession.vers);
    if (regle.requis && texte(valeurs.agrementRequis) === "Non") {
      alertes.push({
        bloc: "r_cession",
        gravite: "bloquant",
        champ: "agrementRequis",
        message:
          "Une cession à un tiers dans cette forme sociale requiert l'agrément des " +
          mots.associesPluriel +
          " : " +
          regle.motif,
      });
    }
  }

  /* L'article 1832-2 vise les parts non négociables : il n'a pas d'objet sur des actions. */
  if (
    texte(valeurs.apportBienCommun).startsWith("Oui") &&
    !mots.partsNonNegociables &&
    codes.includes("augmentation_capital")
  ) {
    alertes.push({
      bloc: "r_augmentation_nature",
      gravite: "bloquant",
      champ: "apportBienCommun",
      message:
        "L'article 1832-2 du code civil vise les parts non négociables : il ne s'applique pas aux actions, et la mention du conjoint n'a pas lieu d'être ici.",
    });
  }

  /* L'apport de titres et sa rémunération ne vont jamais l'un sans l'autre. */
  const apport = blocs.includes("r_apport_titres");
  const remuneration = blocs.includes("r_augmentation_remuneration");
  if (apport !== remuneration) {
    alertes.push({
      bloc: "r_apport_titres",
      gravite: "bloquant",
      champ: "apportValeur",
      message:
        "Un apport de titres s'approuve et se rémunère dans le même acte : la seconde résolution manque.",
    });
  }

  if ((contexte.assemblee.associes ?? []).length === 0) {
    alertes.push({
      bloc: "assemblee",
      gravite: "bloquant",
      champ: "assemblee-associes",
      message: "Aucun associé n'est inscrit à l'assemblée : le procès-verbal serait sans présents.",
    });
  }

  return alertes;
}

/* ------------------------------------------------------ Le jeu de balises */

/**
 * Les données du modèle, dans ses balises à lui.
 *
 * Chaque bloc porte les siennes - `ord`, `date_effet`, `formule_adoption` - parce que
 * docxtemplater résout d'abord dans la portée du bloc : sans cela, la date d'effet d'un
 * transfert s'appliquerait à une augmentation de capital.
 */
export function donneesDuPvAge(contexte: ContexteGabarit): Record<string, unknown> {
  const { societe, assemblee, codes, valeurs } = contexte;
  const mots = motsDeLaForme(societe.forme);
  const blocs = blocsActives(codes, valeurs);

  const associes = assemblee.associes ?? [];
  const totalParts = associes.reduce((total, a) => total + (a.parts ?? 0), 0);
  const capitalDepart = typeof societe.capital === "number" ? societe.capital : 0;

  const siege = adresseSurUneLigne(societe.adresse, societe.codePostal, societe.ville);
  const nouveauSiege = adresseSurUneLigne(
    texte(valeurs.nouvelleAdresse),
    texte(valeurs.nouveauCodePostal),
    texte(valeurs.nouvelleVille)
  );

  const formuleAdoption = "adoptée à l'unanimité des " + mots.associesPluriel;
  const cessions = cessionsRedigees(associes, contexte.cessions ?? []);

  /*
   * Les ordinaux se calculent sur la liste des blocs allumés, dans l'ordre du modèle.
   * Les pouvoirs ferment la marche : ils ne portent pas de bloc, mais comptent.
   */
  const ordinalDe = (bloc: BlocDuModele) => ordinalDeResolution(blocs.indexOf(bloc));

  const commun = (bloc: BlocDuModele, dateEffet: string) => ({
    ord: ordinalDe(bloc),
    date_effet: dateEffet,
    formule_adoption: formuleAdoption,
    titres: mots.titres,
    associes_pluriel: mots.associesPluriel,
  });

  const donnees: Record<string, unknown> = {
    /* --------------------------------------------------------- L'en-tête */
    denomination: texte(societe.denomination),
    forme_sociale: avecMajusculeInitiale(formeEnToutesLettres(societe.forme).toLowerCase()),
    capital_actuel: montant(capitalDepart),
    siege_social: siege,
    rcs_numero: sirenEspace(societe.siren),
    rcs_ville: texte(societe.villeRcs) || avecMajusculeInitiale(texte(societe.ville).toLowerCase()),

    /* ------------------------------------------------------- L'ouverture */
    date_assemblee: dateEnFrancais(assemblee.date),
    annee_lettres: anneeEnLettres(assemblee.date),
    jour_lettres: jourEnLettres(assemblee.date),
    associes_pluriel: mots.associesPluriel,
    titres: mots.titres,
    lieu_reunion: "au siège social",
    convocation_par: mots.convocationPar,
    president_seance: mots.presidentSeance,
    formule_adoption: formuleAdoption,
    lieu_signature: avecMajusculeInitiale(texte(societe.ville).toLowerCase()),

    /* -------------------------------------------------------- Les présents */
    participants: associes.map((associe, rang) => ({
      numero: numeroDePresent(rang),
      identification: identificationDeLAssocie(associe),
      nb_titres: montant(associe.parts ?? 0),
      titres: mots.titres,
    })),
    nb_participants_lettres: nombreEnFrancais(associes.length),
    titres_representes: montant(totalParts),
    total_titres: montant(
      typeof assemblee.totalParts === "number" && assemblee.totalParts > 0
        ? assemblee.totalParts
        : totalParts
    ),
    /*
     * Formalist ne saisit que les présents : une assemblée dont il manque des associés
     * ne se déclare pas ici. La feuille de présence dit donc la totalité.
     */
    totalite_presente: true,
    tiers_presents: false,
    liste_tiers: "",

    /* ----------------------------------------------------- L'ordre du jour */
    /*
     * L'ordre du jour se ponctue comme une énumération : point-virgule à chaque point,
     * point final au dernier. Le modèle n'écrit que le numéro et la tabulation.
     */
    ordre_du_jour: [
      ...blocs.map((bloc) => LIBELLES[bloc](mots, contexte)),
      "pouvoirs en vue de l'accomplissement des formalités légales de publicité et de dépôt",
    ].map((libelle, rang, tous) => ({
      num: rang + 1,
      libelle: libelle + (rang === tous.length - 1 ? "." : " ;"),
    })),

    /* ------------------------------------------------------ Les signatures */
    signataires: associes.map((associe) => ({
      /* En tête de ligne de signature : « La société X », non « la société X ». */
      nom_signataire: avecMajusculeInitiale(nomDeLAssocie(associe)),
      qualite_signataire: avecMajusculeInitiale(
        mots.associesPluriel === "actionnaires" ? "actionnaire" : "associé"
      ),
    })),
  };

  /* Les pouvoirs ferment la marche : le modèle les écrit en dur, avec leur ordinal. */
  donnees.ord = ordinalDeResolution(blocs.length);

  /* --------------------------------------------------- Les résolutions */

  if (blocs.includes("r_transfert_siege")) {
    donnees.r_transfert_siege = {
      ...commun("r_transfert_siege", dateEnFrancais(texte(valeurs.dateEffetTransfert))),
      siege_actuel: siege,
      nouveau_siege: nouveauSiege,
    };
  }

  if (blocs.includes("r_denomination")) {
    donnees.r_denomination = {
      ...commun("r_denomination", dateEnFrancais(texte(valeurs.dateEffetDenomination))),
      ancienne_denomination: texte(societe.denomination),
      nouvelle_denomination: texte(valeurs.nouvelleDenomination),
    };
  }

  if (blocs.includes("r_objet_social")) {
    donnees.r_objet_social = {
      ...commun("r_objet_social", dateEnFrancais(texte(valeurs.dateEffetObjet))),
      nouvel_objet: texte(valeurs.nouvelObjetSocial).replace(/\.$/, ""),
    };
  }

  if (blocs.includes("r_dirigeant")) {
    const changement = texte(valeurs.typeChangementDirigeant);
    const sortie = changement === "Révocation" || changement === "Démission";

    donnees.r_dirigeant = {
      ...commun("r_dirigeant", dateEnFrancais(texte(valeurs.dateEffetDirigeant))),
      fin_mandat: sortie
        ? {
            modalite_fin_mandat: changement === "Révocation" ? "décide de révoquer" : "prend acte de la démission",
            identification_dirigeant_sortant:
              texte(valeurs.dirigeantRevoqueNom) || texte(valeurs.dirigeantDemissionnaireNom),
            fonction_sortant: texte(valeurs.fonctionDirigeant).toLowerCase(),
            date_fin_mandat: dateEnFrancais(texte(valeurs.dateEffetDirigeant)),
          }
        : false,
      fonction: texte(valeurs.fonctionDirigeant).toLowerCase(),
      duree_mandat: "indéterminée",
      civilite: texte(valeurs.nouveauDirigeantCivilite),
      prenom: texte(valeurs.nouveauDirigeantPrenom),
      nom: texte(valeurs.nouveauDirigeantNom),
      date_naissance: dateEnFrancais(texte(valeurs.nouveauDirigeantDateNaissance)),
      lieu_naissance: texte(valeurs.nouveauDirigeantLieuNaissance),
      nationalite: texte(valeurs.nouveauDirigeantNationalite).toLowerCase(),
      domicile: adresseLisible(texte(valeurs.nouveauDirigeantAdresse)),
      remunere: texte(valeurs.remunerationDirigeant) !== "Non rémunéré",
    };
  }

  /* Les trois augmentations partagent leur arithmétique : une seule est allumée. */
  const augmentation = blocs.find((bloc) => bloc.startsWith("r_augmentation") && bloc !== "r_augmentation_remuneration");
  if (augmentation) {
    const avant = nombre(valeurs, "capitalActuelAugm") || capitalDepart;
    const apres = nombre(valeurs, "nouveauCapitalAugm");
    const parts = nombre(valeurs, "nbPartsNouvelles");
    const nominale = nombre(valeurs, "valeurNominaleAugm");
    const prime = nombre(valeurs, "primeEmission");
    const mode = texte(valeurs.modeAugmentation);

    const chiffres = {
      ...commun(augmentation, dateEnFrancais(texte(valeurs.dateEffetAugm))),
      montant_augmentation: montant(Math.max(0, apres - avant)),
      capital_avant: montant(avant),
      capital_apres: montant(apres),
      nb_titres_nouveaux: montant(parts),
      valeur_nominale: montant(nominale),
      mention_prime: prime > 0 ? "assorties d'une prime d'émission de " + montant(prime) + " euros" : "sans prime d'émission",
    };

    if (augmentation === "r_augmentation_numeraire") {
      const compensation = mode === "Compensation de créances";
      donnees.r_augmentation_numeraire = {
        ...chiffres,
        modalites_souscription: compensation
          ? "par compensation avec la créance liquide et exigible de " +
            texte(valeurs.titulaireCreance) +
            " sur la Société, d'un montant de " +
            montant(nombre(valeurs, "montantCreance")) +
            " euros, dont l'arrêté de compte a été établi le " +
            dateEnFrancais(texte(valeurs.dateArreteCompte))
          : "par versement en espèces, les titres étant libérés en totalité à la souscription",
        mention_dps: false,
        texte_dps: "",
        justification_liberation: compensation
          ? "par la production de l'arrêté de compte certifié"
          : "par la production du certificat du dépositaire établi par " +
            texte(valeurs.banqueDepot) +
            " le " +
            dateEnFrancais(texte(valeurs.dateDepotFonds)),
      };
    }

    if (augmentation === "r_augmentation_nature") {
      const bienCommun =
        texte(valeurs.apportBienCommun).startsWith("Oui") && mots.partsNonNegociables;

      donnees.r_augmentation_nature = {
        ...chiffres,
        description_apport: texte(valeurs.descriptionApport).replace(/\.$/, ""),
        valeur_apport: montant(nombre(valeurs, "valeurApport")),
        identification_apporteur: nomDeLAssocie(associes[0] ?? {}),
        commissaire: texte(valeurs.dispenseCommissaire) !== "Oui, à l'unanimité",
        commissaire_apports: texte(valeurs.commissaireApports),
        bien_commun: bienCommun,
        identification_conjoint: texte(valeurs.conjointNomComplet),
        revendication: texte(valeurs.conjointRevendication).startsWith("Oui"),
        civilite_conjoint: texte(valeurs.conjointNomComplet).split(" ")[0] ?? "",
        nom_conjoint: texte(valeurs.conjointNomComplet).split(" ").slice(1).join(" "),
      };
    }

    if (augmentation === "r_incorporation") {
      donnees.r_incorporation = {
        ...chiffres,
        poste_incorpore: texte(valeurs.posteIncorpore).toLowerCase(),
        modalite_incorporation:
          "par incorporation directe au capital d'une somme de " +
          montant(nombre(valeurs, "montantIncorpore")) +
          " euros prélevée sur le poste « " +
          texte(valeurs.posteIncorpore) +
          " », par élévation de la valeur nominale des " +
          mots.titres +
          " existantes",
      };
    }
  }

  if (blocs.includes("r_reduction")) {
    const avant = nombre(valeurs, "capitalActuelRed") || capitalDepart;
    const apres = nombre(valeurs, "nouveauCapitalRed");
    const pertes = texte(valeurs.motifReduction) === "Pertes";

    donnees.r_reduction = {
      ...commun("r_reduction", dateEnFrancais(texte(valeurs.dateEffetRed))),
      montant_reduction: montant(Math.max(0, avant - apres)),
      capital_avant: montant(avant),
      capital_apres: montant(apres),
      motif_reduction: pertes ? "motivée par des pertes" : "non motivée par des pertes",
      modalite_reduction:
        "l'annulation de " + montant(nombre(valeurs, "nbPartsAnnulees")) + " " + mots.titres,
      opposition_creanciers: !pertes,
    };
  }

  if (blocs.includes("r_cession")) {
    const cession = cessions[0];
    const regle = agrementDeDroit(societe.forme, "tiers");
    const agrement = regle.requis || texte(valeurs.agrementRequis) === "Oui";

    donnees.r_cession = {
      ...commun("r_cession", dateEnFrancais(cession?.DATE ?? "")),
      agrement,
      identification_cedant: cession?.CEDANT ?? "",
      nb_titres_cedes: montant(cession?.PARTS ?? 0),
      identification_cessionnaire: cession?.CESSIONNAIRE ?? "",
      prix_cession: montant(cession?.PRIX ?? 0),
      fondement_agrement: mots.fondementAgrement,
      /*
       * Le modèle écrit « en sa qualité {qualite_nouvel_associe} » : la préposition
       * appartient à la valeur. Sans elle, l'acte agréait « le cessionnaire en qualité
       * nouvel associé ».
       */
      qualite_nouvel_associe:
        mots.associesPluriel === "actionnaires" ? "de nouvel actionnaire" : "de nouvel associé",
    };
  }

  if (blocs.includes("r_prorogation")) {
    donnees.r_prorogation = {
      ...commun("r_prorogation", ""),
      duree_actuelle: montant(nombre(valeurs, "dureeActuelle")),
      date_expiration: dateEnFrancais(texte(valeurs.dateExpirationActuelle)),
      nouvelle_duree: montant(nombre(valeurs, "nouvelleDuree")),
    };
  }

  if (blocs.includes("r_apport_titres")) {
    const valeurApport = nombre(valeurs, "apportValeur");
    const numeraire = nombre(valeurs, "apportNumeraire");
    const nominale = nombre(valeurs, "apportNominaleBeneficiaire");
    const titresApportes = nombre(valeurs, "apportNbTitres");
    const titresCible = nombre(valeurs, "apporteeNbTitres");

    /*
     * Les chiffres du procès-verbal sont ceux du traité, et pour cause.
     *
     * Le traité est le contrat, le procès-verbal la décision qui l'approuve : si les
     * deux annoncent un capital différent, l'un des deux est faux et le greffe n'a
     * aucun moyen de savoir lequel. La parité et la prime se calculent donc une fois,
     * dans la couche du traité, et les deux actes la lisent.
     */
    const parite = paritéDeLApport(valeurs);
    const plan = planDeCapital({
      capitalActuelCentimes: Math.round(capitalDepart * 100),
      numeraireCentimes: Math.round(numeraire * 100),
      valeurApportCentimes: Math.round(valeurApport * 100),
      primeCentimes: Math.round(parite.prime * 100),
    });

    donnees.r_apport_titres = {
      ...commun("r_apport_titres", dateEnFrancais(texte(valeurs.apportDateEffet))),
      date_traite: dateEnFrancais(texte(valeurs.apportDateSignature)),
      identification_apporteur: texte(valeurs.apporteurNomComplet),
      nb_titres_apportes: montant(titresApportes),
      nature_titres_apportes:
        motsDeLaForme(texte(valeurs.apporteeForme)).titres === "actions" ? "actions" : "parts sociales",
      societe_cible: texte(valeurs.apporteeDenomination),
      pourcentage_capital: titresCible ? montant(Math.round((titresApportes / titresCible) * 100)) : "",
      valeur_titres: montant(valeurApport),
      commissaire_apports: texte(valeurs.apportCommissaireNom),
      regime_150_0_b_ter: texte(valeurs.apportControle) === "Oui",
    };

    donnees.r_augmentation_remuneration = {
      ...commun("r_augmentation_remuneration", dateEnFrancais(texte(valeurs.apportDateEffet))),
      /* Ce qui monte au capital, non ce qui est apporté : la prime va en réserve. */
      montant_augmentation: montant(parite.nominal),
      /*
       * La résolution nomme la société apportée elle aussi : sans elle, l'acte
       * rémunérait « l'apport des titres de la société , ».
       */
      societe_cible: texte(valeurs.apporteeDenomination),
      nb_titres_nouveaux: montant(Math.round(parite.actions)),
      /*
       * La prime, quand il y en a une.
       *
       * Une résolution qui la tait laisse au greffe un écart inexpliqué entre la
       * valeur de l'apport et l'augmentation décidée.
       */
      mention_prime_pv:
        parite.prime > 0
          ? "assorties d'une prime d'apport globale de " + montant(parite.prime) + " euros, "
          : "",
      valeur_nominale: montant(nominale),
      identification_apporteur_court: texte(valeurs.apporteurNomComplet),
      capital_avant: montant(plan.capitalApresNumeraireCentimes / 100),
      capital_apres: montant(plan.capitalFinalCentimes / 100),
    };
  }

  /* Les blocs que Formalist ne propose pas restent éteints, sans paragraphe résiduel. */
  for (const bloc of BLOCS_DU_MODELE) {
    if (!(bloc in donnees)) donnees[bloc] = false;
  }

  return donnees;
}

/** Les définitions choisies, pour qui veut afficher l'ordre du jour hors du document. */
export function ordreDuJour(contexte: ContexteGabarit): string[] {
  const mots = motsDeLaForme(contexte.societe.forme);
  return blocsActives(contexte.codes, contexte.valeurs).map((bloc) => LIBELLES[bloc](mots, contexte));
}

/** Le libellé des types choisis, tel que Formalist les nomme ailleurs. */
export function typesChoisis(codes: string[]): string[] {
  return definitions(codes).map((d) => d.libelle);
}

export type { SocieteModifiee, Assemblee, AssociePresent, Cession };

/**
 * Les incohérences du procès-verbal, au format du formulaire.
 *
 * Les contrôles ci-dessus tournaient à la production des actes - c'est-à-dire après
 * le règlement. Un dossier qui les heurtait passait la saisie, passait le paiement,
 * puis échouait à la génération : le client avait payé et n'avait rien, l'avocat
 * recevait un dossier sans pièces. Ils se lisent donc aussi dans le formulaire, où
 * l'on corrige encore sans avoir rien engagé.
 *
 * Seuls les bloquants sont rendus : un avertissement n'empêche pas de continuer, et
 * l'afficher comme une anomalie en ferait un obstacle.
 */
export function anomaliesDuPvAge(contexte: ContexteGabarit): { champ: string; message: string }[] {
  return verifierLePvAge(contexte)
    .filter((alerte) => alerte.gravite === "bloquant")
    .map((alerte) => ({ champ: alerte.champ, message: alerte.message }));
}
