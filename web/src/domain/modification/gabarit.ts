import { dateEnFrancais, nombreEnFrancais } from "@/domain/formalite/lettres";
import { nomDeJeuneFille } from "@/domain/formalite/gabarit";
import { definitions, type Valeurs } from "./types";

/**
 * Les champs attendus par les gabarits Word de modification.
 *
 * Écrit depuis l'inventaire des .docx, comme celui de la création : ce sont eux qui
 * font foi. Les quatre gabarits attendent {{SOCIETE}}, {{CAPITAL_FORMATE}},
 * {{SIEGE_SOCIAL}}, {{RCS_VILLE}}, {{SIREN}}, {{DATE_AGE}}, et découpent tout leur
 * contenu en sections conditionnelles {{#IS_TRANSFERT_SIEGE}}, {{#IS_DIRIGEANT}},
 * {{#IS_NOMINATION}}…
 *
 * La version précédente passait SOCIETE_NOM et les identifiants de champs mis en
 * majuscules - « nouvelleAdresse » devenait « NOUVELLEADRESSE ». Aucun nom ne
 * correspondait, aucun drapeau IS_ n'était transmis, et docx remplace l'inconnu par
 * du vide : le procès-verbal sortait avec « au capital de  euros », sans siège, sans
 * SIREN et sans une seule résolution. Vérifié en le générant.
 *
 * Deux conventions viennent de la création et sont gardées : un champ vide s'écrit
 * « - » plutôt que "" - dans un acte, un blanc se lit comme un oubli - et les
 * montants s'écrivent avec une espace ordinaire, l'espace fine insécable manquant
 * dans certaines polices.
 */

const TIRET = "-";

export interface SocieteModifiee {
  denomination?: string | null;
  forme?: string | null;
  siren?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  capital?: number | null;
  /** Date des statuts en vigueur, au format ISO. */
  dateStatuts?: string | null;
  /** Ville du RCS, résolue depuis le code postal par l'appelant. */
  villeRcs?: string | null;
}

export interface AssociePresent {
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
  parts?: number | null;
}

export interface Assemblee {
  /** Date de l'assemblée, au format ISO. */
  date?: string | null;
  associes?: AssociePresent[];
}

export interface ContexteGabarit {
  societe: SocieteModifiee;
  assemblee: Assemblee;
  codes: string[];
  valeurs: Valeurs;
  /** Ville du RCS du nouveau siège, quand il y a transfert. */
  villeRcsNouvelle?: string | null;
}

function ou(valeur: string | null | undefined, defaut = TIRET): string {
  return valeur?.trim() ? valeur.trim() : defaut;
}

/**
 * « 15 000 » : les montants s'écrivent avec une espace ordinaire.
 *
 * Selon la version d'ICU, toLocaleString rend une espace fine insécable (U+202F) ou
 * une insécable (U+00A0). La première manque dans certaines polices : elle apparaît
 * alors comme un carré au milieu d'un montant, dans un acte déposé au greffe.
 *
 * Ces deux espaces figurent en clair dans la classe de caractères, où rien ne les
 * distingue d'une espace ordinaire. Une réécriture du fichier les a déjà aplaties
 * sans que rien ne le signale : la règle ne s'appliquait plus, et c'est le test qui
 * cherche « 15 000 » dans le document produit qui l'a montré. Il est là pour ça.
 */
