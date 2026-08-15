import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  retirerMembre,
  renvoyerInvitation,
  revoquerInvitation,
  modifierMembre,
} from "@/infrastructure/db/depots/equipe";
import { emailInvitationEquipe } from "@/infrastructure/mail/envoi";
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
    const renvoyee = await renvoyerInvitation(utilisateur, invitation);

    // Renvoyer, c'est envoyer de nouveau : le jeton a changé, l'ancien lien ne vaut
    // plus rien, et laisser le destinataire sans message viderait le geste de sens.
    const envoi = await emailInvitationEquipe(
      renvoyee.invitation.email,
      renvoyee.invitation.token,
      renvoyee.nom,
      utilisateur.nom
    );

    return NextResponse.json({ ok: true, envoye: envoi.ok && !envoi.simule });
  }

  await revoquerInvitation(utilisateur, invitation);
  return NextResponse.json({ ok: true });
});

const CHANGEMENT = z.object({
  membre: schemas.identifiant,
  role: z.string().optional(),
  voitTousLesDossiers: z.boolean().optional(),
  peutModifier: z.boolean().optional(),
  peutCreer: z.boolean().optional(),
});

/**
 * Changement de rôle ou de droits d'un membre en place.
 *
 * Distinct du PUT, qui porte les gestes sur les invitations et le retrait : ici on
 * modifie une ligne existante, et les champs absents ne sont pas remis à zéro.
 */
export const PATCH = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { membre, ...changements } = await validerCorps(CHANGEMENT, requete);

  return NextResponse.json(await modifierMembre(utilisateur, membre, changements));
});
