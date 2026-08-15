import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { mesAvis, avisNonLus, marquerAvisLus } from "@/infrastructure/db/depots/avis";
import { route } from "@/lib/reponses";

/**
 * Ce dont la cloche a besoin : les avis, et combien restent à lire.
 *
 * Les siens uniquement - la requête ne prend aucun identifiant, elle lit la session.
 */
export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const [avis, nonLus] = await Promise.all([mesAvis(utilisateur), avisNonLus(utilisateur)]);

  return NextResponse.json({
    nonLus,
    avis: avis.map((a) => ({
      id: a.id,
      genre: a.genre,
      contenu: a.contenu,
      dossierId: a.dossierId,
      lu: a.lu,
      recuLe: a.recuLe.toISOString(),
    })),
  });
});

/** Ouvrir la cloche vaut lecture : tout passe en lu d'un bloc. */
export const PUT = route(async () => {
  const utilisateur = await exigerUtilisateur();
  return NextResponse.json({ lus: await marquerAvisLus(utilisateur) });
});
