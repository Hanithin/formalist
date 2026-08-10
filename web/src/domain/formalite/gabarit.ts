import { dateEnFrancais, nombreEnFrancais } from "./lettres";
import { nomComplet } from "./etat-civil";
import type { PersonnePhysique } from "./etat-civil";
import { apportsDe, valeurNominale } from "./capital";
import type { Associe, Brouillon, Dirigeant } from "./parcours";

/**
 * Les champs attendus par les gabarits Word.
 *
 * Ces noms figurent dans les trente fichiers .docx : les renommer supposerait de
 * reprendre les gabarits, donc ils sont repris tels quels de
 * public/js/creation/form-data.js.
 *
 * Trois conventions viennent de là et sont conservées :
 *   - un champ vide s'écrit « - » et non "" : dans un acte, un blanc se lit comme
 *     un oubli, un tiret comme une absence assumée ;
 *   - les nationalités manquantes valent « Française », la situation matrimoniale
 *     « célibataire », en minuscules parce qu'elles tombent au milieu d'une phrase ;
 *   - les personnes sont numérotées de 1 à 10, avec HAS_ASSOC_n pour que le gabarit
 *     sache où s'arrêter. Au-delà de dix associés, les statuts passent par un avocat.
 */

const MAXIMUM_ASSOCIES = 10;
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
    .replace(/[\u202f\u00a0]/g, " ");
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

type Donnees = Record<string, unknown>;

/**
 * Le jeu de champs complet, pour docxtemplater.
 *
 * Les clés indexées (MONTANT_SOUSCRIT_1…) servent les gabarits écrits à plat ;
 * la liste ASSOCIES sert ceux qui bouclent. Les deux décrivent la même chose,
 * comme dans la page d'origine, parce que les gabarits ne sont pas homogènes.
 */
