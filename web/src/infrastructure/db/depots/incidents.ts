import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import type { UtilisateurConnecte } from "../sessions";
import { observer, estUnIncident } from "@/domain/exploitation/incident";
import { journal } from "@/lib/journal";

/**
 * Le journal des incidents, tenu en base plutôt qu'à la sortie du conteneur.
 *
 * Les erreurs partaient dans la sortie standard : lisibles tant qu'on regarde, perdues
 * au redéploiement, et jamais consultées puisque rien n'en annonce l'arrivée. Le seul
 * détecteur de panne était le client qui écrit pour dire que ça n'a pas marché.
 *
 * Une ligne par signature, avec son compteur. Consigner ne doit jamais faire échouer ce
 * qui échouait déjà : toutes les écritures d'ici sont enveloppées, et une base
 * injoignable - cause fréquente de l'erreur qu'on essaie justement d'écrire - laisse le
 * message au journal de sortie sans rien casser de plus.
 */

/** Au-delà, la liste ne se lit plus : ce qui compte est en tête. */
const PAGE = 60;

/** Un incident résolu depuis trois mois n'apprend plus rien. */
const RETENTION_JOURS = 90;

export interface IncidentAffiche {
  id: number;
  type: string;
  message: string;
  chemin: string | null;
  methode: string | null;
  origine: string | null;
  pile: string | null;
  occurrences: number;
  premiereLe: Date;
  derniereLe: Date;
  resoluLe: Date | null;
}

function exigerAdmin(utilisateur: UtilisateurConnecte) {
  if (!utilisateur.roles.includes("admin")) throw new Interdit("Réservé à l'administration");
}

/**
 * Consigne une erreur, sans jamais lever la sienne.
 *
 * La même signature rencontrée deux fois n'ajoute pas de ligne : elle incrémente le
 * compteur et déplace la date. Un incident qu'on avait marqué résolu et qui revient se
 * rouvre - une panne réapparue n'est pas une panne réglée, et la laisser close
 * reviendrait à ne plus jamais la revoir.
 */
export async function consignerIncident(
  valeur: unknown,
  contexte: {
    chemin?: string | null;
    methode?: string | null;
    origine?: string | null;
  } = {}
): Promise<void> {
  if (!estUnIncident(valeur)) return;

  try {
    const incident = observer(valeur, contexte);

    await prisma.$executeRaw`
      INSERT INTO incidents (empreinte, type, message, chemin, methode, origine, pile)
      VALUES (${incident.empreinte}, ${incident.type}, ${incident.message}, ${incident.chemin},
              ${incident.methode}, ${incident.origine}, ${incident.pile})
      ON CONFLICT (empreinte) DO UPDATE SET
        occurrences    = incidents.occurrences + 1,
        derniere_le    = NOW(),
        chemin         = COALESCE(EXCLUDED.chemin, incidents.chemin),
        resolu_le      = NULL,
        resolu_par     = NULL
    `;
  } catch (e) {
    /* Écrire l'incident a échoué : c'est souvent que la base est la panne. On ne
       remplace pas une erreur par une autre - la sortie standard reste le dernier
       recours. */
    journal.error({ err: e }, "L'incident n'a pas pu être consigné");
  }
}

/**
 * Ce qu'il y a à regarder, et ce qui a été réglé.
 *
 * La purge se fait ici plutôt qu'à l'écriture : une table qui se nettoie au moment où
 * l'on consigne ajoute une suppression à chaque panne, c'est-à-dire au pire moment.
 * L'affichage, lui, est rare et calme.
 */
export async function incidentsDuJournal(
  utilisateur: UtilisateurConnecte,
  options: { resolus?: boolean } = {}
): Promise<IncidentAffiche[]> {
  exigerAdmin(utilisateur);

  await prisma.$executeRaw`
    DELETE FROM incidents
    WHERE resolu_le IS NOT NULL
      AND resolu_le < NOW() - ${RETENTION_JOURS + " days"}::interval
  `;

  const lignes = await prisma.incidents.findMany({
    where: options.resolus ? { resolu_le: { not: null } } : { resolu_le: null },
    orderBy: { derniere_le: "desc" },
    take: PAGE,
  });

  return lignes.map((l) => ({
    id: l.id,
    type: l.type,
    message: l.message,
    chemin: l.chemin,
    methode: l.methode,
    origine: l.origine,
    pile: l.pile,
    occurrences: l.occurrences,
    premiereLe: l.premiere_le,
    derniereLe: l.derniere_le,
    resoluLe: l.resolu_le,
  }));
}

/** Combien de pannes attendent d'être regardées : c'est ce que le tableau annonce. */
export async function incidentsOuverts(utilisateur: UtilisateurConnecte): Promise<number> {
  exigerAdmin(utilisateur);
  return prisma.incidents.count({ where: { resolu_le: null } });
}

/**
 * Marquer réglé, non supprimer.
 *
 * La ligne reste : elle porte la date de première apparition et le nombre
 * d'occurrences, qui disent si la correction a tenu. Et si la panne revient, la même
 * ligne se rouvre plutôt que d'en créer une seconde sans mémoire.
 */
export async function resoudreIncident(
  utilisateur: UtilisateurConnecte,
  id: number
): Promise<void> {
  exigerAdmin(utilisateur);
  await prisma.incidents.updateMany({
    where: { id, resolu_le: null },
    data: { resolu_le: new Date(), resolu_par: utilisateur.id },
  });
}

/** Rouvrir à la main : la correction n'a pas tenu, et on veut la revoir dans la liste. */
export async function rouvrirIncident(utilisateur: UtilisateurConnecte, id: number): Promise<void> {
  exigerAdmin(utilisateur);
  await prisma.incidents.updateMany({
    where: { id },
    data: { resolu_le: null, resolu_par: null },
  });
}
