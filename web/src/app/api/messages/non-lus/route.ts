import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { totalNonLus, conversations } from "@/infrastructure/db/depots/messages";
import { messagesDe, nonLus as nonLusDuSupport } from "@/infrastructure/db/depots/support";
import { route } from "@/lib/reponses";

/**
 * Ce que la bulle affiche : le total non lu, et les conversations en aperçu.
 *
 * Le support en fait partie. La colonne le comptait déjà dans sa pastille, pas la
 * bulle : un message du support faisait apparaître « 1 non lu » à gauche sans que
 * rien n'y corresponde dans la bulle, et le fil qu'il fallait ouvrir pour l'éteindre
 * n'y figurait pas.
 */
export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const [total, fils, support, nonLusSupport] = await Promise.all([
    totalNonLus(utilisateur),
    conversations(utilisateur),
    messagesDe(utilisateur),
    nonLusDuSupport(utilisateur),
  ]);

  const dernierSupport = support[support.length - 1];

  return NextResponse.json({
    total: total + nonLusSupport,
    conversations: [
      ...fils.map((f) => ({
        dossierId: f.dossierId,
        societe: f.societe,
        dernierMessage: f.dernierMessage,
        nonLus: f.nonLus,
      })),
      // Le fil du support n'a pas de dossier : il s'ouvre par ?fil=support.
      {
        dossierId: null,
        societe: "Support Formalist",
        dernierMessage: dernierSupport?.contenu ?? null,
        nonLus: nonLusSupport,
      },
    ],
  });
});