export function donneesDeGabarit(brouillon: Brouillon): Donnees {
  const associes = (brouillon.associes ?? []).slice(0, MAXIMUM_ASSOCIES);
  const nominale = valeurNominale(brouillon);
  const partsTotales = brouillon.partsTotales ?? 0;

  const dirigeants = brouillon.dirigeants ?? [];
  const premierDirigeant = personneDuDirigeant(dirigeants[0], brouillon.associes ?? []);
  const premierAssocie = physique(associes[0]);

  const capital = brouillon.capital ?? 0;

  const donnees: Donnees = {
    /* ---------- La société ---------- */
    SOCIETE_NOM: ou(brouillon.denomination),
    SOCIETE_FORME: ou(brouillon.forme),
    SOCIETE_TYPE: ou(brouillon.forme),
    SOCIETE_ACTIVITE: ou(brouillon.activite),
    OBJET_SOCIAL: ou(brouillon.activite),
    SOCIETE_ADRESSE: ou(brouillon.adresse),
    SOCIETE_CP: ou(brouillon.codePostal),
    SOCIETE_VILLE: ou(brouillon.ville),
    SOCIETE_CAPITAL: montant(capital),
    CAPITAL: montant(capital),
    // Le capital en lettres fait foi dans les statuts.
    CAPITAL_LETTRES: nombreEnFrancais(capital),
    VALEUR_NOMINALE: montant(nominale),
    NB_PARTS_TOTAL: partsTotales ? montant(partsTotales) : TIRET,
    MODE_DOMICILIATION: ou(brouillon.modeDomiciliation),
    DATE_DEBUT_ACTIVITE: dateEnFrancais(brouillon.dateDebutActivite),
    DATE_CLOTURE_PREMIER_EXERCICE: dateEnFrancais(brouillon.dateCloturePremierExercice),
    DUREE_DE_VIE: String(brouillon.dureeDeVie ?? 99),
    OPTION_FISCALE: ou(brouillon.optionFiscale),
    REGIME_TVA: ou(brouillon.regimeTva),
    PARAPHES: ou(brouillon.paraphes),

    /* ---------- La banque du dépôt ---------- */
    NOM_BANQUE: ou(
      brouillon.banque === "Autre" ? brouillon.banqueAutre?.nom : brouillon.banque
    ),
    ADRESSE_BANQUE: ou(brouillon.banqueAutre?.adresse),
    VILLE_BANQUE: ou(brouillon.banqueAutre?.ville),
    CP_BANQUE: ou(brouillon.banqueAutre?.codePostal),

    /* ---------- Le dirigeant ---------- */
    PRESIDENT_NOM: civiliteNomPrenom(premierDirigeant),
    GERANT_NOM: civiliteNomPrenom(premierDirigeant),
    GERANT_CIVILITE_NOM_PRENOM: civiliteNomPrenom(premierDirigeant),
    GERANT_EST_HOMME: premierDirigeant.civilite === "Monsieur",
    GERANT_EST_FEMME: premierDirigeant.civilite === "Madame",
    GERANT_DATE_NAISSANCE: dateEnFrancais(premierDirigeant.dateDeNaissance),
    GERANT_LIEU_NAISSANCE: ou(premierDirigeant.villeDeNaissance),
    GERANT_NATIONALITE: ou(premierDirigeant.nationalite, "Française"),
    GERANT_SITUATION_MATRIMONIALE: ou(
      premierDirigeant.situationMatrimoniale?.toLowerCase(),
      "célibataire"
    ),
    GERANT_ADRESSE: ou(premierDirigeant.adresse),
    REMUNERATION_DG: ou(dirigeants[0]?.remuneration),
    REGIME_SOCIAL_DG: ou(dirigeants[0]?.regimeSocial),

    /* ---------- L'état civil de tête, celui qui signe ---------- */
    CIVILITE: ou(premierDirigeant.civilite ?? premierAssocie.civilite),
    PRENOM: ou(premierDirigeant.prenom ?? premierAssocie.prenom),
    NOM: ou(premierDirigeant.nom ?? premierAssocie.nom),
    CIVILITE_NOM_PRENOM: civiliteNomPrenom(
      premierDirigeant.nom ? premierDirigeant : premierAssocie
    ),
    EST_HOMME: (premierDirigeant.civilite ?? premierAssocie.civilite) === "Monsieur",
    EST_FEMME: (premierDirigeant.civilite ?? premierAssocie.civilite) === "Madame",
    DATE_NAISSANCE: dateEnFrancais(
      premierDirigeant.dateDeNaissance ?? premierAssocie.dateDeNaissance
    ),
    LIEU_NAISSANCE: ou(premierDirigeant.villeDeNaissance ?? premierAssocie.villeDeNaissance),
    CP_NAISSANCE: ou(
      premierDirigeant.codePostalDeNaissance ?? premierAssocie.codePostalDeNaissance
    ),
    PAYS_NAISSANCE: ou(premierDirigeant.paysDeNaissance ?? premierAssocie.paysDeNaissance, "France"),
    NATIONALITE: ou(premierDirigeant.nationalite ?? premierAssocie.nationalite, "Française"),
    ADRESSE: ou(premierDirigeant.adresse ?? premierAssocie.adresse),
    NOM_PERE: ou(premierDirigeant.nomDuPere ?? premierAssocie.nomDuPere),
    NOM_MERE: ou(premierDirigeant.nomDeLaMere ?? premierAssocie.nomDeLaMere),
    NOM_JEUNE_FILLE: nomDeJeuneFille(
      premierDirigeant.nomDeNaissance ??
        premierDirigeant.nomDeLaMere ??
        premierAssocie.nomDeLaMere
    ),
    SITUATION_MATRIMONIALE: ou(
      (premierDirigeant.situationMatrimoniale ?? premierAssocie.situationMatrimoniale)
        ?.toLowerCase(),
      "célibataire"
    ),
    CONJOINT_DE: ou(premierDirigeant.conjoint ? nomComplet(premierDirigeant) : undefined),
    CONJOINT_NOM: ou(
      premierDirigeant.conjoint
        ? [premierDirigeant.conjoint.prenom, premierDirigeant.conjoint.nom]
            .filter((m) => m?.trim())
            .join(" ")
        : undefined
    ),
    REGIME_MATRIMONIAL: ou(premierDirigeant.conjoint?.regimeMatrimonial),
  };

  /* ---------- Les associés, un par un ---------- */

  const liste: Donnees[] = [];
  let totalVerse = 0;
  let totalReste = 0;
  let cumulParts = 0;

  associes.forEach((associe, i) => {
    const rang = i + 1;
    const personne = physique(associe);
    const estMorale = associe.type === "morale";
    const apports = apportsDe(associe, nominale);
    const pourcentageDetention =
      partsTotales > 0
        ? ((apports.parts / partsTotales) * 100).toFixed(1).replace(/\.0$/, "")
        : "0";

    const identite = estMorale
      ? ou(associe.societe?.denomination)
      : civiliteNomPrenom(personne);

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
    if (estMorale) {
      const societe = associe.societe ?? {};
      donnees["ASSOC_" + rang + "_SOCIETE_NOM"] = ou(societe.denomination);
      donnees["ASSOC_" + rang + "_SOCIETE_FORME"] = ou(societe.forme);
      donnees["ASSOC_" + rang + "_SOCIETE_CAPITAL"] =
        societe.capital !== undefined ? montant(societe.capital) : TIRET;
      donnees["ASSOC_" + rang + "_SOCIETE_ADRESSE"] = ou(societe.adresse);
      donnees["ASSOC_" + rang + "_SOCIETE_RCS_VILLE"] = ou(societe.villeImmatriculation);
      donnees["ASSOC_" + rang + "_SOCIETE_SIREN"] = ou(societe.siret);
      donnees["ASSOC_" + rang + "_SOCIETE_REP"] = ou(
        societe.representant
          ? civiliteNomPrenom(societe.representant as PersonnePhysique)
          : undefined
      );
    }

    // Le conjoint : son consentement figure dans l'acte quand l'apport porte sur
    // un bien commun.
    const conjoint = personne.conjoint;
    donnees["CONJOINT_DE_" + rang] = conjoint ? civiliteNomPrenom(personne) : TIRET;
    donnees["CONJOINT_CIVILITE_" + rang] = ou(conjoint?.civilite);
    donnees["CONJOINT_PRENOM_" + rang] = ou(conjoint?.prenom);
    donnees["CONJOINT_NOM_" + rang] = ou(conjoint?.nom);
    donnees["CONJOINT_NOM_NAISSANCE_" + rang] = ou(conjoint?.nomDeNaissance);
    donnees["REGIME_MATRIMONIAL_" + rang] = ou(conjoint?.regimeMatrimonial);
    donnees["REGIME_LABEL_" + rang] = ou(conjoint?.regimeMatrimonial);
    donnees["DATE_MARIAGE_" + rang] = dateEnFrancais(conjoint?.dateMariage);
    donnees["VILLE_MARIAGE_" + rang] = ou(conjoint?.villeMariage);
    donnees["CONTRAT_MARIAGE_" + rang] = conjoint?.contratDeMariage === true;

    donnees["NB_PARTS_" + rang] = apports.parts ? montant(apports.parts) : TIRET;
    donnees["PCT_DETENTION_" + rang] = pourcentageDetention;
    donnees["PCT_LIBERATION_" + rang] = String(apports.pourcentageLibere);
    donnees["APPORT_NUMERAIRE_" + rang] = montant(apports.numeraire);
    donnees["MONTANT_SOUSCRIT_" + rang] = montant(apports.souscrit);
    donnees["MONTANT_VERSE_" + rang] = montant(apports.verse);
    donnees["RESTE_A_LIBERER_" + rang] = montant(apports.reste);
    donnees["APPORTS_NATURE_" + rang] = montant(apports.enNature);
    donnees["DESC_APPORT_NATURE_" + rang] = associe.apportEnNature?.description?.trim() ?? "";
    donnees["HAS_APPORT_NATURE_" + rang] = apports.enNature > 0;

    // Les parts sont numérotées en continu : « de la part 1 à la part 500 ».
    donnees["PARTS_DE_" + rang] = apports.parts > 0 ? String(cumulParts + 1) : TIRET;
    cumulParts += apports.parts;
    donnees["PARTS_A_" + rang] = apports.parts > 0 ? String(cumulParts) : TIRET;

    totalVerse += apports.verse;
    totalReste += apports.reste;

    liste.push({
      CIVILITE_NOM_PRENOM: identite,
      DATE_NAISSANCE: dateEnFrancais(personne.dateDeNaissance),
      LIEU_NAISSANCE: ou(personne.villeDeNaissance),
      NATIONALITE: ou(personne.nationalite, "Française"),
      SITUATION_MATRIMONIALE: ou(
        personne.situationMatrimoniale?.toLowerCase(),
        "célibataire"
      ),
      ADRESSE: ou(estMorale ? associe.societe?.adresse : personne.adresse),
      EST_HOMME: personne.civilite === "Monsieur",
      EST_FEMME: personne.civilite === "Madame",
      NB_PARTS: apports.parts ? montant(apports.parts) : TIRET,
      VALEUR_NOMINALE: montant(nominale),
      MONTANT_SOUSCRIT: montant(apports.souscrit),
      PCT_DETENTION: pourcentageDetention,
      APPORT_NUMERAIRE: montant(apports.numeraire),
      HAS_APPORT_NATURE: apports.enNature > 0,
      APPORTS_NATURE: montant(apports.enNature),
      DESC_APPORT_NATURE: associe.apportEnNature?.description?.trim() ?? "",
      PCT_LIBERATION: String(apports.pourcentageLibere),
      MONTANT_VERSE: montant(apports.verse),
      RESTE_A_LIBERER: montant(apports.reste),
    });
  });

  // Les rangs non utilisés sont explicitement faux : sans quoi le gabarit
  // afficherait un bloc d'associé vide.
  for (let rang = associes.length + 1; rang <= MAXIMUM_ASSOCIES; rang++) {
    donnees["HAS_ASSOC_" + rang] = false;
  }

  donnees.ASSOCIES = liste;
  donnees.TOTAL_VERSE = montant(totalVerse);
  donnees.TOTAL_RESTE = montant(totalReste);
  donnees.TOTAL_VERSE_LETTRES = nombreEnFrancais(totalVerse);

  return donnees;
}
