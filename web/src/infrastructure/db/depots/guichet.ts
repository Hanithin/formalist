import { prisma } from "../client";
import { enProduction } from "@/infrastructure/guichet/transport";
import {
  referenceDuDossier,
  type DepotAuGuichet,
} from "@/infrastructure/guichet/formalites";

/**
 * Ce que nous savons des dépôts faits au guichet unique.
 *
 * Une copie locale, tenue à jour par synchronisation. Elle sert à deux choses que
 * l'appel direct ne rend pas : afficher un état sans dépendre de la disponibilité de
 * l'INPI, et retrouver le dossier d'un dépôt sans parcourir la liste entière.
 */

/**
 * L'environnement d'où vient la ligne.
 *
 * Un dépôt de démonstration porte un identifiant qui ressemble à un dépôt de
 * production. Sans cette colonne, une bascule d'environnement ferait consulter l'un en
 * croyant lire l'autre - et c'est le genre d'erreur qui ne se voit qu'après.
 */
function environnement(): string {
  return enProduction() ? "production" : "demonstration";
}

export interface DepotConnu {
  dossierId: number;
  formaliteId: number | null;
  reference: string;
  statut: string | null;
  statutLe: Date | null;
  numNat: string | null;
  vuLe: Date | null;
}

function versDepotConnu(ligne: {
  dossier_id: number;
  formalite_id: number | null;
  reference: string;
  statut: string | null;
  statut_le: Date | null;
  num_nat: string | null;
  vu_le: Date | null;
}): DepotConnu {
  return {
    dossierId: ligne.dossier_id,
    formaliteId: ligne.formalite_id,
    reference: ligne.reference,
    statut: ligne.statut,
    statutLe: ligne.statut_le,
    numNat: ligne.num_nat,
    vuLe: ligne.vu_le,
  };
}

export async function depotConnu(dossierId: number): Promise<DepotConnu | null> {
  const ligne = await prisma.depots_guichet.findFirst({
    where: { dossier_id: dossierId, environnement: environnement() },
  });
  return ligne ? versDepotConnu(ligne) : null;
}

/**
 * Enregistre ce que le guichet vient de dire d'un dossier.
 *
 * Un dossier n'a qu'un dépôt par environnement : redéposer remplace, il n'empile pas.
 * `vu_le` prend l'heure de la lecture, `statut_le` celle que le guichet attache à son
 * changement d'état - deux dates différentes, et c'est la première qui dit si notre
 * copie est fraîche.
 */
export async function noterLeDepot(
  dossierId: number,
  depot: Pick<DepotAuGuichet, "id" | "statut" | "statutLe" | "numNat">
): Promise<void> {
  const env = environnement();
  const valeurs = {
    formalite_id: depot.id,
    statut: depot.statut,
    statut_le: depot.statutLe ? new Date(depot.statutLe) : null,
    num_nat: depot.numNat,
    vu_le: new Date(),
    updated_at: new Date(),
  };

  await prisma.depots_guichet.upsert({
    where: { dossier_id_environnement: { dossier_id: dossierId, environnement: env } },
    update: valeurs,
    create: {
      dossier_id: dossierId,
      reference: referenceDuDossier(dossierId),
      environnement: env,
      ...valeurs,
    },
  });
}

/**
 * Les dépôts que l'on suit, du plus récemment remué au plus ancien.
 *
 * Sert à la synchronisation : on ne redemande pas au guichet l'état d'un dépôt dont on
 * sait qu'il est terminé - le tri des états terminaux se fait dans le domaine, ici on
 * rend la matière.
 */
export async function depotsSuivis(): Promise<DepotConnu[]> {
  const lignes = await prisma.depots_guichet.findMany({
    where: { environnement: environnement() },
    orderBy: [{ statut_le: "desc" }, { updated_at: "desc" }],
  });
  return lignes.map(versDepotConnu);
}
