import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { exigerGestionDEquipe, EXPIRATION_INVITATION } from "@/infrastructure/db/depots/equipe";
import { roleAccorde } from "@/domain/equipe/invitations";
import { emailInvitationEquipe } from "@/infrastructure/mail/envoi";
import { jeton } from "@/lib/mots-de-passe";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  email: schemas.email,
  role: z.string().default("collaborateur"),
  voitTousLesDossiers: z.boolean().default(false),
  peutModifier: z.boolean().default(false),
  peutCreer: z.boolean().default(true),
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { equipe, nom, membres } = await exigerGestionDEquipe(utilisateur);
  const demande = await validerCorps(SCHEMA, requete);

  // Déjà dans l'équipe : réinviter ne ferait qu'un doublon dans la liste.
  const comptes = await prisma.users.findMany({
    where: { id: { in: membres.map((m) => m.user_id) } },
    select: { email: true },
  });
  if (comptes.some((c) => c.email === demande.email)) {
    return NextResponse.json({ error: "Cette personne fait déjà partie de l'équipe" }, { status: 409 });
  }

  const role = roleAccorde(equipe, demande.role);

  const invitation = await prisma.team_invitations.create({
    data: {
      team_id: equipe.id,
      email: demande.email,
      role,
      can_view_all: demande.voitTousLesDossiers,
      can_edit: demande.peutModifier,
      can_create: demande.peutCreer,
      token: jeton(),
      invited_by: utilisateur.id,
      expires_at: new Date(Date.now() + EXPIRATION_INVITATION),
    },
  });

  /*
   * Le courriel part maintenant, et son échec ne défait rien.
   *
   * L'invitation existe en base, son lien est valable : refuser la création parce que
   * Resend a répondu 500 obligerait à tout recommencer alors que le lien est copiable
   * depuis la page. On renvoie donc l'issue de l'envoi plutôt que de la taire - une
   * invitation dont l'email n'est pas parti n'est pas une invitation envoyée, et le
   * dire permet de la renvoyer ou d'en copier le lien.
   */
  const envoi = await emailInvitationEquipe(
    invitation.email,
    invitation.token,
    nom,
    utilisateur.nom
  );

  return NextResponse.json(
    { ok: true, email: invitation.email, equipe: nom, envoye: envoi.ok && !envoi.simule },
    { status: 201 }
  );
});
