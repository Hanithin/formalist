import { dateEnFrancais, nombreEnFrancais } from "./lettres";
import { apportsDe, valeurNominale } from "./capital";
import { estUnipersonnelle, regle } from "./formes";
import type { PersonneMorale, PersonnePhysique } from "./etat-civil";
import type { Associe, Brouillon, Dirigeant } from "./parcours";

/**
 * Les champs attendus par les gabarits Word.
 *
 * Ces noms figurent dans les vingt-trois fichiers .docx de création : ce sont eux
 * qui font foi, et ils ne se devinent pas. Ce module est écrit à partir de leur
 * inventaire - 319 champs et 83 sections conditionnelles - et non à partir du
 * JavaScript qui les remplissait.
 *
 * Une première version tirée de form-data.js avait manqué la moitié des noms :
 * l'ancien code les écrivait tantôt en propriétés d'objet non quotées, tantôt en
 * affectations indexées, et l'extraction n'avait vu que les secondes. Conséquence
 * mesurée sur cinq actes produits : le nom de la société, son adresse et sa forme
 * n'apparaissaient nulle part - les gabarits attendent NOM_SOCIETE et ADRESSE_SIEGE
 * là où nous écrivions SOCIETE_NOM et SOCIETE_ADRESSE.
 *
 * Quatre conventions viennent de l'original et sont conservées :
 *
 *   - un champ vide s'écrit « - » et non "" : dans un acte, un blanc se lit comme
 *     un oubli, un tiret comme une absence assumée ;
 *   - les nationalités manquantes valent « Française », la situation matrimoniale
 *     « célibataire », en minuscules parce qu'elles tombent au milieu d'une phrase ;
 *   - les personnes sont numérotées de 1 à 10, avec HAS_ASSOC_n pour que le gabarit
 *     sache où s'arrêter. Au-delà de dix associés, les statuts passent par un avocat ;
 *   - la rémunération n'est pas un mot mais une phrase entière, dont le décideur
 *     dépend de la forme : l'assemblée des associés, l'assemblée générale, ou
 *     l'actionnaire unique.
 */

const MAXIMUM_ASSOCIES = 10;
const MAXIMUM_DIRIGEANTS = 3;
const TIRET = "-";

/**
 * Les montants s'écrivent à la française : « 1 500 » et non « 1500 ».
 *
 * Le séparateur est ramené à une espace ordinaire : selon la version d'ICU,
 * toLocaleString rend une espace fine insécable (U+202F) ou une insécable
 * (U+00A0), et la première manque dans certaines polices - elle apparaît alors
 * comme un carré au milieu d'un montant, dans un acte déposé au greffe.
 */
