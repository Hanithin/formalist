/**
 * Ce que l'accueil doit dire, et dans quel ordre.
 *
 * La page répondait à « voici vos dossiers ». Elle doit répondre à « qu'est-ce qui
 * m'attend aujourd'hui ». La différence n'est pas cosmétique : un même dossier y
 * apparaissait trois fois - dans le bandeau de reprise, dans les vignettes, et dans la
 * liste des attentes - si bien qu'un compte à vingt dossiers affichait vingt fois la
 * même phrase sans jamais dire ce qui pressait.
 *
 * Quatre questions, quatre réponses, et chacune ne se donne qu'une fois :
 *
 *   - ai-je quelque chose à faire ? les trois chiffres, puis les actions requises ;
 *   - que reprendre tout de suite ? le dossier mis en avant, et lui seul ;
 *   - qu'est-ce qui est en cours ? les formalités, avec leur avancement ;
 *   - qu'est-ce qui arrive ? les échéances, quand la date est connue.
 *
 * Une société n'est pas une formalité. La section s'appelait « Vos sociétés » et
 * montrait des barres d'avancement et des boutons « Continuer » : ce sont des
 * dossiers. Le mot est ici tenu à sa place.
 */

import { attentesOrdonnees, type ActionAttendue, type ActionDeDossier } from "./actions";

export interface DossierDAccueil {
  id: number;
  societe: string;
  forme: string | null;
  type: string | null;
  status: string | null;
  offre: string;
  etapeAffichee: number;
  prochaineEtape: string;
  attendLeClient: boolean;
  actions: ActionAttendue[];
  nonLus: number;
}

/* ------------------------------------------------------------ Les chiffres */

export interface Indicateurs {
  enCours: number;
  actionsRequises: number;
  enValidation: number;
}

const CLOS = new Set(["terminee", "archive"]);

/**
 * Trois chiffres, et pas un de plus.
 *
 * « En validation » compte les dossiers dont la balle est dans notre camp : le client
 * n'a rien à y faire, mais il veut savoir qu'ils avancent. Sans cette ligne, un compte
 * dont tout est chez l'avocat semble à l'arrêt.
 */
export function indicateurs(societes: DossierDAccueil[]): Indicateurs {
  const ouverts = societes.filter((s) => !CLOS.has(s.status ?? ""));

  return {
    enCours: ouverts.length,
    actionsRequises: ouverts.reduce((total, s) => total + s.actions.length, 0),
    enValidation: ouverts.filter((s) => !s.attendLeClient).length,
  };
}

/* --------------------------------------------------------- Ce qu'on reprend */

/**
 * Le dossier qu'on propose de reprendre.
 *
 * Le plus récemment touché parmi ceux qui attendent le client - la liste arrive déjà
 * triée par date de mise à jour. À défaut, aucun : mettre en avant un dossier qui
 * n'attend rien de lui invite à un geste qui n'existe pas.
 */
export function dossierAReprendre(societes: DossierDAccueil[]): DossierDAccueil | null {
  return societes.find((s) => !CLOS.has(s.status ?? "") && s.attendLeClient) ?? null;
}

/**
 * Ce qui requiert l'attention, sans répéter ce qui est déjà mis en avant.
 *
 * Les actions du dossier repris sont écartées : elles sont déjà à l'écran, dans le
 * bandeau, avec leur bouton. Les redire trois lignes plus bas donnait l'impression
 * d'une liste qui ne diminue jamais.
 */
export function attentionRequise(
  societes: DossierDAccueil[],
  saufDossier: number | null
): ActionDeDossier[] {
  return attentesOrdonnees(societes).filter((a) => a.dossierId !== saufDossier);
}

/* -------------------------------------------------------- Les échéances */

export type NatureEcheance = "depot-des-comptes" | "cloture-liquidation";

export interface Echeance {
  cle: string;
  nature: NatureEcheance;
  intitule: string;
  societe: string;
  /** La date limite, en ISO. */
  limite: string;
  /** Ce qu'on fait de cette échéance. */
  bouton: string;
  lien: string;
}

/**
 * Les échéances que les dossiers portent réellement.
 *
 * Nous n'avons pas de calendrier des obligations : rien dans la base ne dit qu'une
 * société doit tenir son assemblée en juin. On ne fabrique donc rien - la section
 * reste vide tant qu'aucune date n'est connue, ce qui est plus honnête qu'un exemple
 * qui ne bouge jamais.
 *
 * Deux dates existent pourtant, et elles comptent : la date limite de dépôt des
 * comptes, qui se déduit de la clôture de l'exercice saisie, et le terme du mandat du
 * liquidateur, au-delà duquel une liquidation doit être prorogée par le tribunal.
 */
export function echeancesDesDossiers(
  dossiers: {
    id: number;
    type: string | null;
    societe: string;
    status: string | null;
    limiteDepot?: string | null;
    termeDuMandat?: string | null;
  }[]
): Echeance[] {
  const echeances: Echeance[] = [];

  for (const dossier of dossiers) {
    if (CLOS.has(dossier.status ?? "")) continue;

    if (dossier.type === "comptes" && dossier.limiteDepot) {
      echeances.push({
        cle: "depot-" + dossier.id,
        nature: "depot-des-comptes",
        intitule: "Dépôt des comptes annuels",
        societe: dossier.societe,
        limite: dossier.limiteDepot,
        bouton: "Préparer",
        lien: "/depot-des-comptes?dossier=" + dossier.id,
      });
    }

    if (dossier.type === "fermeture" && dossier.termeDuMandat) {
      echeances.push({
        cle: "cloture-" + dossier.id,
        nature: "cloture-liquidation",
        intitule: "Clôture de la liquidation",
        societe: dossier.societe,
        limite: dossier.termeDuMandat,
        bouton: "Reprendre",
        lien: "/fermeture?dossier=" + dossier.id,
      });
    }
  }

  // La plus proche d'abord : c'est celle qui décide de la semaine.
  return echeances.sort((a, b) => a.limite.localeCompare(b.limite));
}

/** Une échéance passée n'est plus une échéance : c'est un retard. */
export function enRetard(echeance: Echeance, aujourdHui: Date = new Date()): boolean {
  return echeance.limite < aujourdHui.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------- Les statuts */

export type Ton = "action" | "validation" | "termine" | "";

/**
 * La teinte d'un dossier, et son mot.
 *
 * Trois états, pas quinze : ce qui attend le client, ce qui est chez nous, ce qui est
 * fini. Le jaune est réservé au premier - c'est le seul où la couleur demande quelque
 * chose. Le reste est neutre, sans quoi la page devient un sapin de Noël où plus rien
 * ne ressort.
 */
export function tonDuDossier(dossier: DossierDAccueil): { ton: Ton; libelle: string } {
  if (dossier.status === "terminee") return { ton: "termine", libelle: "Terminé" };
  if (dossier.status === "archive") return { ton: "", libelle: "Archivé" };
  if (dossier.attendLeClient) return { ton: "action", libelle: "Action requise" };
  return { ton: "validation", libelle: "En validation" };
}

/**
 * Le verbe du bouton, selon ce qu'on attend.
 *
 * « Continuer » sur un dossier qui n'attend rien du client est un mensonge poli : il
 * n'y a rien à continuer, il y a à regarder.
 */
export function gesteDuDossier(dossier: DossierDAccueil): string {
  if (dossier.status === "terminee") return "Consulter";
  if (!dossier.attendLeClient) return "Voir";
  return dossier.actions[0]?.bouton ?? "Continuer";
}
