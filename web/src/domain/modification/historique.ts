import type { Retouche } from "./edition";
import { definitionModification } from "./types";

/**
 * L'historique des retouches d'un document.
 *
 * Retoucher des statuts est un travail d'ajustements : on pose un cadre, on l'étire,
 * on écarte une page, on se ravise. Sans trace, une fausse manœuvre - une page
 * supprimée par mégarde, un cadre posé au mauvais endroit - se rattrape en refaisant
 * tout de mémoire.
 *
 * Chaque étape porte un état complet plutôt qu'une différence : revenir en arrière
 * devient un remplacement, non un calcul inverse, et un état ne peut pas se
 * reconstruire de travers. Les états sont petits - quelques cadres - et l'on en garde
 * un nombre borné.
 */

export interface EtatRetouche {
  retouches: Retouche[];
  pagesRetirees: number[];
  /**
   * Les changements que l'avocat a certifiés faits.
   *
   * Ils font partie de l'état, non d'un registre à côté : décocher par mégarde se
   * rattrape comme le reste, et revenir à une étape rend le dossier tel qu'il était,
   * suivi compris.
   */
  verifiees?: string[];
}

export interface EtapeDHistorique extends EtatRetouche {
  /** Quand, en ISO. */
  quand: string;
  /** Qui : le nom du compte qui a fait le geste. */
  qui: string;
  /** Ce qui a changé, en une ligne. */
  libelle: string;
}

/** Au-delà, on oublie le plus ancien : un historique n'est pas une archive. */
export const ETAPES_GARDEES = 40;

/**
 * Deux retouches sont-elles identiques ?
 *
 * Toutes les propriétés comptent, y compris la mise en forme. En omettre une la
 * rendait invisible à la comparaison : un texte passé en gras était tenu pour
 * inchangé, l'enregistrement s'arrêtait là, et le geste était perdu au rechargement.
 *
 * Les positions se comparent au pixel : un cadre déplacé d'un demi-point pendant un
 * clic n'est pas un geste, et inscrirait une étape à chaque frémissement.
 */
function memeRetouche(a: Retouche, b: Retouche): boolean {
  return (
    a.page === b.page &&
    Math.round(a.x) === Math.round(b.x) &&
    Math.round(a.y) === Math.round(b.y) &&
    Math.round(a.largeur) === Math.round(b.largeur) &&
    Math.round(a.hauteur) === Math.round(b.hauteur) &&
    a.texte === b.texte &&
    a.taille === b.taille &&
    (a.police ?? "serif") === (b.police ?? "serif") &&
    (a.alignement ?? "gauche") === (b.alignement ?? "gauche") &&
    /*
     * L'inclinaison compte comme le reste.
     *
     * Sans elle, pencher un cadre laissait l'état « inchangé » : l'enregistrement
     * repartait sans rien écrire, et l'inclinaison disparaissait au premier
     * rafraîchissement.
     */
    (a.angle ?? 0) === (b.angle ?? 0) &&
    !!a.gras === !!b.gras &&
    !!a.italique === !!b.italique &&
    !!a.souligne === !!b.souligne &&
    memesFragments(a, b)
  );
}

/**
 * Le découpage du texte, qui porte le gras d'un seul mot.
 *
 * Un cadre sans découpage et un cadre découpé en un seul morceau sans mise en forme
 * disent la même chose : la saisie produit l'un ou l'autre selon qu'on y a touché.
 * Les comparer tels quels faisait passer un simple clic dans le cadre pour un
 * changement de mise en forme, inscrit comme tel dans l'historique.
 */
function memesFragments(a: Retouche, b: Retouche): boolean {
  const gauche = fragmentsCompares(a);
  const droite = fragmentsCompares(b);
  if (gauche.length !== droite.length) return false;

  return gauche.every((f, i) => {
    const autre = droite[i];
    return (
      f.texte === autre.texte &&
      f.gras === autre.gras &&
      f.italique === autre.italique &&
      f.souligne === autre.souligne
    );
  });
}

/** Le découpage ramené à sa forme comparable : jamais vide, drapeaux explicites. */
function fragmentsCompares(retouche: Retouche) {
  const morceaux = (retouche.fragments ?? []).filter((f) => f.texte !== "");

  if (morceaux.length === 0) {
    return [
      {
        texte: retouche.texte,
        gras: !!retouche.gras,
        italique: !!retouche.italique,
        souligne: !!retouche.souligne,
      },
    ];
  }

  return morceaux.map((f) => ({
    texte: f.texte,
    gras: !!f.gras,
    italique: !!f.italique,
    souligne: !!f.souligne,
  }));
}

/** Deux états sont-ils identiques ? Un geste sans effet ne fait pas une étape. */
export function memeEtat(avant: EtatRetouche, apres: EtatRetouche): boolean {
  if (avant.retouches.length !== apres.retouches.length) return false;
  if (avant.pagesRetirees.join(",") !== apres.pagesRetirees.join(",")) return false;
  if (certifiees(avant).join(",") !== certifiees(apres).join(",")) return false;
  return avant.retouches.every((r, i) => memeRetouche(r, apres.retouches[i]));
}

