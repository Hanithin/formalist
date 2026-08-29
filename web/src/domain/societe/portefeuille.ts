/**
 * Les sociétés du client, reconstituées à partir de ses dossiers.
 *
 * Il n'y a pas de table des sociétés : la plateforme enregistre des formalités, et une
 * société n'existe que par les formalités qui la concernent. C'est cohérent tant qu'on
 * ne fait que des opérations ponctuelles, et cela cesse de l'être dès qu'on en fait
 * plusieurs sur la même entreprise - « Mes formalités » affiche alors quatre lignes
 * pour une seule société, sans jamais dire qu'il s'agit de la même.
 *
 * Ce module fait le regroupement. Il ne duplique ni la liste des formalités, qui
 * répond à « qu'est-ce qui est en cours », ni la bibliothèque, qui répond à « où est
 * ce document » : il répond à « qu'est-ce que je possède, et dans quel état ».
 *
 * La clé de regroupement est le SIREN quand il est connu. Il ne l'est pas pendant une
 * création - la société n'existe pas encore - et l'on se rabat alors sur la
 * dénomination normalisée. Deux dossiers de création portant le même nom sont donc
 * réunis, ce qui est le comportement voulu : c'est bien la même société en projet.
 */

export interface DossierDeSociete {
  id: number;
  type: string | null;
  /** Le libellé du dossier, qui porte le nom de la société et parfois sa phase. */
  societe: string;
  forme: string | null;
  siren: string | null;
  status: string | null;
  /** La sous-phase du cabinet : elle situe un dossier déjà confié. */
  sousPhase?: string | null;
  offre: string;
  etapeAffichee: number;
  majLe: Date | string;
  /** Les échéances que ce dossier porte, quand il en a. */
  limiteDepot?: string | null;
  termeDuMandat?: string | null;
  /**
   * L'exercice qu'un dépôt des comptes déclare, par sa date de clôture.
   *
   * C'est à cela qu'on reconnaît qu'une obligation annuelle a été levée : un dossier
   * « comptes » terminé sur l'exercice clos le 31 décembre 2027 acquitte celui-là, et
   * lui seul.
   */
  clotureDeclaree?: string | null;
  /** La clôture du premier exercice, quand la création la porte. */
  clotureDuPremierExercice?: string | null;
}

export interface Societe {
  /** Le SIREN, ou le nom normalisé : ce qui sert de clé dans l'adresse. */
  cle: string;
  denomination: string;
  forme: string | null;
  siren: string | null;
  /**
   * La clôture de son premier exercice, reprise du dossier qui la porte.
   *
   * Elle commande toutes ses obligations annuelles : approuver dans les six mois,
   * déposer dans le mois suivant. Sans elle, on ne sait rien lui annoncer.
   */
  clotureDuPremierExercice: string | null;
  dossiers: DossierDeSociete[];
  /** Les dossiers qui ne sont ni terminés ni archivés. */
  enCours: number;
  /** La dernière fois qu'il s'est passé quelque chose. */
  majLe: Date;
}

const CLOS = new Set(["terminee", "archive"]);

/**
 * Le nom d'une société, débarrassé de ce que le libellé du dossier lui ajoute.
 *
 * Les parcours suffixent le libellé pour distinguer deux dossiers d'une même société :
 * « ATELIER MARCHAND - dissolution », « ATELIER MARCHAND - exercice 2025 ». Le suffixe
 * dit la formalité, non la société : il n'a rien à faire dans un portefeuille.
 */
export function nomDeLaSociete(libelle: string): string {
  return libelle.split(" - ")[0].trim();
}

