import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  retirerMembre,
  renvoyerInvitation,
  revoquerInvitation,
} from "@/infrastructure/db/depots/equipe";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const ACTION = z.object({
  membre: schemas.identifiant.optional(),
  invitation: schemas.identifiant.optional(),
  action: z.enum(["retirer", "renvoyer", "revoquer"]),
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { membre, invitation, action } = await validerCorps(ACTION, requete);

  if (action === "retirer") {
    if (!membre) return NextResponse.json({ error: "Membre manquant" }, { status: 400 });
    return NextResponse.json(await retirerMembre(utilisateur, membre));
  }

  if (!invitation) return NextResponse.json({ error: "Invitation manquante" }, { status: 400 });

  if (action === "renvoyer") {
    await renvoyerInvitation(utilisateur, invitation);
  } else {
    await revoquerInvitation(utilisateur, invitation);
  }
  return NextResponse.json({ ok: true });
});
