import { dateEnFrancais, nombreEnFrancais } from "@/domain/formalite/lettres";
import { agrementDeDroit, cessionsRedigees, type Cession } from "./cession";
import { formeEnToutesLettres } from "./annonce";
import { nomDeJeuneFille } from "@/domain/formalite/gabarit";
import { definitions, type Valeurs } from "./types";
import { changeDeRessort } from "./formalites";
import { evaluationDesApports, planDeCapital, regimeApport, REMPLOI } from "./apport";

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

/**
 * Un associé présent à l'assemblée.
 *
 * Il peut être une personne morale : une SCI détenue par une holding, une SAS dont
 * un fonds est associé. Le procès-verbal ne peut alors pas se contenter d'un nom - il
 * doit désigner la société par sa forme, son capital, son siège et son numéro
 * d'immatriculation, et nommer qui la représente à l'assemblée. Un acte qui écrirait
 * « Monsieur HOLDING » se ferait refuser.
 */
export interface AssociePresent {
  /** Personne physique par défaut : c'est le cas courant, et l'ancien format. */
  nature?: "physique" | "morale" | null;
  parts?: number | null;

  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;

  denomination?: string | null;
  forme?: string | null;
  siren?: string | null;
  siege?: string | null;
  capital?: number | null;
  /** Qui signe pour elle, et à quel titre. */
  representant?: string | null;
  qualiteRepresentant?: string | null;
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
  /** Les cessions décidées, qui désignent les associés de l'assemblée. */
  cessions?: Cession[];
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

/** La valeur telle quelle, sans le tiret de remplacement : pour décider, non pour écrire. */
function texteBrut(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
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
/**
 * L'adresse d'une société, sur une ligne.
 *
 * Le code postal et la ville ne s'ajoutent que s'ils manquent. La recherche au registre
 * rend souvent une voie qui les contient déjà - « 861 chemin de l'Espagnol 06250
 * Mougins » - et les accoler donnait, dans un acte qui part au greffe :
 * « 861 chemin de l'Espagnol 06250 Mougins, 06250 Mougins ».
 *
 * La comparaison ignore la casse et les accents : « ORLÉANS » dans la voie et
 * « Orleans » dans le champ désignent la même ville.
 */
export function adresseSurUneLigne(
  rue: string | null | undefined,
  codePostal: string | null | undefined,
  ville: string | null | undefined
): string {
  const voie = (rue ?? "").trim();
  const sansAccent = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const dansLaVoie = (morceau: string) =>
    morceau.length > 0 && sansAccent(voie).includes(sansAccent(morceau));

  const cp = (codePostal ?? "").trim();
  const commune = (ville ?? "").trim();
  const suite = [dansLaVoie(cp) ? "" : cp, dansLaVoie(commune) ? "" : commune]
    .filter(Boolean)
    .join(" ");

  const ligne = [voie, suite].filter(Boolean).join(", ");
  return ligne || TIRET;
}

/**
 * « d'Antibes », « de Nanterre » : le registre s'élide devant une voyelle.
 *
 * L'acte portait « immatriculée au RCS de Antibes ». Personne n'écrit cela, et cela se
 * remarque dans un document signé.
 */
export function avecElision(ville: string): string {
  const nette = ville.trim();
  if (!nette) return TIRET;
  const premiere = nette
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")[0]
    .toLowerCase();
  return /[aeiouy]/.test(premiere) ? "d'" + nette : "de " + nette;
}

/** « Monsieur Jean DUPONT » : la civilité fait partie du nom dans un acte. */
export function designationDeLAssocie(associe: AssociePresent): string {
  return nomComplet(associe);
}

function nomComplet(associe: AssociePresent): string {
  if (associe.nature === "morale") return societeDesignee(associe);

  const morceaux = [associe.civilite, associe.prenom, associe.nom].filter((m) => m?.trim());
  return morceaux.length ? morceaux.join(" ") : TIRET;
}

/**
 * Une société associée, désignée comme un acte la désigne.
 *
 * « La société ACME HOLDING, société par actions simplifiée au capital de 50 000
 * euros, dont le siège est 3 rue X, immatriculée au registre du commerce et des
 * sociétés sous le numéro 123456789, représentée par Monsieur Y en sa qualité de
 * président ». Les morceaux absents sont simplement omis : une phrase courte vaut
 * mieux qu'une phrase à trous.
 */
export function societeDesignee(associe: AssociePresent): string {
  const denomination = ou(associe.denomination, "");
  if (!denomination) return TIRET;

  const morceaux = ["La société " + denomination];

  const forme = ou(associe.forme, "");
  const capital = typeof associe.capital === "number" ? montant(associe.capital) : "";
  if (forme && capital) morceaux.push(forme + " au capital de " + capital + " euros");
  else if (forme) morceaux.push(forme);

  const siege = ou(associe.siege, "");
  if (siege) morceaux.push("dont le siège est " + siege);

  const siren = ou(associe.siren, "").replace(/\s/g, "");
  if (siren) {
    morceaux.push("immatriculée au registre du commerce et des sociétés sous le numéro " + siren);
  }

  const representant = ou(associe.representant, "");
  if (representant) {
    const qualite = ou(associe.qualiteRepresentant, "");
    morceaux.push(
      "représentée par " + representant + (qualite ? " en sa qualité de " + qualite.toLowerCase() : "")
    );
  }

  return morceaux.join(", ");
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

  const cessions = cessionsRedigees(assemblee.associes ?? [], contexte.cessions ?? []);

  const associes = (assemblee.associes ?? []).map((associe, rang) => ({
    index: rang + 1,
    civilite: ou(associe.civilite),
    prenom: ou(associe.prenom),
    nom: ou(associe.nom),
    // Une société associée signe sous sa dénomination, non sous celle de son
    // représentant : c'est elle qui est associée.
    denomination: ou(associe.denomination),
    nomComplet: nomComplet(associe),
    parts: associe.parts ?? 0,
  }));
  const totalParts = associes.reduce((total, a) => total + a.parts, 0);

  const forme = ou(societe.forme, "SAS");
  const unipersonnelle = forme === "SASU" || forme === "EURL";
  /*
   * Les titres portent le nom de la forme : une SAS a des actions, une SARL des parts
   * sociales. La liste des présents écrivait « détenant 700 parts » dans un
   * procès-verbal de SAS qui parlait d'actions partout ailleurs.
   */
  const titres = forme === "SAS" || forme === "SASU" ? "actions" : "parts sociales";

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
    /* « immatriculée au registre du commerce et des sociétés d'Antibes ». */
    RCS_DE: avecElision((societe.villeRcs ?? societe.ville ?? "").trim()),
    /* La forme en toutes lettres : un acte n'écrit pas « SASU au capital de ». */
    FORME_EN_CLAIR: formeEnToutesLettres(societe.forme).toLowerCase(),

    /* -------------------------------------------------------- L'assemblée */
    DATE_AGE: dateEnFrancais(assemblee.date),
    NB_ASSOCIES: associes.length,
    TOTAL_PARTS: totalParts,
    /* Avec son séparateur de milliers : « 2000 parts » ne se relit pas. */
    TOTAL_PARTS_FORMATE: montant(totalParts),
    TOTAL_PARTS_LETTRES: nombreEnFrancais(totalParts),
    /** « actions » ou « parts sociales », selon la forme. */
    MOT_TITRES: titres,
    /*
     * L'associé unique, nommé sans ses parts.
     *
     * La décision disait « Le soussigné, Monsieur Jean DUPONT, détenant 2 000 actions,
     * associé unique de la société, propriétaire de la totalité des 2 000 actions » :
     * la liste des présents y sert de désignation, et elle compte déjà les titres.
     */
    ASSOCIE_UNIQUE: associes.length ? associes[0].nomComplet : TIRET,
    ASSOCIES: associes,
    ASSOCIE_LISTE: associes.length
      ? associes
          .map((a) => a.nomComplet + ", détenant " + montant(a.parts) + " " + titres)
          .join(" ; ")
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
    IS_APPORT_TITRES: codes.includes("apport_titres"),

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
    NOUVEAU_RCS_DE: avecElision(
      (contexte.villeRcsNouvelle ?? (valeurs.nouvelleVille as string | undefined) ?? "").trim()
    ),
    /*
     * Le déménagement d'un ressort à l'autre, que le procès-verbal doit dire.
     *
     * Deux avis au lieu d'un, une radiation et une nouvelle immatriculation : le greffe
     * de départ ne peut pas le deviner d'un acte qui n'en parle pas. La règle est celle
     * de l'annonce - on compare les villes de RCS, non les départements.
     */
    IS_HORS_RESSORT:
      codes.includes("transfert_siege") &&
      changeDeRessort(societe.villeRcs ?? societe.ville, contexte.villeRcsNouvelle),
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
    /*
     * Le motif est facultatif, et un champ vide vaut « - » dans nos gabarits.
     *
     * Une section {#MOTIF_REVOCATION} verrait ce tiret comme une valeur et écrirait
     * « Le motif de la révocation est le suivant : - ». Le drapeau dit la présence.
     */
    IS_MOTIF_REVOCATION: Boolean(texteBrut(valeurs.motifRevocation)),
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
    /* « 3000 parts nouvelles » : un acte écrit « 3 000 », comme partout ailleurs. */
    NB_PARTS_NOUVELLES: nombreOuTiret(valeurs.nbPartsNouvelles),
    VALEUR_NOMINALE_AUGM: nombreOuTiret(valeurs.valeurNominaleAugm),
    PRIME_EMISSION: nombreOuTiret(valeurs.primeEmission),
    /* Même raison que le motif de révocation : « une prime d'émission de - euros ». */
    IS_PRIME_EMISSION: Boolean(texteBrut(valeurs.primeEmission)),
    DATE_EFFET_AUGM: texte(valeurs.dateEffetAugm),
    DATE_EFFET_AUGM_FR: dateEnFrancais(
      typeof valeurs.dateEffetAugm === "string" ? valeurs.dateEffetAugm : null
    ),

    /* --------------------------------------------------- Réduction de capital */
    CAPITAL_ACTUEL_RED: nombreOuTiret(valeurs.capitalActuelRed),
    NOUVEAU_CAPITAL_RED: nombreOuTiret(valeurs.nouveauCapitalRed),
    MOTIF_REDUCTION: texte(valeurs.motifReduction),
    /* « motivée par des pertes », non « motivée par : Pertes ». */
    MOTIF_REDUCTION_EN_CLAIR:
      valeurs.motifReduction === "Pertes"
        ? "des pertes"
        : valeurs.motifReduction === "Remboursement aux associés"
          ? "un remboursement aux associés"
          : texte(valeurs.motifReduction),
    /*
     * Hors pertes, les créanciers ont un délai d'opposition.
     *
     * Le procès-verbal le dit, faute de quoi le dépôt part trop tôt et le greffe le
     * refuse. La condition est celle qu'emploie déjà obligationsParticulieres.
     */
    IS_REDUCTION_HORS_PERTES: valeurs.motifReduction === "Remboursement aux associés",
    NB_PARTS_ANNULEES: nombreOuTiret(valeurs.nbPartsAnnulees),
    DATE_EFFET_RED: texte(valeurs.dateEffetRed),
    DATE_EFFET_RED_FR: dateEnFrancais(
      typeof valeurs.dateEffetRed === "string" ? valeurs.dateEffetRed : null
    ),

    /* ------------------------------------------------------------- Cession */
    /*
     * Les cessions, et la première d'entre elles.
     *
     * Les gabarits existants attendent des clés au singulier : elles sont alimentées
     * par la première cession, et CESSIONS porte la liste pour les actes qui savent
     * boucler. Un dossier d'avant, saisi en champs plats, garde ses valeurs.
     */
    CESSIONS: cessions,
    NB_CESSIONS: cessions.length,
    CEDANT_NOM: cessions[0]?.CEDANT || texte(valeurs.cedantNom),
    CESSIONNAIRE_TYPE: texte(valeurs.cessionnaireType),
    CESSIONNAIRE_NOM: cessions[0]?.CESSIONNAIRE || texte(valeurs.cessionnaireNom),
    CESSIONNAIRE_ADRESSE: texte(valeurs.cessionnaireAdresse),
    /*
     * Ce que chaque mode d'augmentation apporte au procès-verbal.
     *
     * L'acte doit nommer la banque dépositaire, le commissaire aux apports, le poste
     * de réserves prélevé ou le titulaire de la créance : rien de tout cela n'était
     * recueilli, et les phrases sortaient à trous.
     */
    BANQUE_DEPOT: texte(valeurs.banqueDepot),
    DATE_DEPOT_FONDS: texte(valeurs.dateDepotFonds),
    DATE_DEPOT_FONDS_FR: dateEnFrancais(texte(valeurs.dateDepotFonds)),
    TITULAIRE_CREANCE: texte(valeurs.titulaireCreance),
    MONTANT_CREANCE: nombreOuTiret(valeurs.montantCreance),
    DATE_ARRETE_COMPTE: texte(valeurs.dateArreteCompte),
    DATE_ARRETE_COMPTE_FR: dateEnFrancais(texte(valeurs.dateArreteCompte)),
    POSTE_INCORPORE: texte(valeurs.posteIncorpore),
    MONTANT_INCORPORE: nombreOuTiret(valeurs.montantIncorpore),
    DESCRIPTION_APPORT: texte(valeurs.descriptionApport),
    VALEUR_APPORT: nombreOuTiret(valeurs.valeurApport),
    COMMISSAIRE_APPORTS: texte(valeurs.commissaireApports),
    IS_COMMISSAIRE_DISPENSE: valeurs.dispenseCommissaire === "Oui, à l'unanimité",
    IS_APPORT_NUMERAIRE: valeurs.modeAugmentation === "Apport en numéraire",
    IS_COMPENSATION_CREANCES: valeurs.modeAugmentation === "Compensation de créances",
    IS_INCORPORATION_RESERVES: valeurs.modeAugmentation === "Incorporation de réserves",
    IS_APPORT_NATURE: valeurs.modeAugmentation === "Apport en nature",
    NB_PARTS_CEDEES: cessions[0]
      ? nombreOuTiret(cessions[0].PARTS as number)
      : nombreOuTiret(valeurs.nbPartsCedees),
    PRIX_CESSION: cessions[0] ? cessions[0].PRIX : nombreOuTiret(valeurs.prixCession),
    DATE_CESSION: cessions[0]?.DATE || texte(valeurs.dateCession),
    /*
     * En français, depuis la cession.
     *
     * Elle était cherchée dans un champ plat que le formulaire ne remplit plus depuis
     * que les cessions sont une liste : l'acte portait « prendra effet à compter du - ».
     */
    DATE_CESSION_FR: dateEnFrancais(
      cessions[0]?.DATE || (typeof valeurs.dateCession === "string" ? valeurs.dateCession : null)
    ),
    AGREMENT_REQUIS: texte(valeurs.agrementRequis),
    /*
     * L'agrément, déduit de la forme et du destinataire.
     *
     * L'acte de cession porte deux clauses, l'une pour le cas où l'agrément a été
     * donné, l'autre pour celui où il n'était pas requis : sans cette valeur, ni l'une
     * ni l'autre n'apparaissait.
     */
    IS_AGREMENT_REQUIS:
      texte(valeurs.agrementRequis) === "Oui" ||
      (contexte.cessions ?? []).some((c) => agrementDeDroit(societe.forme, c.vers).requis),

    /* ------------------------------------------ L'apport de titres à une holding */
    ...donneesDeLApport(societe, valeurs),

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
/**
 * Le procès-verbal qui convient.
 *
 * La forme ne suffit pas : une SASU dont deux associés sont saisis n'a plus d'associé
 * unique, et l'acte se contredisait dans sa propre en-tête - « DÉCISION DE L'ASSOCIÉ
 * UNIQUE » suivi de deux noms détenant chacun des parts. Une cession d'actions à un
 * tiers fait précisément passer une société unipersonnelle à plusieurs associés : le
 * cas n'est pas rare, il est l'un des plus courants.
 *
 * Le nombre d'associés, quand on le connaît, l'emporte donc sur le sigle.
 */
export function gabaritProcesVerbal(
  forme: string | null | undefined,
  nombreDAssocies?: number
): string {
  const f = (forme ?? "").trim().toUpperCase();
  const unipersonnelle = f === "SASU" || f === "EURL";
  const plusieurs = nombreDAssocies !== undefined && nombreDAssocies > 1;

  /*
   * L'EURL est une SARL : ses titres sont des parts sociales, non des actions.
   * Elle recevait le procès-verbal de SASU, qui parle d'actions d'un bout à l'autre.
   */
  if (f === "EURL" && !plusieurs) return "modif-pv-transfert-siege-eurl.docx";
  if (unipersonnelle && !plusieurs) return "modif-pv-transfert-siege-sasu.docx";
  if (f === "SCI") return "modif-pv-transfert-siege-sci.docx";
  if (f === "SARL" || f === "EURL") return "modif-pv-transfert-siege-sarl.docx";
  return "modif-pv-transfert-siege-sas.docx";
}

/**
 * Ce que le traité d'apport a besoin de savoir.
 *
 * Trois entités s'y croisent : l'apporteur, personne physique décrite avec son état
 * civil ; la société bénéficiaire, qui est celle du dossier et dont le capital
 * augmente ; et la société dont les titres sont apportés, qui ne change pas mais que
 * l'acte doit désigner sans ambiguïté.
 *
 * Tout ce qui se calcule est calculé ici plutôt que saisi : le capital après chaque
 * augmentation, le nombre de titres émis, la part de l'apport dans le capital final,
 * le régime fiscal. Le modèle dont ce gabarit est tiré portait ces valeurs à la main,
 * et son pourcentage - 49,18 % - n'était vrai que pour ses propres chiffres.
 */
function donneesDeLApport(
  societe: SocieteModifiee,
  valeurs: Valeurs
): Record<string, string | number | boolean> {
  const enCentimes = (euros: number) => Math.round(euros * 100);
  const enEuros = (centimes: number) => centimes / 100;

  const nb = (cle: string): number => {
    const v = valeurs[cle];
    if (typeof v === "number") return v;
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const valeurApport = nb("apportValeur");
  const numeraire = nb("apportNumeraire");
  const nominale = nb("apportNominaleBeneficiaire");
  const capitalActuel = societe.capital ?? 0;

  const plan = planDeCapital({
    capitalActuelCentimes: enCentimes(capitalActuel),
    numeraireCentimes: enCentimes(numeraire),
    valeurApportCentimes: enCentimes(valeurApport),
  });

  const verdict = evaluationDesApports({
    formeBeneficiaire: societe.forme,
    valeurApportCentimes: plan.valeurApportCentimes,
    capitalFinalCentimes: plan.capitalFinalCentimes,
    commissaireVolontaire: texte(valeurs.apportCommissaire) === "Oui",
  });

  const fiscal = regimeApport(texte(valeurs.apportControle) !== "Non");

  /* Le nombre de titres émis découle de la valeur nominale : il ne se saisit pas. */
  const titresNumeraire = nominale > 0 ? Math.round(numeraire / nominale) : 0;
  const titresNature = nominale > 0 ? Math.round(valeurApport / nominale) : 0;

  const titresApportes = nb("apportNbTitres");
  const titresApporteeTotal = nb("apporteeNbTitres");
  const partDetenue =
    titresApporteeTotal > 0
      ? Math.round((titresApportes / titresApporteeTotal) * 10000) / 100
      : 0;

  const formeApportee = texte(valeurs.apporteeForme);
  const motTitresApportee = /^(SARL|EURL|SCI|SNC|SCP)/i.test(formeApportee)
    ? "parts sociales"
    : "actions";

  const qualite = texte(valeurs.apporteurQualite);

  return {
    /* --------------------------------------------------------- L'apporteur */
    APPORTEUR_NOM: ou(texte(valeurs.apporteurNomComplet)),
    APPORTEUR_NE_LE_FR: dateEnFrancais(texteBrut(valeurs.apporteurNeLe)),
    APPORTEUR_NE_A: ou(texte(valeurs.apporteurNeA)),
    APPORTEUR_NATIONALITE: ou(texte(valeurs.apporteurNationalite), "française"),
    APPORTEUR_ADRESSE: ou(texte(valeurs.apporteurAdresse)),
    APPORTEUR_QUALITE: ou(qualite),
    /*
     * « en sa qualité d'associé unique », non « de Associé unique ».
     *
     * La qualité est un libellé de liste, capitalisé et destiné à un écran. Reprise
     * telle quelle au fil d'une phrase, elle donne une majuscule au milieu d'un acte
     * et une élision fautive. L'acte emploie donc cette forme-ci.
     */
    APPORTEUR_QUALITE_DE: qualite ? avecElision(qualite.toLowerCase()) : TIRET,
    /*
     * L'apporteur signe-t-il des deux côtés ?
     *
     * Quand il représente aussi la société qui reçoit, il contracte avec lui-même :
     * l'article 1161 du code civil l'interdit sauf autorisation, que l'acte doit
     * porter. Sans cette clause, le traité est annulable.
     */
    IS_APPORTEUR_REPRESENTANT: qualite.includes("représentant légal"),
    IS_APPORTEUR_ASSOCIE_UNIQUE: qualite.startsWith("Associé unique"),

    /* ------------------------------------------- La société dont les titres viennent */
    APPORTEE_DENOMINATION: ou(texte(valeurs.apporteeDenomination)),
    APPORTEE_FORME: ou(formeApportee),
    APPORTEE_FORME_EN_CLAIR: formeEnToutesLettres(formeApportee).toLowerCase(),
    APPORTEE_SIREN: ou(texte(valeurs.apporteeSiren)),
    APPORTEE_SIEGE: ou(texte(valeurs.apporteeSiege)),
    APPORTEE_RCS_VILLE: ou(texte(valeurs.apporteeRcs)),
    APPORTEE_RCS_DE: avecElision(texte(valeurs.apporteeRcs)),
    APPORTEE_CAPITAL_FORMATE: montant(nb("apporteeCapital")),
    APPORTEE_CAPITAL_LETTRES: nombreEnFrancais(nb("apporteeCapital")),
    APPORTEE_NB_TITRES: montant(titresApporteeTotal),
    APPORTEE_NB_TITRES_LETTRES: nombreEnFrancais(titresApporteeTotal),
    APPORTEE_NOMINALE_FORMATE: montant(nb("apporteeNominale")),
    APPORTEE_NOMINALE_LETTRES: nombreEnFrancais(nb("apporteeNominale")),
    APPORTEE_MOT_TITRES: motTitresApportee,
    APPORTEE_DATE_STATUTS_FR: dateEnFrancais(texteBrut(valeurs.apporteeDateStatuts)),

    /* ------------------------------------------------------ Les titres apportés */
    APPORT_NB_TITRES: montant(titresApportes),
    APPORT_NB_TITRES_LETTRES: nombreEnFrancais(titresApportes),
    APPORT_PART_DETENUE: String(partDetenue).replace(".", ","),
    APPORT_NUMEROTATION: texte(valeurs.apportNumerotation),
    IS_APPORT_NUMEROTE: texteBrut(valeurs.apportNumerotation).length > 0,
    /* En minuscule : l'acte l'emploie en milieu de phrase, « à la suite d'une … ». */
    APPORT_ORIGINE: ou(texte(valeurs.apportOrigineTitres).toLowerCase()),

    /* ------------------------------------------------------- La valorisation */
    APPORT_VALEUR_FORMATE: montant(valeurApport),
    APPORT_VALEUR_LETTRES: nombreEnFrancais(valeurApport),
    APPORT_METHODE: ou(texte(valeurs.apportMethodeValorisation)),

    /* ------------------------------------------------- Le plan de capital */
    IS_DOUBLE_AUGMENTATION: numeraire > 0,
    APPORT_NUMERAIRE_FORMATE: montant(numeraire),
    APPORT_NUMERAIRE_LETTRES: nombreEnFrancais(numeraire),
    APPORT_NOMINALE_FORMATE: montant(nominale),
    APPORT_NOMINALE_LETTRES: nombreEnFrancais(nominale),
    APPORT_TITRES_NUMERAIRE: montant(titresNumeraire),
    APPORT_TITRES_NUMERAIRE_LETTRES: nombreEnFrancais(titresNumeraire),
    APPORT_TITRES_NATURE: montant(titresNature),
    APPORT_TITRES_NATURE_LETTRES: nombreEnFrancais(titresNature),
    CAPITAL_AVANT_FORMATE: montant(capitalActuel),
    CAPITAL_AVANT_LETTRES: nombreEnFrancais(capitalActuel),
    CAPITAL_APRES_NUMERAIRE_FORMATE: montant(enEuros(plan.capitalApresNumeraireCentimes)),
    CAPITAL_APRES_NUMERAIRE_LETTRES: nombreEnFrancais(
      enEuros(plan.capitalApresNumeraireCentimes)
    ),
    CAPITAL_FINAL_FORMATE: montant(enEuros(plan.capitalFinalCentimes)),
    CAPITAL_FINAL_LETTRES: nombreEnFrancais(enEuros(plan.capitalFinalCentimes)),
    APPORT_PART_CAPITAL: String(plan.partDeLApport).replace(".", ","),

    /* -------------------------------------------- Le commissaire aux apports */
    IS_APPORT_COMMISSAIRE: verdict.commissaireRequis,
    IS_APPORT_DISPENSE: !verdict.commissaireRequis,
    APPORT_DISPENSE_MOTIFS: verdict.motifs.join(" "),
    APPORT_COMMISSAIRE_NOM: texte(valeurs.apportCommissaireNom),

    /* --------------------------------------------------------- Le régime fiscal */
    IS_APPORT_REPORT: fiscal.regime === "report",
    IS_APPORT_SURSIS: fiscal.regime === "sursis",
    APPORT_ARTICLE_FISCAL: fiscal.article,
    APPORT_REGIME_LIBELLE: fiscal.libelle,
    REMPLOI_QUOTA: String(Math.round(REMPLOI.quota * 100)),
    REMPLOI_DELAI_MOIS: String(REMPLOI.delaiMois),
    REMPLOI_CONSERVATION_ANS: String(REMPLOI.conservationAns),
    REMPLOI_FRANCHISE_ANS: String(REMPLOI.franchiseAns),

    /* ---------------------------------------------------------------- Divers */
    APPORT_DATE_EFFET_FR: dateEnFrancais(texteBrut(valeurs.apportDateEffet)),
    APPORT_DATE_LIMITE_FR: dateEnFrancais(texteBrut(valeurs.apportDateLimiteCondition)),
    APPORT_LIEU_SIGNATURE: ou(texte(valeurs.apportLieuSignature)),
    APPORT_DATE_SIGNATURE_FR: dateEnFrancais(texteBrut(valeurs.apportDateSignature)),
    APPORT_COUR_APPEL: ou(texte(valeurs.apportCourAppel)),
  };
}

export interface ActeAProduire {
  titre: string;
  gabarit: string;
}

/**
 * Les actes à produire.
 *
 * Le procès-verbal est unique et porte toutes les résolutions : c'est une seule
 * assemblée. L'acte de cession n'existe que s'il y a cession, et les statuts à jour se
 * font à l'éditeur, sur le document d'origine, non par un avenant qui les recopierait.
 */
export function actesAProduire(
  codes: string[],
  forme: string | null | undefined,
  valeurs: Valeurs = {},
  nombreDAssocies?: number
): ActeAProduire[] {
  if (codes.length === 0) return [];

  const choisies = definitions(codes);
  const actes: ActeAProduire[] = [
    {
      titre:
        choisies.length === 1
          ? "Procès-verbal - " + choisies[0].libelle
          : "Procès-verbal d'assemblée générale extraordinaire",
      gabarit: gabaritProcesVerbal(forme, nombreDAssocies),
    },
  ];

  if (codes.includes("cession_parts")) {
    actes.push({ titre: "Acte de cession de parts", gabarit: "modif-acte-cession.docx" });
  }

  /*
   * Le traité d'apport, distinct du procès-verbal.
   *
   * Le procès-verbal constate la décision de la société bénéficiaire ; le traité est
   * le contrat entre l'apporteur et elle, et c'est lui qui se produit en trois
   * exemplaires, s'enregistre auprès de l'administration et fonde le report
   * d'imposition. Les fondre en un seul acte priverait l'apporteur du sien.
   */
  if (codes.includes("apport_titres")) {
    actes.push({ titre: "Traité d'apport de titres", gabarit: "modif-traite-apport.docx" });
  }

  /*
   * Pas d'avenant aux statuts.
   *
   * Il reprenait, article par article, l'ancienne et la nouvelle rédaction - ce que
   * l'éditeur de statuts fait désormais sur le document d'origine, à l'endroit exact où
   * la clause se trouve. Produire les deux revenait à livrer deux versions de la même
   * chose, dont l'une pouvait contredire l'autre, et c'est la version retouchée que le
   * greffe attend.
   */

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