/** Les confirmations d'un état, triées : leur ordre d'arrivée ne les distingue pas. */
function certifiees(etat: EtatRetouche): string[] {
  return [...(etat.verifiees ?? [])].sort();
}

/** Le nom d'un changement, tel que l'avocat l'a demandé. */
function nommer(cle: string): string {
  return definitionModification(cle)?.libelleCourt ?? cle;
}

function pluriel(nombre: number, singulier: string, plurielMot: string): string {
  return nombre + " " + (nombre > 1 ? plurielMot : singulier);
}

/**
 * Ce qui a changé, dit en une ligne.
 *
 * « Modifié » ne dit rien quand on cherche à retrouver le geste qui a tout cassé. Le
 * libellé nomme donc ce qui est arrivé et sur quelle page, pour qu'on reconnaisse
 * l'étape sans avoir à l'essayer.
 */
export function decrireLeChangement(avant: EtatRetouche, apres: EtatRetouche): string {
  /*
   * La confirmation passe avant le reste : cocher « la durée est faite » est le geste
   * qu'on cherche en priorité dans l'historique - c'est celui qui engage.
   */
  const confirmes = certifiees(apres).filter((c) => !certifiees(avant).includes(c));
  const retires = certifiees(avant).filter((c) => !certifiees(apres).includes(c));

  if (confirmes.length > 0) return nommer(confirmes[0]) + " : confirmé";
  if (retires.length > 0) return nommer(retires[0]) + " : confirmation retirée";

  const ecartees = apres.pagesRetirees.filter((p) => !avant.pagesRetirees.includes(p));
  const remises = avant.pagesRetirees.filter((p) => !apres.pagesRetirees.includes(p));

  if (ecartees.length > 0) {
    return ecartees.length === 1
      ? "Page " + ecartees[0] + " écartée"
      : pluriel(ecartees.length, "page écartée", "pages écartées");
  }
  if (remises.length > 0) {
    return remises.length === 1
      ? "Page " + remises[0] + " remise"
      : pluriel(remises.length, "page remise", "pages remises");
  }

  const ecart = apres.retouches.length - avant.retouches.length;
  if (ecart > 0) {
    const ajoutee = apres.retouches[apres.retouches.length - 1];
    return ecart === 1 ? "Cadre ajouté page " + ajoutee.page : pluriel(ecart, "cadre ajouté", "cadres ajoutés");
  }
  if (ecart < 0) {
    return -ecart === 1 ? "Cadre supprimé" : pluriel(-ecart, "cadre supprimé", "cadres supprimés");
  }

  /*
   * Même nombre de cadres : c'est l'un d'eux qui a bougé. On dit lequel et en quoi,
   * plutôt que « modifié » - le texte, la position et la mise en forme ne se
   * rattrapent pas de la même façon.
   */
  for (let i = 0; i < apres.retouches.length; i++) {
    const a = avant.retouches[i];
    const b = apres.retouches[i];
    if (!a || memeRetouche(a, b)) continue;

    if (a.texte !== b.texte) return "Texte réécrit page " + b.page;
    if (Math.round(a.x) !== Math.round(b.x) || Math.round(a.y) !== Math.round(b.y)) {
      return "Cadre déplacé page " + b.page;
    }
    if (Math.round(a.largeur) !== Math.round(b.largeur) || Math.round(a.hauteur) !== Math.round(b.hauteur)) {
      return "Cadre redimensionné page " + b.page;
    }
    return "Mise en forme changée page " + b.page;
  }

  return "Retouche modifiée";
}

/**
 * L'historique après un nouveau geste.
 *
 * Un geste posé après un retour en arrière abandonne ce qui suivait : c'est la règle
 * de tout historique, et faire autrement laisserait un avenir qui ne découle plus de
 * l'état courant.
 */
export function inscrire(
  historique: EtapeDHistorique[],
  position: number,
  etape: EtapeDHistorique
): { historique: EtapeDHistorique[]; position: number } {
  const gardees = historique.slice(0, position + 1);
  const suite = [...gardees, etape].slice(-ETAPES_GARDEES);
  return { historique: suite, position: suite.length - 1 };
}

/** L'étape où l'on se trouve, ou rien si l'historique est vide. */
export function etapeCourante(
  historique: EtapeDHistorique[],
  position: number
): EtapeDHistorique | null {
  return historique[position] ?? null;
}

export function peutRevenir(position: number): boolean {
  return position > 0;
}

export function peutAvancer(historique: EtapeDHistorique[], position: number): boolean {
  return position < historique.length - 1;
}

/** Une position ramenée dans les bornes : une valeur venue du réseau se vérifie. */
export function positionValide(historique: EtapeDHistorique[], demandee: number): number {
  if (!Number.isInteger(demandee)) return historique.length - 1;
  return Math.min(Math.max(0, demandee), Math.max(0, historique.length - 1));
}
