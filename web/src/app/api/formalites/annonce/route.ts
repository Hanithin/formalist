import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { exigerDossier } from "@/infrastructure/db/depots/dossiers";
import { texteAnnonce } from "@/infrastructure/documents/annonce";
import { lireBrouillon } from "@/infrastructure/db/depots/brouillons";
import { validerCorps, validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const LECTURE = z.object({ dossier: schemas.identifiant });

const ECRITURE = z.object({
  dossier: schemas.identifiant,
  texte: z.string().trim().min(1, "Texte vide").max(10_000),
});

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = validerParametres(LECTURE, new URL(requete.url));
  const formalite = await exigerDossier(utilisateur, dossier);

  // Le texte enregistré prime : l'avocat a pu le corriger, et le regénérer
  // effacerait sa relecture.
  const enregistre = formalite.annonce_text;

  return NextResponse.json({
    texte: enregistre || texteAnnonce(formalite),
    relu: !!enregistre,
  });
});

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  // Seul un avocat corrige le texte : il engage sa responsabilité sur ce qui
  // part au journal d'annonces légales.
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    return NextResponse.json({ error: "Réservé aux avocats" }, { status: 403 });
  }

  const { dossier, texte } = await validerCorps(ECRITURE, requete);
  await exigerDossier(utilisateur, dossier);

  await prisma.formalites.update({
    where: { id: dossier },
    data: { annonce_text: texte, updated_at: new Date() },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossier,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: "annonce_relue",
    },
  });

  return NextResponse.json({ ok: true });
});

const DECLARATION = z.object({
  dossier: schemas.identifiant,
  publies: z.boolean(),
});

/**
 * Le cabinet déclare avoir publié.
 *
 * Il n'y a pas d'attestation de parution à déposer : personne ne l'attend du client,
 * puisqu'il a payé pour ne pas s'en occuper. C'est cette déclaration qui fait avancer
 * son suivi - `avisDeclares` la lit dans le dossier. La modification fonctionne ainsi
 * depuis longtemps ; la création réclamait deux gestes au client.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  // Le cabinet engage sa responsabilité sur ce qui paraît : lui seul le déclare.
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    return NextResponse.json({ error: "Réservé aux avocats" }, { status: 403 });
  }

  const { dossier, publies } = await validerCorps(DECLARATION, requete);
  const formalite = await exigerDossier(utilisateur, dossier);

  const brouillon = lireBrouillon(formalite.data_json);
  await prisma.formalites.update({
    where: { id: dossier },
    data: {
      data_json: JSON.stringify({ ...brouillon, avisPublies: publies }),
      updated_at: new Date(),
    },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossier,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: publies ? "annonce_publiee" : "annonce_depubliee",
    },
  });

  return NextResponse.json({ ok: true, publies });
});