function montant(valeur: number): string {
  return valeur
    .toLocaleString("fr-FR", { maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");
}

function texte(valeur: string | number | undefined): string {
  if (typeof valeur === "number") return String(valeur);
  return ou(valeur);
}

function nombreOuTiret(valeur: string | number | undefined): string {
  if (typeof valeur === "number") return montant(valeur);
  if (typeof valeur !== "string" || !valeur.trim()) return TIRET;
  const lu = Number(valeur.replace(",", "."));
  return Number.isFinite(lu) ? montant(lu) : valeur.trim();
}

/** « 12 rue de la Paix, 75002 Paris » : l'adresse d'un acte tient sur une ligne. */
export function adresseSurUneLigne(
  rue: string | null | undefined,
  codePostal: string | null | undefined,
  ville: string | null | undefined
): string {
  const morceaux = [rue?.trim(), [codePostal?.trim(), ville?.trim()].filter(Boolean).join(" ")];
  const ligne = morceaux.filter(Boolean).join(", ");
  return ligne || TIRET;
}

/** « Monsieur Jean DUPONT » : la civilité fait partie du nom dans un acte. */
function nomComplet(associe: AssociePresent): string {
  const morceaux = [associe.civilite, associe.prenom, associe.nom].filter((m) => m?.trim());
  return morceaux.length ? morceaux.join(" ") : TIRET;
}

/**
 * Le jeu de données complet, prêt pour docx.
 *
 * Toutes les clés sont produites, y compris celles des types non choisis : leur
 * section conditionnelle ne sera pas rendue, mais un gabarit qui référencerait une
 * variable hors de sa section n'aurait alors pas de trou.
 */
export function donneesDuGabarit(contexte: ContexteGabarit): Record<string, unknown> {
  const { societe, assemblee, codes, valeurs } = contexte;
  const choisies = definitions(codes);

  const capital = typeof societe.capital === "number" ? societe.capital : 0;
  const siege = adresseSurUneLigne(societe.adresse, societe.codePostal, societe.ville);

  const associes = (assemblee.associes ?? []).map((associe, rang) => ({
    index: rang + 1,
    civilite: ou(associe.civilite),
    prenom: ou(associe.prenom),
    nom: ou(associe.nom),
    nomComplet: nomComplet(associe),
    parts: associe.parts ?? 0,
  }));
  const totalParts = associes.reduce((total, a) => total + a.parts, 0);

  const forme = ou(societe.forme, "SAS");
  const unipersonnelle = forme === "SASU" || forme === "EURL";

  const nouveauSiege = adresseSurUneLigne(
    typeof valeurs.nouvelleAdresse === "string" ? valeurs.nouvelleAdresse : "",
    typeof valeurs.nouveauCodePostal === "string" ? valeurs.nouveauCodePostal : "",
    typeof valeurs.nouvelleVille === "string" ? valeurs.nouvelleVille : ""
  );

  const changement = typeof valeurs.typeChangementDirigeant === "string"
    ? valeurs.typeChangementDirigeant
    : "";

  return {
    /* --------------------------------------------------------- La société */
    SOCIETE: ou(societe.denomination),
    FORME_JURIDIQUE: forme,
    SIREN: ou(societe.siren),
    SIEGE_SOCIAL: siege,
    ADRESSE_ACTUELLE: ou(societe.adresse),
    VILLE_ACTUELLE: ou(societe.ville),
    CP_ACTUEL: ou(societe.codePostal),
    CAPITAL_MONTANT: capital,
    CAPITAL_FORMATE: montant(capital),
    CAPITAL_LETTRES: nombreEnFrancais(capital),
    DATE_STATUTS: ou(societe.dateStatuts),
    DATE_STATUTS_FR: dateEnFrancais(societe.dateStatuts),
    RCS_VILLE: ou(societe.villeRcs, ou(societe.ville)),

    /* -------------------------------------------------------- L'assemblée */
    DATE_AGE: dateEnFrancais(assemblee.date),
    NB_ASSOCIES: associes.length,
    TOTAL_PARTS: totalParts,
    TOTAL_PARTS_LETTRES: nombreEnFrancais(totalParts),
    ASSOCIES: associes,
    ASSOCIE_LISTE: associes.length
      ? associes.map((a) => a.nomComplet + ", détenant " + a.parts + " parts").join(" ; ")
      : TIRET,

    /* ------------------------------------------------- Ce qui est décidé */
    TYPE_MODIFICATION: codes.join(","),
    LABEL_MODIFICATION: choisies.map((d) => d.libelle).join(", "),
    TYPES_LABEL: choisies.map((d) => d.libelle).join(", "),
    NOMBRE_RESOLUTIONS: choisies.length,

    IS_TRANSFERT_SIEGE: codes.includes("transfert_siege"),
    IS_DENOMINATION: codes.includes("denomination"),
    IS_DIRIGEANT: codes.includes("dirigeant"),
    IS_OBJET_SOCIAL: codes.includes("objet_social"),
    IS_AUGMENTATION_CAPITAL: codes.includes("augmentation_capital"),
    IS_REDUCTION_CAPITAL: codes.includes("reduction_capital"),
    IS_CESSION_PARTS: codes.includes("cession_parts"),
    IS_PROROGATION: codes.includes("prorogation"),

    IS_SAS: forme === "SAS",
    IS_SASU: forme === "SASU",
    IS_SARL: forme === "SARL",
    IS_EURL: forme === "EURL",
    IS_SCI: forme === "SCI",
    IS_UNIPERSONNELLE: unipersonnelle,

    /* ------------------------------------------------ Transfert de siège */
    NOUVEAU_SIEGE: nouveauSiege,
    NOUVELLE_ADRESSE: texte(valeurs.nouvelleAdresse),
    NOUVELLE_VILLE: texte(valeurs.nouvelleVille),
    NOUVEAU_CP: texte(valeurs.nouveauCodePostal),
    NOUVEAU_MODE_DOMICILIATION: texte(valeurs.nouveauModeDomiciliation),
    NOUVEAU_RCS_VILLE: ou(contexte.villeRcsNouvelle, texte(valeurs.nouvelleVille)),
    DATE_EFFET_TRANSFERT: texte(valeurs.dateEffetTransfert),
    DATE_EFFET_TRANSFERT_FR: dateEnFrancais(
      typeof valeurs.dateEffetTransfert === "string" ? valeurs.dateEffetTransfert : null
    ),

    /* ------------------------------------------------------ Dénomination */
    NOUVELLE_DENOMINATION: texte(valeurs.nouvelleDenomination),
    SIGLE: texte(valeurs.sigle),
    DATE_EFFET_DENOMINATION: texte(valeurs.dateEffetDenomination),
    DATE_EFFET_DENOMINATION_FR: dateEnFrancais(
      typeof valeurs.dateEffetDenomination === "string" ? valeurs.dateEffetDenomination : null
    ),

    /* ---------------------------------------------------------- Dirigeant */
    TYPE_CHANGEMENT_DIRIGEANT: ou(changement),
    FONCTION_DIRIGEANT: texte(valeurs.fonctionDirigeant),
    DATE_EFFET_DIRIGEANT: texte(valeurs.dateEffetDirigeant),
    DATE_EFFET_DIRIGEANT_FR: dateEnFrancais(
      typeof valeurs.dateEffetDirigeant === "string" ? valeurs.dateEffetDirigeant : null
    ),
    IS_NOMINATION: changement === "Nomination",
    IS_REVOCATION: changement === "Révocation",
    IS_DEMISSION: changement === "Démission",
    NOUVEAU_DIRIGEANT_CIVILITE: texte(valeurs.nouveauDirigeantCivilite),
    NOUVEAU_DIRIGEANT_NOM: texte(valeurs.nouveauDirigeantNom),
    NOUVEAU_DIRIGEANT_PRENOM: texte(valeurs.nouveauDirigeantPrenom),
    NOUVEAU_DIRIGEANT_DATE_NAISSANCE: dateEnFrancais(
      typeof valeurs.nouveauDirigeantDateNaissance === "string"
        ? valeurs.nouveauDirigeantDateNaissance
        : null
    ),
    NOUVEAU_DIRIGEANT_LIEU_NAISSANCE: texte(valeurs.nouveauDirigeantLieuNaissance),
    // La nationalité manquante vaut « française », en minuscules : elle tombe au
    // milieu d'une phrase, comme à la création.
    NOUVEAU_DIRIGEANT_NATIONALITE: ou(
      typeof valeurs.nouveauDirigeantNationalite === "string"
        ? valeurs.nouveauDirigeantNationalite
        : "",
      "française"
    ),
    NOUVEAU_DIRIGEANT_ADRESSE: texte(valeurs.nouveauDirigeantAdresse),
    REMUNERATION_DIRIGEANT: texte(valeurs.remunerationDirigeant),
    DIRIGEANT_REVOQUE_NOM: texte(valeurs.dirigeantRevoqueNom),
    MOTIF_REVOCATION: texte(valeurs.motifRevocation),
    DIRIGEANT_DEMISSIONNAIRE_NOM: texte(valeurs.dirigeantDemissionnaireNom),

    /* -------------------------------------------------------- Objet social */
    OBJET_SOCIAL_ACTUEL: texte(valeurs.objetSocialActuel),
    NOUVEL_OBJET_SOCIAL: texte(valeurs.nouvelObjetSocial),
    DATE_EFFET_OBJET: texte(valeurs.dateEffetObjet),
    DATE_EFFET_OBJET_FR: dateEnFrancais(
      typeof valeurs.dateEffetObjet === "string" ? valeurs.dateEffetObjet : null
    ),

    /* ------------------------------------------------ Augmentation de capital */
    CAPITAL_ACTUEL_AUGM: nombreOuTiret(valeurs.capitalActuelAugm),
    NOUVEAU_CAPITAL_AUGM: nombreOuTiret(valeurs.nouveauCapitalAugm),
    MODE_AUGMENTATION: texte(valeurs.modeAugmentation),
    NB_PARTS_NOUVELLES: texte(valeurs.nbPartsNouvelles),
    VALEUR_NOMINALE_AUGM: nombreOuTiret(valeurs.valeurNominaleAugm),
    PRIME_EMISSION: nombreOuTiret(valeurs.primeEmission),
    DATE_EFFET_AUGM: texte(valeurs.dateEffetAugm),
    DATE_EFFET_AUGM_FR: dateEnFrancais(
      typeof valeurs.dateEffetAugm === "string" ? valeurs.dateEffetAugm : null
    ),

    /* --------------------------------------------------- Réduction de capital */
    CAPITAL_ACTUEL_RED: nombreOuTiret(valeurs.capitalActuelRed),
    NOUVEAU_CAPITAL_RED: nombreOuTiret(valeurs.nouveauCapitalRed),
    MOTIF_REDUCTION: texte(valeurs.motifReduction),
    NB_PARTS_ANNULEES: texte(valeurs.nbPartsAnnulees),
    DATE_EFFET_RED: texte(valeurs.dateEffetRed),
    DATE_EFFET_RED_FR: dateEnFrancais(
      typeof valeurs.dateEffetRed === "string" ? valeurs.dateEffetRed : null
    ),

    /* ------------------------------------------------------------- Cession */
    CEDANT_NOM: texte(valeurs.cedantNom),
    CESSIONNAIRE_TYPE: texte(valeurs.cessionnaireType),
    CESSIONNAIRE_NOM: texte(valeurs.cessionnaireNom),
    CESSIONNAIRE_ADRESSE: texte(valeurs.cessionnaireAdresse),
    NB_PARTS_CEDEES: texte(valeurs.nbPartsCedees),
    PRIX_CESSION: nombreOuTiret(valeurs.prixCession),
    DATE_CESSION: texte(valeurs.dateCession),
    DATE_CESSION_FR: dateEnFrancais(
      typeof valeurs.dateCession === "string" ? valeurs.dateCession : null
    ),
    AGREMENT_REQUIS: texte(valeurs.agrementRequis),

    /*
     * La déclaration de non-condamnation, reprise des gabarits de la création.
     *
     * Elle nomme ses champs autrement - CIVILITE_NOM_PRENOM_1, ADRESSE_ASSOCIE_1,
     * NOM_SOCIETE - parce qu'elle vient d'un autre jeu de documents. On les produit
     * en plus plutôt que de renommer un gabarit déjà employé par la création.
     */
    CIVILITE_NOM_PRENOM_1: nomComplet({
      civilite: typeof valeurs.nouveauDirigeantCivilite === "string" ? valeurs.nouveauDirigeantCivilite : "",
      prenom: typeof valeurs.nouveauDirigeantPrenom === "string" ? valeurs.nouveauDirigeantPrenom : "",
      nom: typeof valeurs.nouveauDirigeantNom === "string" ? valeurs.nouveauDirigeantNom : "",
    }),
    ADRESSE_ASSOCIE_1: texte(valeurs.nouveauDirigeantAdresse),
    DATE_NAISSANCE_1: dateEnFrancais(
      typeof valeurs.nouveauDirigeantDateNaissance === "string"
        ? valeurs.nouveauDirigeantDateNaissance
        : null
    ),
    LIEU_NAISSANCE_1: texte(valeurs.nouveauDirigeantLieuNaissance),
    NATIONALITE_1: ou(
      typeof valeurs.nouveauDirigeantNationalite === "string"
        ? valeurs.nouveauDirigeantNationalite
        : "",
      "française"
    ),
    NOM_PERE_1: texte(valeurs.nouveauDirigeantNomPere),
    NOM_MERE_1: texte(valeurs.nouveauDirigeantNomMere),
    NOM_JEUNE_FILLE: nomDeJeuneFille(
      typeof valeurs.nouveauDirigeantNomMere === "string" ? valeurs.nouveauDirigeantNomMere : ""
    ),
    NOM_SOCIETE: ou(societe.denomination),
    CAPITAL: montant(capital),
    ADRESSE_SIEGE: siege,
    DATE_SIGNATURE: dateEnFrancais(assemblee.date),

    /* --------------------------------------------------------- Prorogation */
    DUREE_ACTUELLE: texte(valeurs.dureeActuelle),
    NOUVELLE_DUREE: texte(valeurs.nouvelleDuree),
    DATE_EXPIRATION_ACTUELLE: texte(valeurs.dateExpirationActuelle),
    DATE_EXPIRATION_ACTUELLE_FR: dateEnFrancais(
      typeof valeurs.dateExpirationActuelle === "string" ? valeurs.dateExpirationActuelle : null
    ),
  };
}

/* ------------------------------------------------------------ Les gabarits */

/**
 * Le gabarit du procès-verbal dépend du nombre d'associés, non de la famille
 * juridique.
 *
 * Dans une société à associé unique il n'y a pas d'assemblée : la décision est prise
 * seul, et le document en porte la formulation. Le gabarit « sasu » est en réalité la
 * variante unipersonnelle, ce qui explique qu'une EURL l'emploie aussi.
 */
export function gabaritProcesVerbal(forme: string | null | undefined): string {
  const f = (forme ?? "").trim().toUpperCase();
  if (f === "SASU" || f === "EURL") return "modif-pv-transfert-siege-sasu.docx";
  if (f === "SARL") return "modif-pv-transfert-siege-sarl.docx";
  if (f === "SCI") return "modif-pv-transfert-siege-sci.docx";
  return "modif-pv-transfert-siege-sas.docx";
}

export interface ActeAProduire {
  titre: string;
  gabarit: string;
}

/**
 * Les actes à produire.
 *
 * Le procès-verbal est unique et porte toutes les résolutions : c'est une seule
 * assemblée. L'avenant aux statuts ne suit que les changements qui touchent leur
 * texte, et l'acte de cession n'existe que s'il y a cession.
 */
export function actesAProduire(
  codes: string[],
  forme: string | null | undefined,
  valeurs: Valeurs = {}
): ActeAProduire[] {
  if (codes.length === 0) return [];

  const choisies = definitions(codes);
  const actes: ActeAProduire[] = [
    {
      titre:
        choisies.length === 1
          ? "Procès-verbal - " + choisies[0].libelle
          : "Procès-verbal d'assemblée générale extraordinaire",
      gabarit: gabaritProcesVerbal(forme),
    },
  ];

  if (codes.includes("cession_parts")) {
    actes.push({ titre: "Acte de cession de parts", gabarit: "modif-acte-cession.docx" });
  }

  const toucheLesStatuts = codes.some((c) =>
    [
      "transfert_siege",
      "denomination",
      "objet_social",
      "augmentation_capital",
      "reduction_capital",
      "prorogation",
    ].includes(c)
  );
  if (toucheLesStatuts) {
    actes.push({ titre: "Avenant aux statuts", gabarit: "modif-avenant-statuts.docx" });
  }

  const declaration = gabaritDeLaDeclaration(forme, valeurs);
  if (codes.includes("dirigeant") && valeurs.typeChangementDirigeant === "Nomination" && declaration) {
    actes.push({ titre: "Déclaration de non-condamnation et de filiation", gabarit: declaration });
  }

  return actes;
}

/**
 * La déclaration de non-condamnation, quand le gabarit dit la bonne fonction.
 *
 * types.js appelait « modif-declaration-non-condamnation.docx », qui n'existe pas :
 * seuls les quatre gabarits de la création existent, et chacun écrit sa fonction en
 * dur - « Président » pour une SAS, « gérant » pour une SARL. Les employer pour une
 * nomination de directeur général produirait une déclaration disant qu'on accepte
 * les fonctions de président. Le greffe la refuserait, et rien dans le document ne
 * dirait pourquoi.
 *
 * Hors de ces cas, l'acte n'est pas produit : la nomination reste possible, et
 * obligationsParticulieres dit que l'avocat rédige la déclaration.
 */
export function gabaritDeLaDeclaration(
  forme: string | null | undefined,
  valeurs: Valeurs
): string | null {
  const f = (forme ?? "").trim().toUpperCase();
  const fonction = typeof valeurs.fonctionDirigeant === "string" ? valeurs.fonctionDirigeant : "";

  if ((f === "SAS" || f === "SASU") && fonction === "Président") {
    return f === "SASU" ? "sasu-declaration-non-condamnation.docx" : "sas-declaration-non-condamnation.docx";
  }

  const gerance = fonction === "Gérant" || fonction === "Co-gérant";
  if (f === "SARL" && gerance) return "sarl-declaration-non-condamnation.docx";
  if (f === "EURL" && gerance) return "sarl-declaration-non-condamnation.docx";
  if (f === "SCI" && gerance) return "sci-declaration-non-condamnation.docx";

  return null;
}
