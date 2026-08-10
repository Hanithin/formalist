import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { changerLesRoles, ChangementRefuse } from "@/infrastructure/db/depots/administration";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  compte: schemas.identifiant,
  roles: z.array(z.string().max(20)).max(5),
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { compte, roles } = await validerCorps(SCHEMA, requete);

  try {
    return NextResponse.json(await changerLesRoles(utilisateur, compte, roles));
  } catch (e) {
    if (e instanceof ChangementRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
