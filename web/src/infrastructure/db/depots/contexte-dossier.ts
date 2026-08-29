import { prisma } from "../client";
import { premiereEtapeIncomplete, type Brouillon } from "@/domain/formalite/parcours";
import type { ContexteDossier } from "@/domain/formalite/actions";

/**
 * Ce qu'il faut savoir d'un dossier pour dire ce qu'il attend.
 *
 * `actionsAttendues` réclame un contexte - phase, banque, capital, informations
 * complètes, documents refusés, signatures manquantes - que le tableau de bord
 * assemblait chez lui. La liste des formalités en a besoin du même, et deux copies de
 * « comment on décide ce qu'un dossier attend » auraient dérivé : c'est ce genre de
 * dédoublement qui a produit, ailleurs sur cet écran, deux vocabulaires et deux
 * découpages pour les mêmes dossiers.
 *
 * Les deux compteurs sont demandés en une requête chacun, pour tous les dossiers à la
 * fois. Un appel par dossier rendait la page lente dès la troisième société.
 */

/**
 * La banque du dépôt de capital.
 *
 * Elle vit dans le brouillon sous NOM_BANQUE, pas en colonne. Une version d'origine
 * lisait `f.banque` sur le dossier, donc toujours indéfini : « Choisir votre banque »
 * restait affiché même une fois la banque choisie.
 */
function banqueDe(brouillon: Record<string, unknown>): string | null {
  const nom = brouillon.NOM_BANQUE;
  return typeof nom === "string" && nom.trim() ? nom : null;
}

export function lireBrouillon(dataJson: string | null): Brouillon & Record<string, unknown> {
  if (!dataJson) return {};
  try {
    const analyse: unknown = JSON.parse(dataJson);
    return analyse && typeof analyse === "object"
      ? (analyse as Brouillon & Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Le strict nécessaire, pour que les deux appelants passent ce qu'ils ont déjà lu. */
export interface LigneDeDossier {
  id: number;
  type: string | null;
  status: string | null;
  phase: number | null;
  data_json: string | null;
}

/**
 * Le contexte de chaque dossier, en deux requêtes pour l'ensemble.
 *
 * Rend une table indexée par identifiant : l'appelant y puise sans avoir à se soucier
 * de l'ordre ni des dossiers absents.
 */
export async function contextesDesDossiers(
  dossiers: LigneDeDossier[]
): Promise<Map<number, ContexteDossier>> {
  const contextes = new Map<number, ContexteDossier>();
  if (dossiers.length === 0) return contextes;

  const identifiants = dossiers.map((d) => d.id);

  const [rejetes, signatures] = await Promise.all([
    prisma.documents.groupBy({
      by: ["formalite_id"],
      where: { formalite_id: { in: identifiants }, rejection_reason: { not: null } },
      _count: { _all: true },
    }),
    prisma.signature_requests.groupBy({
      by: ["formalite_id", "signed_at"],
      where: { formalite_id: { in: identifiants } },
      _count: { _all: true },
    }),
  ]);

  const rejetesPar = new Map(rejetes.map((r) => [r.formalite_id, r._count._all]));

  const signaturesPar = new Map<number, { total: number; enAttente: number }>();
  for (const s of signatures) {
    const courant = signaturesPar.get(s.formalite_id) ?? { total: 0, enAttente: 0 };
    courant.total += s._count._all;
    if (!s.signed_at) courant.enAttente += s._count._all;
    signaturesPar.set(s.formalite_id, courant);
  }

  for (const d of dossiers) {
    const brouillon = lireBrouillon(d.data_json);
    const compteurs = signaturesPar.get(d.id) ?? { total: 0, enAttente: 0 };

    contextes.set(d.id, {
      dossierId: d.id,
      type: d.type,
      status: d.status,
      phase: d.phase ?? 1,
      banque: banqueDe(brouillon),
      capital: brouillon.capital ?? null,
      // Les trois premières étapes du parcours renseignent la société, ses associés
      // et son dirigeant : au-delà, les informations sont complètes.
      informationsCompletes: (premiereEtapeIncomplete(brouillon) ?? 9) > 3,
      documentsRejetes: rejetesPar.get(d.id) ?? 0,
      signaturesEnAttente: compteurs.enAttente,
      signaturesTotal: compteurs.total,
    });
  }

  return contextes;
}
