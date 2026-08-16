import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirModification,
  completerModification,
} from "@/infrastructure/db/depots/modifications";
import { avisAPublier } from "@/domain/modification/annonce";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Les avis de modification, rédigés.
 *
 * C'est le cabinet qui publie, et un support habilité facture au caractère : le
 * texte est composé ici, à partir des données du dossier, pour n'avoir qu'à le
 * copier dans le formulaire du journal.
 *
 * Il se recalcule à chaque lecture plutôt que d'être figé au dossier : une donnée
 * corrigée après coup doit se retrouver dans l'avis, non dans une version périmée
 * qu'on aurait déjà publiée.
 */
export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const dossierId = Number(new URL(requete.url).searchParams.get("dossier"));
  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }

  const { modification } = await ouvrirModification(utilisateur, dossierId);

  const avis = avisAPublier({
    societe: modification.societe,
    codes: modification.codes,
    valeurs: modification.valeurs,
    dateAssemblee: modification.assemblee?.date ?? null,
    ressortActuel: villeDuRcs(modification.societe.codePostal, modification.societe.ville),
    ressortNouveau: villeDuRcs(
      typeof modification.valeurs.nouveauCodePostal === "string"
        ? modification.valeurs.nouveauCodePostal
        : "",
      typeof modification.valeurs.nouvelleVille === "string"
        ? modification.valeurs.nouvelleVille
        : ""
    ),
  });

  return NextResponse.json({ avis, publies: modification.avisPublies === true });
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
 * son suivi.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, publies } = await validerCorps(DECLARATION, requete);

  await completerModification(utilisateur, dossier, { avisPublies: publies });
  return NextResponse.json({ ok: true, publies });
});
