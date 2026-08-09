import { prisma } from "./client";
import { evaluer, TropDeTentatives, type Quota } from "@/domain/contenu/limitation";

/**
 * Comptage des tentatives en base.
 *
 * La décision revient au domaine ; ce module se contente de lire et d'écrire.
 */

export async function verifierQuota(action: string, cle: string, quota: Quota): Promise<void> {
  const depuis = new Date(Date.now() - quota.fenetreMs);

  const tentatives = await prisma.tentatives.findMany({
    where: { action, cle, created_at: { gt: depuis } },
    select: { created_at: true },
  });

  const verdict = evaluer(
    quota,
    tentatives.map((t) => t.created_at)
  );
  if (!verdict.autorise) throw new TropDeTentatives(verdict.reessayerLe);
}

export async function enregistrerTentative(action: string, cle: string): Promise<void> {
  await prisma.tentatives.create({ data: { action, cle } });
}

/**
 * Efface les tentatives sorties de toutes les fenêtres.
 *
 * Sans ce nettoyage, la table grossit indéfiniment : chaque tentative y reste bien
 * après avoir cessé de compter. Appelé par une tâche planifiée.
 */
export async function purgerTentatives(plusVieuxQueMs = 24 * 60 * 60 * 1000): Promise<number> {
  const { count } = await prisma.tentatives.deleteMany({
    where: { created_at: { lt: new Date(Date.now() - plusVieuxQueMs) } },
  });
  return count;
}
