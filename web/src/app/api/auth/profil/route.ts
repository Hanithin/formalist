import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  prenom: schemas.nom,
  nom: schemas.nom,
  email: schemas.email,
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { prenom, nom, email } = await validerCorps(SCHEMA, requete);

  // L'adresse sert d'identifiant de connexion : elle doit rester unique.
  const occupee = await prisma.users.findFirst({
    where: { email, id: { not: utilisateur.id } },
    select: { id: true },
  });
  if (occupee) {
    return NextResponse.json({ error: "Cette adresse est déjà utilisée" }, { status: 409 });
  }

  await prisma.users.update({
    where: { id: utilisateur.id },
    data: { first_name: prenom, last_name: nom, name: prenom + " " + nom, email },
  });

  return NextResponse.json({ ok: true });
});
