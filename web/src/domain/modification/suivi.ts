import { definitionModification } from "./types";
import type { Introuvable, Rectangle, Retouche, Zone } from "./edition";

/**
 * Où en est l'avocat, changement par changement.
 *
 * Le panneau comptait des cadres : « 2 sur 2 remplacements posés » pendant que la
 * durée n'était pas faite et que la dénomination ne l'était qu'à un endroit sur
 * quatorze. Un cadre n'est pas un changement - un changement en demande autant qu'il
 * a d'occurrences dans l'acte, et le seul décompte qui vaille est celui-là.
 *
 * Deux niveaux, volontairement distincts :
 *
 * - ce que la machine constate : tel emplacement porte un cadre, ou n'en porte pas ;
 * - ce que l'avocat certifie : la coche, qui seule vaut « c'est fait ».
 *
 * Cocher automatiquement dès que les cadres sont posés donnerait une assurance
 * fausse : le repérage peut manquer une occurrence écrite autrement, et un cadre peut
 * contenir n'importe quoi. La machine dit ce qu'elle voit, l'avocat dit ce qu'il sait.
 */

export type EtatDeChangement = "a_placer" | "partiel" | "couvert" | "confirme";

export interface Emplacement {
  /** Le changement que cet emplacement sert. */
  cle: string;
  /** Le rang de l'occurrence dans l'acte, à partir de 1. */
  occurrence: number;
  /** La hauteur de police mesurée, pour poser un cadre à la bonne taille. */
  taille: number;
  page: number;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** Un cadre s'y superpose. */
  couvert: boolean;
}

export interface ChangementSuivi {
  cle: string;
  /** Le nom du changement, tel que l'avocat l'a demandé. */
  titre: string;
  /** L'article des statuts visé, quand on le connaît. */
  article: string;
  ancien: string;
  nouveau: string;
  emplacements: Emplacement[];
  couverts: number;
  /**
   * Le repérage n'a rien trouvé : rien à cocher tant que l'avocat n'a pas placé le
   * cadre lui-même. On sait parfois mener à l'article.
   */
  situe: boolean;
  articleTrouve?: Rectangle;
  confirme: boolean;
  etat: EtatDeChangement;
}

/** Un cadre recouvre-t-il cet emplacement ? */
function recouvre(emplacement: Rectangle, retouche: Retouche): boolean {
  if (retouche.page !== emplacement.page) return false;

  const largeur =
    Math.min(emplacement.x + emplacement.largeur, retouche.x + retouche.largeur) -
    Math.max(emplacement.x, retouche.x);
  const hauteur =
    Math.min(emplacement.y + emplacement.hauteur, retouche.y + retouche.hauteur) -
    Math.max(emplacement.y, retouche.y);
  if (largeur <= 0 || hauteur <= 0) return false;

  /*
   * La moitié suffit.
   *
   * Un cadre déplacé de quelques points pour aérer la ligne couvre toujours le
   * passage ; exiger le recouvrement exact ferait repasser en « à placer » un
   * emplacement traité, et l'avocat le referait une seconde fois.
   */
  const aire = emplacement.largeur * emplacement.hauteur;
  return aire > 0 && (largeur * hauteur) / aire >= 0.5;
}

/**
 * L'état d'avancement de chaque changement demandé.
 *
 * L'ordre suit celui des changements demandés : ce qui n'est pas repéré ne passe pas
 * à la fin, sinon on le découvre après avoir cru le dossier fini.
 */
export function suivreLesChangements(
  zones: Zone[],
  introuvables: Introuvable[],
  retouches: Retouche[],
  verifiees: string[] = []
): ChangementSuivi[] {
  const cles: string[] = [];
  for (const source of [...zones.map((z) => z.cle), ...introuvables.map((i) => i.recherche.cle)]) {
    if (!cles.includes(source)) cles.push(source);
  }

  return cles.map((cle) => {
    const siennes = zones.filter((z) => z.cle === cle);
    const manque = introuvables.find((i) => i.recherche.cle === cle);
    const recherche = siennes[0] ?? manque?.recherche;
    const cadres = retouches.filter((r) => r.cle === cle);

    const emplacements: Emplacement[] = siennes.flatMap((zone) =>
      zone.rectangles.map((rectangle) => ({
        cle,
        occurrence: zone.occurrence,
        taille: Math.round(zone.taille * 10) / 10,
        page: rectangle.page,
        x: rectangle.x,
        y: rectangle.y,
        largeur: rectangle.largeur,
        hauteur: rectangle.hauteur,
        couvert: cadres.some((r) => recouvre(rectangle, r)),
      }))
    );

    const couverts = emplacements.filter((e) => e.couvert).length;
    const confirme = verifiees.includes(cle);
    const situe = emplacements.length > 0;

    return {
      cle,
      titre: definitionModification(cle)?.libelleCourt ?? recherche?.article ?? cle,
      article: recherche?.article ?? "",
      ancien: siennes[0]?.trouve ?? recherche?.cherche ?? "",
      nouveau: recherche?.propose ?? "",
      emplacements,
      couverts,
      situe,
      articleTrouve: manque?.article,
      confirme,
      etat: etatDe({ situe, cadres: cadres.length, total: emplacements.length, couverts, confirme }),
    };
  });
}

function etatDe(compte: {
  situe: boolean;
  cadres: number;
  total: number;
  couverts: number;
  confirme: boolean;
}): EtatDeChangement {
  if (compte.confirme) return "confirme";

  /*
   * Un changement non repéré sur lequel un cadre a été posé à la main n'est plus « à
   * placer » : la machine n'a rien à en dire, mais l'avocat, si.
   */
  if (!compte.situe) return compte.cadres > 0 ? "couvert" : "a_placer";

  if (compte.couverts === 0) return "a_placer";
  return compte.couverts >= compte.total ? "couvert" : "partiel";
}

/**
 * Le cadre qui couvre cet emplacement, s'il en existe un.
 *
 * Le rang, non l'objet : l'éditeur désigne les cadres par leur position dans la liste,
 * et c'est elle qu'il faut pour ouvrir la saisie.
 */
export function cadreCouvrant(retouches: Retouche[], emplacement: Emplacement): number {
  return retouches.findIndex((r) => r.cle === emplacement.cle && recouvre(emplacement, r));
}

/** Ce qui n'est pas encore certifié, dans l'ordre où l'avocat le rencontrera. */
export function nonConfirmes(suivi: ChangementSuivi[]): ChangementSuivi[] {
  return suivi.filter((c) => !c.confirme);
}

/*
 * Ce que dit chaque état, tourné vers le geste à faire.
 *
 * « Aucun cadre posé » décrit un manque ; « à placer » dit quoi faire. C'est le même
 * fait, mais l'un fait chercher ce qui ne va pas et l'autre fait avancer.
 */
export const ETATS: Record<EtatDeChangement, { libelle: string; mention: string }> = {
  a_placer: { libelle: "À placer", mention: "posez le cadre sur le passage" },
  partiel: { libelle: "En cours", mention: "il reste des emplacements à couvrir" },
  couvert: { libelle: "Couvert", mention: "relisez, puis cochez" },
  confirme: { libelle: "Fait", mention: "vérifié par le cabinet" },
};