/** La clé de comparaison : sans casse, sans accents, sans ponctuation. */
function normaliser(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function versDate(valeur: Date | string): Date {
  return valeur instanceof Date ? valeur : new Date(valeur);
}

export function regrouperEnSocietes(dossiers: DossierDeSociete[]): Societe[] {
  const par = new Map<string, Societe>();

  for (const dossier of dossiers) {
    const nom = nomDeLaSociete(dossier.societe);
    const siren = dossier.siren?.replace(/\s/g, "") || null;

    /*
     * Le SIREN d'abord, le nom à défaut.
     *
     * Un même nom peut désigner deux sociétés distinctes - homonymie - mais deux SIREN
     * identiques ne désignent jamais qu'une seule. Grouper par nom quand le SIREN
     * manque est le seul choix possible pendant une création, où il n'existe pas encore.
     */
    const cle = siren && siren.length === 9 ? siren : normaliser(nom);
    if (!cle) continue;

    const existante = par.get(cle);
    if (!existante) {
      par.set(cle, {
        cle,
        denomination: nom,
        forme: dossier.forme,
        siren,
        clotureDuPremierExercice: dossier.clotureDuPremierExercice ?? null,
        dossiers: [dossier],
        enCours: CLOS.has(dossier.status ?? "") ? 0 : 1,
        majLe: versDate(dossier.majLe),
      });
      continue;
    }

    existante.dossiers.push(dossier);
    if (!CLOS.has(dossier.status ?? "")) existante.enCours += 1;

    /*
     * La clôture se prend au premier dossier qui la porte.
     *
     * Seule la création la connaît ; les autres parcours n'ont pas à la redire. Une
     * société n'a qu'un premier exercice, et le premier dossier qui l'annonce est
     * celui qui l'a fixé.
     */
    if (!existante.clotureDuPremierExercice && dossier.clotureDuPremierExercice) {
      existante.clotureDuPremierExercice = dossier.clotureDuPremierExercice;
    }

    // Le renseignement le plus récent l'emporte : une société change de nom, de forme.
    const quand = versDate(dossier.majLe);
    if (quand > existante.majLe) {
      existante.majLe = quand;
      existante.denomination = nom;
      if (dossier.forme) existante.forme = dossier.forme;
    }
    if (siren && !existante.siren) existante.siren = siren;
  }

  for (const societe of par.values()) {
    societe.dossiers.sort((a, b) => versDate(b.majLe).getTime() - versDate(a.majLe).getTime());
  }

  return [...par.values()].sort((a, b) => b.majLe.getTime() - a.majLe.getTime());
}

/* ------------------------------------------------------------- Son état */

export type EtatDeSociete = "en-creation" | "active" | "en-fermeture" | "radiee";

export interface Etat {
  etat: EtatDeSociete;
  libelle: string;
  /** La teinte, dans le vocabulaire de statuts déjà employé ailleurs. */
  ton: "action" | "validation" | "termine" | "";
}

export type NatureDeDossier =
  | "creation"
  | "modification"
  | "comptes"
  | "fermeture"
  | "cessation"
  | "auto-entrepreneur"
  | "autre";

/**
 * Ce qu'est un dossier, quel que soit le texte qu'il porte.
 *
 * La colonne `type` n'est pas une énumération : les dossiers ouverts par le parcours
 * y écrivent « creation », ceux repris de l'ancienne application « Création SAS ». Les
 * écrans qui comparaient à la chaîne exacte se trompaient sur les seconds - l'état
 * d'une société en cours d'immatriculation s'affichait « Active », quand sa propre
 * fiche annonçait « En cours d'immatriculation » deux clics plus loin.
 *
 * On reconnaît donc par le début du mot, sans accent ni casse. « Dépôt des comptes »
 * et « comptes » désignent la même chose ; ce qui ne se reconnaît pas reste « autre »,
 * et n'entraîne aucune conclusion.
 */
export function natureDuDossier(type: string | null | undefined): NatureDeDossier {
  const net = (type ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (!net) return "autre";
  if (net.startsWith("auto-entrepreneur") || net.startsWith("auto entrepreneur")) {
    return "auto-entrepreneur";
  }
  if (net.startsWith("creation")) return "creation";
  if (net.startsWith("modification")) return "modification";
  if (net.startsWith("cessation")) return "cessation";
  if (net.startsWith("fermeture")) return "fermeture";
  // « comptes », « depot », « depot des comptes » : la même formalité, trois écritures.
  if (net.startsWith("comptes") || net.startsWith("depot")) return "comptes";
  return "autre";
}

const FERMETURES = new Set<NatureDeDossier>(["fermeture", "cessation"]);
const NAISSANCES = new Set<NatureDeDossier>(["creation", "auto-entrepreneur"]);

/**
 * L'état juridique, déduit de ses dossiers.
 *
 * Une société n'a pas de colonne « statut » : c'est ce qu'on lui a fait qui le dit.
 * Une fermeture terminée la radie ; une fermeture en cours la met en sortie ; une
 * création non terminée signifie qu'elle n'existe pas encore. Le reste est actif.
 *
 * Un dossier dont on ne reconnaît pas la nature ne conclut rien : il ne rend pas la
 * société active pour autant, il la laisse au cas suivant.
 */
export function etatDeLaSociete(societe: Societe): Etat {
  const ouverts = societe.dossiers.filter((d) => !CLOS.has(d.status ?? ""));

  if (
    societe.dossiers.some(
      (d) => FERMETURES.has(natureDuDossier(d.type)) && d.status === "terminee"
    )
  ) {
    return { etat: "radiee", libelle: "Radiée", ton: "" };
  }
  if (ouverts.some((d) => FERMETURES.has(natureDuDossier(d.type)))) {
    return { etat: "en-fermeture", libelle: "En fermeture", ton: "action" };
  }
  if (ouverts.some((d) => NAISSANCES.has(natureDuDossier(d.type)))) {
    return { etat: "en-creation", libelle: "En création", ton: "validation" };
  }
  return { etat: "active", libelle: "Active", ton: "termine" };
}

/* ---------------------------------------------------------- L'intitulé */

/**
 * « Ma société » ou « Mes sociétés ».
 *
 * Un client qui n'en a qu'une lit « Mes sociétés » comme une promesse d'en avoir
 * plusieurs, ou comme un menu qui ne le concerne pas. Le singulier lui dit que la page
 * parle de la sienne.
 */
export function libelleDuPortefeuille(nombre: number): string {
  return nombre === 1 ? "Ma société" : "Mes sociétés";
}

/**
 * Ce que la colonne « Formalités » annonce pour une société.
 *
 * Elle affichait le total, puis le nombre en cours : « 2 · 2 en cours ». Deux nombres
 * côte à côte dont le premier ne dit pas de quoi il parle - la colonne est déjà
 * intitulée - et qui se répètent quand tout est en cours. On lisait « 2 · 2 » avant de
 * comprendre qu'il s'agissait du même chiffre vu deux fois.
 *
 * Trois cas, trois phrases. Rien en cours : le total seul, avec son nom pour que le
 * nombre ne flotte pas. Tout en cours : ce qui avance, sans redite. Entre les deux :
 * la part, qui est la seule chose que le lecteur cherche.
 *
 * Aucun mot ne qualifie les dossiers clos : « terminées » serait faux pour un dossier
 * archivé ou rejeté, et cette colonne n'a pas de quoi les distinguer.
 */
export function libelleDesFormalites(total: number, enCours: number): string {
  if (total <= 0) return "—";
  if (enCours <= 0) return total === 1 ? "1 formalité" : total + " formalités";
  if (enCours >= total) return enCours === 1 ? "1 en cours" : total + " en cours";
  return enCours + " en cours sur " + total;
}