function montant(valeur: number): string {
  return valeur
    .toLocaleString("fr-FR", { maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");
}

function ou(valeur: string | undefined | null, defaut = TIRET): string {
  return valeur?.trim() ? valeur.trim() : defaut;
}

/** « Monsieur Jean DUPONT » : la civilité fait partie du nom dans un acte. */
function civiliteNomPrenom(personne: PersonnePhysique): string {
  const morceaux = [personne.civilite, personne.prenom, personne.nom].filter((m) => m?.trim());
  return morceaux.length ? morceaux.join(" ") : TIRET;
}

/**
 * Le nom de jeune fille, déduit du nom de la mère.
 *
 * Le formulaire ne le demande pas : il le tire du champ « Nom et prénom de la
 * mère », en prenant le dernier mot écrit en capitales - c'est ainsi que l'état
 * civil s'écrit. À défaut, le dernier mot passe en capitales.
 */
export function nomDeJeuneFille(nomDeLaMere: string | undefined): string {
  const propre = nomDeLaMere?.trim();
  if (!propre) return TIRET;

  const mots = propre.split(/\s+/);
  for (let i = mots.length - 1; i >= 0; i--) {
    if (mots[i].length > 1 && mots[i] === mots[i].toUpperCase()) return mots[i];
  }
  return mots[mots.length - 1].toUpperCase();
}

/** La personne physique derrière un associé, ou un objet vide pour une société. */
function physique(associe: Associe | undefined): PersonnePhysique {
  return associe?.personne ?? {};
}

/** L'état civil d'un dirigeant : le sien, ou celui de l'associé qu'il reprend. */
export function personneDuDirigeant(
  dirigeant: Dirigeant | undefined,
  associes: Associe[]
): PersonnePhysique {
  if (!dirigeant) return {};
  if (dirigeant.associe !== undefined) return physique(associes[dirigeant.associe]);
  return dirigeant.personne ?? {};
}

/**
 * Qui décide de la rémunération du dirigeant.
 *
 * Le mot entre dans la phrase des statuts : « fixé par décision de … ». Une SCI et
 * une SARL réunissent leurs associés, une SAS son assemblée générale, une société
 * à associé unique n'a que lui.
 */
export function decideurDeLaRemuneration(forme: string | null | undefined): string {
  const code = (forme ?? "").toUpperCase();
  if (code === "SCI" || code === "SARL") return "l’assemblée des associés";
  if (code === "SAS") return "l’assemblée générale";
  return "l’actionnaire unique";
}

type Fonction = "présidence" | "gérance" | "direction générale" | "co-gérance";

/** La phrase de rémunération, telle qu'elle s'écrit dans les statuts. */
export function phraseRemuneration(
  fonction: Fonction,
  choix: string | undefined,
  qui: string
): string {
  if (choix === "Fixe") {
    return (
      "La " +
      fonction +
      " exercera ses fonctions à titre de rémunération fixe dont le montant sera fixé par décision de " +
      qui +
      "."
    );
  }
  if (choix === "Variable") {
    return (
      "La " +
      fonction +
      " exercera ses fonctions à titre de rémunération variable dont les modalités seront fixées par décision de " +
      qui +
      "."
    );
  }
  return "La rémunération de la " + fonction + " sera déterminée ultérieurement.";
}

/**
 * « de dix euros », « d'un euro ».
 *
 * Les gabarits écrivaient « d’{{VALEUR_NOMINALE_LETTRES}} euro » : l'élision et le
 * singulier y étaient figés, ce qui donnait « actions d’dix euro » dès que la valeur
 * nominale dépassait un euro. L'élision et l'accord sont des règles de langue : ils
 * se décident ici, où ils se testent, et non dans un document Word.
 *
 * L'élision ne vaut que devant « un » : les autres nombres commencent par une
 * consonne, et « onze » comme « huit » la refusent - « de onze euros ».
 */
function phraseNominale(valeur: number): string {
  const lettres = nombreEnFrancais(valeur);
  const elide = /^une?\b/.test(lettres);
  return (elide ? "d\u2019" : "de ") + lettres + " " + uniteNominale(valeur);
}

/** « euros », ou « centimes » quand une part vaut moins d'un euro. */
function uniteNominale(valeur: number): string {
  if (valeur < 1) {
    const centimes = Math.round(valeur * 100);
    return "centime" + (centimes > 1 ? "s" : "");
  }
  return "euro" + (valeur > 1 ? "s" : "");
}

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

/** « 31 décembre » : la clôture d'exercice s'écrit sans année, elle revient chaque an. */
function jourEtMois(iso: string | undefined): string {
  if (!iso?.includes("-")) return TIRET;
  const [, mois, jour] = iso.split("-");
  const rang = parseInt(mois, 10);
  if (!MOIS[rang - 1]) return TIRET;
  return parseInt(jour, 10) + " " + MOIS[rang - 1];
}

function dateCourte(quand: Date): string {
  return (
    String(quand.getDate()).padStart(2, "0") +
    "/" +
    String(quand.getMonth() + 1).padStart(2, "0") +
    "/" +
    quand.getFullYear()
  );
}

type Donnees = Record<string, unknown>;

/** L'état civil d'une personne, sous les préfixes attendus par un gabarit. */
function etatCivilSous(prefixe: string, personne: PersonnePhysique, donnees: Donnees) {
  donnees[prefixe + "CIVILITE"] = ou(personne.civilite);
  donnees[prefixe + "PRENOM"] = ou(personne.prenom);
  // Le nom de famille s'écrit en capitales dans les actes.
  donnees[prefixe + "NOM"] = personne.nom?.trim() ? personne.nom.trim().toUpperCase() : TIRET;
  donnees[prefixe + "CIVILITE_NOM_PRENOM"] = civiliteNomPrenom(personne);
  donnees[prefixe + "ADRESSE"] = ou(personne.adresse);
  donnees[prefixe + "DATE_NAISSANCE"] = dateEnFrancais(personne.dateDeNaissance);
  donnees[prefixe + "LIEU_NAISSANCE"] = ou(personne.villeDeNaissance);
  donnees[prefixe + "CP_NAISSANCE"] = ou(personne.codePostalDeNaissance);
  donnees[prefixe + "PAYS_NAISSANCE"] = ou(personne.paysDeNaissance, "France");
  donnees[prefixe + "NATIONALITE"] = ou(personne.nationalite, "Française");
  donnees[prefixe + "SITUATION_MATRIMONIALE"] = ou(
    personne.situationMatrimoniale?.toLowerCase(),
    "célibataire"
  );
  donnees[prefixe + "NOM_PERE"] = ou(personne.nomDuPere);
  donnees[prefixe + "NOM_MERE"] = ou(personne.nomDeLaMere);
  donnees[prefixe + "NOM_JEUNE_FILLE"] = nomDeJeuneFille(
    personne.nomDeNaissance ?? personne.nomDeLaMere
  );
}

/** La fiche d'une société associée, sous les préfixes du gabarit. */
function societeSous(prefixe: string, societe: PersonneMorale, donnees: Donnees) {
  donnees[prefixe + "SOCIETE_NOM"] = ou(societe.denomination);
  donnees[prefixe + "SOCIETE_FORME"] = ou(societe.forme);
  donnees[prefixe + "SOCIETE_TYPE"] = ou(societe.forme);
  donnees[prefixe + "SOCIETE_CAPITAL"] =
    societe.capital !== undefined ? montant(societe.capital) : TIRET;
  donnees[prefixe + "SOCIETE_ADRESSE"] = ou(societe.adresse);
  donnees[prefixe + "SOCIETE_RCS"] = ou(societe.numeroRcs);
  donnees[prefixe + "SOCIETE_RCS_VILLE"] = ou(societe.villeImmatriculation);
  donnees[prefixe + "SOCIETE_VILLE_RCS"] = ou(societe.villeImmatriculation);
  donnees[prefixe + "SOCIETE_SIREN"] = ou(societe.siret);
  donnees[prefixe + "SOCIETE_REP"] = societe.representant
    ? civiliteNomPrenom(societe.representant as PersonnePhysique)
    : TIRET;
  donnees[prefixe + "REP_CIVILITE"] = ou(societe.representant?.civilite);
  donnees[prefixe + "REP_PRENOM"] = ou(societe.representant?.prenom);
  donnees[prefixe + "REP_NOM"] = ou(societe.representant?.nom);
}

export interface ContexteGabarit {
  /**
   * La date de signature portée sur les actes.
   *
   * C'est un paramètre et non un appel à l'horloge : un acte doit pouvoir se
   * reproduire à l'identique, et un test doit pouvoir en fixer la date.
   */
  maintenant?: Date;
  /**
   * La ville du RCS, résolue depuis le code postal du siège.
   *
   * Le tribunal de commerce compétent est celui du département, avec des
   * exceptions : la table vit dans l'infrastructure, qui la passe ici. À défaut,
   * la commune du siège est utilisée.
   */
  villeRcs?: string;
}

/** Le jeu de champs complet, pour docxtemplater. */
export function donneesDeGabarit(brouillon: Brouillon, contexte: ContexteGabarit = {}): Donnees {
  const maintenant = contexte.maintenant ?? new Date();
  const associes = (brouillon.associes ?? []).slice(0, MAXIMUM_ASSOCIES);
  const dirigeants = (brouillon.dirigeants ?? []).slice(0, MAXIMUM_DIRIGEANTS + 1);
  const tous = brouillon.associes ?? [];

  const nominale = valeurNominale(brouillon);
  const partsTotales = brouillon.partsTotales ?? 0;
  const capital = brouillon.capital ?? 0;

  const forme = (brouillon.forme ?? "").toUpperCase();
  const regleForme = regle(brouillon.forme);
  const unique = estUnipersonnelle(brouillon.forme, associes.length);

  const premier = associes[0];
  const a1 = physique(premier);
  const dirigeant = personneDuDirigeant(dirigeants[0], tous);
  const conjoint = a1.conjoint;

  // L'objet social est découpé ligne par ligne : les statuts en réservent six.
  const lignesObjet = (brouillon.activite ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  /**
   * L'adresse du siège s'écrit en entier dans les actes.
   *
   * Le formulaire la saisit en trois champs - voie, code postal, commune - mais un
   * acte qui dirait « Le siège social est fixé : 12 rue des Lilas » sans la ville
   * serait rejeté. L'original les recomposait de la même façon.
   */
  const adresseComplete = [
    brouillon.adresse?.trim(),
    [brouillon.codePostal?.trim(), brouillon.ville?.trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  const qui = decideurDeLaRemuneration(brouillon.forme);
  const remuneration = dirigeants[0]?.remuneration;

  const donnees: Donnees = {
    /* ---------- La société ---------- */
    NOM_SOCIETE: ou(brouillon.denomination),
    NOM_SOCIETE_COMPLET: ou(brouillon.denomination),
    SOCIETE: ou(brouillon.denomination),
    FORME_JURIDIQUE: forme || "SAS",
    FORME_LABEL: regleForme?.libelle ?? (forme || TIRET),
    ADRESSE_SIEGE: ou(adresseComplete),
    SIEGE_SOCIAL: ou(adresseComplete),
    VILLE_SOCIETE: ou(brouillon.ville),
    VILLE_SIGNATURE: ou(brouillon.ville),
    RCS_VILLE: ou(contexte.villeRcs ?? brouillon.ville),
    // Le gabarit d'attestation de domicile suppose le siège occupé en propre.
    STATUT_OCCUPATION: "propriétaire",
    MODE_DOMICILIATION: brouillon.modeDomiciliation ?? "",
    // Le domiciliataire, quand il y en a un : sa dénomination et son immatriculation
    // sont déclarées au registre, son agrément est la mention qui rend le contrat
    // recevable.
    EST_DOMICILIE: brouillon.modeDomiciliation === "Société de domiciliation",
    NOM_DOMICILIATAIRE: ou(brouillon.domiciliataire?.denomination),
    SIREN_DOMICILIATAIRE: ou(brouillon.domiciliataire?.siren),
    AGREMENT_DOMICILIATAIRE: ou(brouillon.domiciliataire?.agrement),
    DUREE: String(brouillon.dureeDeVie ?? 99),
    OPTION_FISCALE: brouillon.optionFiscale ?? "",
    OPTION_IS: brouillon.optionFiscale === "IS",
    REGIME_TVA: brouillon.regimeTva ?? "",

    /* ---------- Les dates ---------- */
    DATE_DEBUT_ACTIVITE: dateEnFrancais(brouillon.dateDebutActivite),
    DATE_DEBUT_EXERCICE: dateEnFrancais(brouillon.dateDebutActivite),
    // La clôture s'écrit « 31 décembre » : elle revient chaque année.
    DATE_CLOTURE: jourEtMois(brouillon.dateCloturePremierExercice),
    DATE_CLOTURE_PREMIER_EXERCICE: dateEnFrancais(brouillon.dateCloturePremierExercice),
    ANNEE_PREMIER_EXERCICE: brouillon.dateCloturePremierExercice?.split("-")[0] ?? TIRET,
    DATE_SIGNATURE:
      maintenant.getDate() + " " + MOIS[maintenant.getMonth()] + " " + maintenant.getFullYear(),
    DATE_SIGNATURE_COURTE: dateCourte(maintenant),

    /* ---------- L'objet social, six lignes au plus ---------- */
    OBJET_SOCIAL: ou(brouillon.activite),
    OBJET_SOCIAL_1: lignesObjet[0] ?? ou(brouillon.activite),
    OBJET_SOCIAL_2: lignesObjet[1] ?? "",
    OBJET_SOCIAL_3: lignesObjet[2] ?? "",
    OBJET_SOCIAL_4: lignesObjet[3] ?? "",
    OBJET_SOCIAL_5: lignesObjet[4] ?? "",
    OBJET_SOCIAL_6: lignesObjet[5] ?? "",

    /* ---------- Le capital ---------- */
    CAPITAL: montant(capital),
    CAPITAL_CHIFFRES: montant(capital),
    CAPITAL_FORMATE: montant(capital),
    CAPITAL_LETTRES: nombreEnFrancais(capital),
    MONTANT: montant(capital),
    NB_PARTS: partsTotales ? montant(partsTotales) : TIRET,
    NB_PARTS_LETTRES: nombreEnFrancais(partsTotales),
    NOMBRE_ACTIONS: partsTotales ? montant(partsTotales) : TIRET,
    NOMBRE_ACTIONS_LETTRES: nombreEnFrancais(partsTotales),
    TOTAL_PARTS: partsTotales ? montant(partsTotales) : TIRET,
    VALEUR_NOMINALE: montant(nominale),
    VALEUR_NOMINALE_CHIFFRES: montant(nominale),
    VALEUR_NOMINALE_LETTRES: nombreEnFrancais(nominale),
    VALEUR_NOMINALE_UNITE: uniteNominale(nominale),
    VALEUR_NOMINALE_PHRASE: phraseNominale(nominale),

    /* ---------- La forme, en conditions ---------- */
    IS_UNIPERSONNELLE: unique,
    IS_PLURIPERSONNELLE: !unique,

    /* ---------- La banque du dépôt ---------- */
    NOM_BANQUE: ou(brouillon.banque === "Autre" ? brouillon.banqueAutre?.nom : brouillon.banque),
    ADRESSE_BANQUE: ou(
      [
        brouillon.banqueAutre?.adresse,
        [brouillon.banqueAutre?.codePostal, brouillon.banqueAutre?.ville]
          .filter((m) => m?.trim())
          .join(" "),
      ]
        .filter((m) => m?.trim())
        .join(", ")
    ),
    BANQUE_QONTO: brouillon.banque === "Qonto",
    BANQUE_SHINE: brouillon.banque === "Shine",
    BANQUE_REVOLUT: brouillon.banque === "Revolut Business",
    BANQUE_AUTRE: brouillon.banque === "Autre",

    /* ---------- Le dirigeant ---------- */
    PRESIDENT_NOM: civiliteNomPrenom(dirigeant),
    GERANT_NOM: civiliteNomPrenom(dirigeant),
    ADRESSE_DIRIGEANT: ou(dirigeant.adresse),
    FONCTION_DIRIGEANT: regleForme?.titreDirigeant ?? "Président",
    REMUNERATION_PRESIDENT: phraseRemuneration("présidence", remuneration, qui),
    REMUNERATION_GERANT: phraseRemuneration("gérance", remuneration, qui),
    REMUNERATION_DG: phraseRemuneration("direction générale", remuneration, qui),
    REMUNERATION_CO_GERANT: phraseRemuneration("co-gérance", remuneration, qui),
    REMUNERATION_DIRIGEANT: phraseRemuneration(
      regleForme?.titreDirigeant === "Gérant" ? "gérance" : "présidence",
      remuneration,
      qui
    ),
    REMUNERATION_PRESIDENT_TYPE: remuneration ?? "",
    REGIME_SOCIAL_PRESIDENT: dirigeants[0]?.regimeSocial ?? "",

    /* ---------- L'associé de tête, celui qui signe ---------- */
    NOM_ACTIONNAIRE: civiliteNomPrenom(a1),
    ASSOCIE_LISTE: associes
      .map((a, i) =>
        a.type === "morale"
          ? ou(a.societe?.denomination, "Associé " + (i + 1))
          : civiliteNomPrenom(physique(a))
      )
      .join(", "),
    nomComplet: civiliteNomPrenom(a1),
    EST_PERSONNE_PHYSIQUE: premier?.type !== "morale",
    EST_PERSONNE_MORALE: premier?.type === "morale",

    /* ---------- Le conjoint ---------- */
    CONJOINT_DE: conjoint ? civiliteNomPrenom(a1) : TIRET,
    CONJOINT_NOM: conjoint
      ? ou([conjoint.prenom, conjoint.nom].filter((m) => m?.trim()).join(" "))
      : TIRET,
    REGIME_MATRIMONIAL: ou(conjoint?.regimeMatrimonial),
    REGIME_LABEL: ou(conjoint?.regimeMatrimonial),
    DATE_MARIAGE: dateEnFrancais(conjoint?.dateMariage),
    VILLE_MARIAGE: ou(conjoint?.villeMariage),

    SIREN: ou(premier?.societe?.siret),
  };

  // L'état civil du premier associé, sans préfixe : c'est lui que les gabarits
  // désignent par CIVILITE, NOM, PRENOM, ADRESSE_PERSO…
  etatCivilSous("", a1, donnees);
  donnees.ADRESSE_PERSO = ou(a1.adresse);
  donnees.CODE_POSTAL_NAISSANCE = ou(a1.codePostalDeNaissance);

  // Le gérant, pour les gabarits de SCI et de SARL qui le nomment ainsi. EST_HOMME
  // et EST_FEMME sans préfixe désignent le dirigeant : c'est lui qui déclare ne pas
  // avoir été condamné.
  etatCivilSous("GERANT_", dirigeant, donnees);
  donnees.GERANT_EST_HOMME = dirigeant.civilite === "Monsieur";
  donnees.GERANT_EST_FEMME = dirigeant.civilite === "Madame";
  donnees.EST_HOMME = dirigeant.civilite === "Monsieur";
  donnees.EST_FEMME = dirigeant.civilite === "Madame";

  // La société associée, quand le premier associé est une personne morale.
  societeSous("", premier?.societe ?? {}, donnees);
  donnees.SOCIETE_SIEGE = ou(premier?.societe?.adresse);
  donnees.SOCIETE_REPRESENTANT = premier?.societe?.representant
    ? civiliteNomPrenom(premier.societe.representant as PersonnePhysique)
    : TIRET;

  /* ---------- Les associés, un par un ---------- */

  const liste: Donnees[] = [];
  let totalVerse = 0;
  let totalReste = 0;
  let cumulParts = 0;

  // Les dix rangs sont toujours écrits, renseignés ou non : docxtemplater ne doit
  // jamais rencontrer un champ absent, même à l'intérieur d'une section fermée.
  for (let rang = 1; rang <= MAXIMUM_ASSOCIES; rang++) {
    const associe = associes[rang - 1];

    if (!associe) {
      donnees["HAS_ASSOC_" + rang] = false;
      donnees["CIVILITE_NOM_PRENOM_" + rang] = TIRET;
      donnees["ACTIONNAIRE_" + rang] = TIRET;
      donnees["ASSOCIE_" + rang] = TIRET;
      donnees["ADRESSE_ASSOCIE_" + rang] = TIRET;
      donnees["EMAIL_ASSOCIE_" + rang] = "";
      donnees["DATE_NAISSANCE_" + rang] = TIRET;
      donnees["LIEU_NAISSANCE_" + rang] = TIRET;
      donnees["NATIONALITE_" + rang] = "Française";
      donnees["SITUATION_MATRIMONIALE_" + rang] = "célibataire";
      donnees["NOM_PERE_" + rang] = TIRET;
      donnees["NOM_MERE_" + rang] = TIRET;
      donnees["NOM_JEUNE_FILLE_" + rang] = TIRET;
      donnees["EST_HOMME_" + rang] = false;
      donnees["EST_FEMME_" + rang] = false;
      donnees["ASSOC_" + rang + "_EST_MORALE"] = false;
      donnees["ASSOC_" + rang + "_EST_PHYSIQUE"] = false;
      societeSous("ASSOC_" + rang + "_", {}, donnees);
      donnees["NB_PARTS_" + rang] = TIRET;
      donnees["PCT_DETENTION_" + rang] = "0";
      donnees["PCT_LIBERATION_" + rang] = "100";
      donnees["APPORT_NUMERAIRE_" + rang] = montant(0);
      donnees["MONTANT_SOUSCRIT_" + rang] = montant(0);
      donnees["MONTANT_VERSE_" + rang] = montant(0);
      donnees["RESTE_A_LIBERER_" + rang] = montant(0);
      donnees["APPORTS_NATURE_" + rang] = montant(0);
      donnees["DESC_APPORT_NATURE_" + rang] = "";
      donnees["HAS_APPORT_NATURE_" + rang] = false;
      donnees["PARTS_DE_" + rang] = TIRET;
      donnees["PARTS_A_" + rang] = TIRET;
      continue;
    }

    const personne = physique(associe);
    const estMorale = associe.type === "morale";
    const a = apportsDe(associe, nominale);
    const pourcentage =
      partsTotales > 0 ? ((a.parts / partsTotales) * 100).toFixed(1).replace(/\.0$/, "") : "0";

    const identite = estMorale ? ou(associe.societe?.denomination) : civiliteNomPrenom(personne);

    donnees["HAS_ASSOC_" + rang] = true;
    donnees["CIVILITE_NOM_PRENOM_" + rang] = identite;
    donnees["ACTIONNAIRE_" + rang] = identite;
    donnees["ASSOCIE_" + rang] = identite;
    donnees["ADRESSE_ASSOCIE_" + rang] = ou(estMorale ? associe.societe?.adresse : personne.adresse);
    donnees["EMAIL_ASSOCIE_" + rang] = personne.email?.trim() ?? "";
    donnees["DATE_NAISSANCE_" + rang] = dateEnFrancais(personne.dateDeNaissance);
    donnees["LIEU_NAISSANCE_" + rang] = ou(personne.villeDeNaissance);
    donnees["NATIONALITE_" + rang] = ou(personne.nationalite, "Française");
    donnees["SITUATION_MATRIMONIALE_" + rang] = ou(
      personne.situationMatrimoniale?.toLowerCase(),
      "célibataire"
    );
    donnees["NOM_PERE_" + rang] = ou(personne.nomDuPere);
    donnees["NOM_MERE_" + rang] = ou(personne.nomDeLaMere);
    donnees["NOM_JEUNE_FILLE_" + rang] = nomDeJeuneFille(
      personne.nomDeNaissance ?? personne.nomDeLaMere
    );
    donnees["EST_HOMME_" + rang] = personne.civilite === "Monsieur";
    donnees["EST_FEMME_" + rang] = personne.civilite === "Madame";

    donnees["ASSOC_" + rang + "_EST_MORALE"] = estMorale;
    donnees["ASSOC_" + rang + "_EST_PHYSIQUE"] = !estMorale;
    societeSous("ASSOC_" + rang + "_", associe.societe ?? {}, donnees);

    donnees["NB_PARTS_" + rang] = a.parts ? montant(a.parts) : TIRET;
    donnees["PCT_DETENTION_" + rang] = pourcentage;
    donnees["PCT_LIBERATION_" + rang] = String(a.pourcentageLibere);
    donnees["APPORT_NUMERAIRE_" + rang] = montant(a.numeraire);
    donnees["MONTANT_SOUSCRIT_" + rang] = montant(a.souscrit);
    donnees["MONTANT_VERSE_" + rang] = montant(a.verse);
    donnees["RESTE_A_LIBERER_" + rang] = montant(a.reste);
    donnees["APPORTS_NATURE_" + rang] = montant(a.enNature);
    donnees["DESC_APPORT_NATURE_" + rang] = associe.apportEnNature?.description?.trim() ?? "";
    donnees["HAS_APPORT_NATURE_" + rang] = a.enNature > 0;

    // Les parts sont numérotées en continu : « de la part 1 à la part 500 ».
    donnees["PARTS_DE_" + rang] = a.parts > 0 ? String(cumulParts + 1) : TIRET;
    cumulParts += a.parts;
    donnees["PARTS_A_" + rang] = a.parts > 0 ? String(cumulParts) : TIRET;

    totalVerse += a.verse;
    totalReste += a.reste;

    liste.push({
      CIVILITE_NOM_PRENOM: identite,
      DATE_NAISSANCE: dateEnFrancais(personne.dateDeNaissance),
      LIEU_NAISSANCE: ou(personne.villeDeNaissance),
      NATIONALITE: ou(personne.nationalite, "Française"),
      SITUATION_MATRIMONIALE: ou(personne.situationMatrimoniale?.toLowerCase(), "célibataire"),
      ADRESSE: ou(estMorale ? associe.societe?.adresse : personne.adresse),
      EST_HOMME: personne.civilite === "Monsieur",
      EST_FEMME: personne.civilite === "Madame",
      NB_PARTS: a.parts ? montant(a.parts) : TIRET,
      VALEUR_NOMINALE: montant(nominale),
      MONTANT_SOUSCRIT: montant(a.souscrit),
      PCT_DETENTION: pourcentage,
      APPORT_NUMERAIRE: montant(a.numeraire),
      HAS_APPORT_NATURE: a.enNature > 0,
      APPORTS_NATURE: montant(a.enNature),
      DESC_APPORT_NATURE: associe.apportEnNature?.description?.trim() ?? "",
      PCT_LIBERATION: String(a.pourcentageLibere),
      MONTANT_VERSE: montant(a.verse),
      RESTE_A_LIBERER: montant(a.reste),
    });
  }

  /* ---------- Le premier associé, en champs d'apport sans indice ---------- */

  const apportPremier = premier ? apportsDe(premier, nominale) : null;
  donnees.PCT_DETENTION =
    apportPremier && partsTotales > 0
      ? ((apportPremier.parts / partsTotales) * 100).toFixed(1).replace(/\.0$/, "")
      : "0";
  donnees.PCT_LIBERATION = String(apportPremier?.pourcentageLibere ?? 100);
  donnees.LIBERATION_PCT_1 = String(apportPremier?.pourcentageLibere ?? 100);
  donnees.MONTANT_SOUSCRIT = montant(apportPremier?.souscrit ?? 0);
  donnees.MONTANT_VERSE = montant(apportPremier?.verse ?? 0);
  donnees.RESTE_A_LIBERER = montant(apportPremier?.reste ?? 0);
  donnees.APPORT_NUMERAIRE = montant(apportPremier?.numeraire ?? 0);
  donnees.APPORTS_NATURE = montant(apportPremier?.enNature ?? 0);
  donnees.DESC_APPORT_NATURE = premier?.apportEnNature?.description?.trim() ?? "";
  donnees.HAS_APPORT_NATURE = (apportPremier?.enNature ?? 0) > 0;

  /* ---------- Les directeurs généraux ---------- */

  // Le premier dirigeant est le président ou le gérant ; les suivants sont les
  // directeurs généraux, que le procès-verbal nomme DG_1 à DG_3.
  const generaux = dirigeants.slice(1);
  donnees.HAS_DG = generaux.length > 0;
  donnees.DG_COUNT = generaux.length;

  for (let rang = 1; rang <= MAXIMUM_DIRIGEANTS; rang++) {
    const dg = generaux[rang - 1];
    const personne = personneDuDirigeant(dg, tous);

    donnees["HAS_DG_" + rang] = !!dg;
    // Le parcours ne saisit pas de dirigeant personne morale : la condition existe
    // dans les gabarits, elle est donc renseignée, et fausse.
    donnees["DG_" + rang + "_EST_PHYSIQUE"] = !!dg;
    donnees["DG_" + rang + "_EST_MORALE"] = false;
    etatCivilSous("DG_" + rang + "_", personne, donnees);
    societeSous("DG_" + rang + "_", {}, donnees);
  }

  donnees.DG_1_EST_HOMME = personneDuDirigeant(generaux[0], tous).civilite === "Monsieur";
  donnees.DG_1_EST_FEMME = personneDuDirigeant(generaux[0], tous).civilite === "Madame";

  donnees.ASSOCIES = liste;
  donnees.TOTAL_VERSE = montant(totalVerse);
  donnees.TOTAL_RESTE = montant(totalReste);
  donnees.TOTAL_VERSE_LETTRES = nombreEnFrancais(totalVerse);

  return donnees;
}
