import { prisma } from "../client";
import { listerDossiers } from "./dossiers";
import { actionsAttendues, type ContexteDossier } from "@/domain/formalite/actions";
import { premiereEtapeIncomplete, type Brouillon } from "@/domain/formalite/parcours";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Le tableau de bord.
 *
 * Les compteurs sont demandés en une fois plutôt qu'un par dossier : la page
 * d'origine enchaînait un appel par société, ce qui la rendait lente dès trois
 * dossiers.
 */

/**
 * La banque du dépôt de capital.
 *
 * Elle vit dans le brouillon sous NOM_BANQUE, pas en colonne. Le tableau de bord
 * d'origine lisait `f.banque` sur le dossier, donc toujours indéfini : « Choisir
 * votre banque » restait affiché même une fois la banque choisie.
 */
function banqueDe(brouillon: Record<string, unknown>): string | null {
  const nom = brouillon.NOM_BANQUE;
  return typeof nom === "string" && nom.trim() ? nom : null;
}

function lireBrouillon(dataJson: string | null): Brouillon & Record<string, unknown> {
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

export async function tableauDeBord(utilisateur: UtilisateurConnecte) {
  const dossiers = await listerDossiers(utilisateur);
  if (dossiers.length === 0) return { dossiers: [], societes: [] };

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

  const societes = dossiers.map((d) => {
    const brouillon = lireBrouillon(d.data_json);
    const compteurs = signaturesPar.get(d.id) ?? { total: 0, enAttente: 0 };

    const contexte: ContexteDossier = {
      dossierId: d.id,
      status: d.status,
      phase: d.phase ?? 1,
      banque: banqueDe(brouillon),
      capital: brouillon.capital ?? null,
      // Les trois premières étapes du parcours renseignent la société, ses
      // associés et son dirigeant : au-delà, les informations sont complètes.
      informationsCompletes: (premiereEtapeIncomplete(brouillon) ?? 9) > 3,
      documentsRejetes: rejetesPar.get(d.id) ?? 0,
      signaturesEnAttente: compteurs.enAttente,
      signaturesTotal: compteurs.total,
    };

    return {
      id: d.id,
      societe: d.societe || "Sans nom",
      forme: d.forme,
      status: d.status,
      phase: d.phase ?? 1,
      offre: d.offer,
      actions: actionsAttendues(contexte),
    };
  });

  return { dossiers, societes };
}
