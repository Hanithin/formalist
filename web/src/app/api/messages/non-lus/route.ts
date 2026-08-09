import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { totalNonLus, conversations } from "@/infrastructure/db/depots/messages";
import { route } from "@/lib/reponses";

export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const [total, fils] = await Promise.all([
    totalNonLus(utilisateur),
    conversations(utilisateur),
  ]);

  return NextResponse.json({
    total,
    conversations: fils.map((f) => ({
      dossierId: f.dossierId,
      societe: f.societe,
      dernierMessage: f.dernierMessage,
      nonLus: f.nonLus,
    })),
  });
});
