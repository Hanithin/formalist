import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { deposerPieceDeConsultation } from "@/infrastructure/documents/depot";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

/**
 * Dépôt d'une pièce joignable à une consultation.
 *
 * Le fichier est déposé pendant l'assistant, donc avant que la consultation existe :
 * la réponse rend son nom de stockage, que l'assistant garde et transmet en
 * réservant. Une pièce déposée puis abandonnée reste un fichier sans consultation,
 * inscrit au nom de son déposant et lisible par lui seul.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const formulaire = await requete.formData();
  const fichier = formulaire.get("fichier");

  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  try {
    const piece = await deposerPieceDeConsultation(utilisateur, fichier);
    return NextResponse.json({ ok: true, piece }, { status: 201 });
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
