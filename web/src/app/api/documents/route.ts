import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { deposerAuCoffre } from "@/infrastructure/documents/depot";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

/**
 * Dépôt libre d'un document.
 *
 * Distinct de /api/formalites/pieces, qui répond à une pièce attendue sur un dossier :
 * ici le client range ce qu'il veut, en désignant éventuellement la société à laquelle
 * le document se rapporte. Un rattachement vers un dossier qui ne lui appartient pas
 * est ignoré plutôt que refusé - le document rejoint alors ses dépôts personnels, ce
 * qui est le comportement le moins surprenant.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const formulaire = await requete.formData();
  const fichier = formulaire.get("fichier");
  const nom = String(formulaire.get("nom") ?? "");
  const brut = formulaire.get("dossier");

  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  const dossier = Number(brut);
  const dossierId = Number.isInteger(dossier) && dossier > 0 ? dossier : null;

  try {
    const depose = await deposerAuCoffre(utilisateur, fichier, nom, dossierId);
    return NextResponse.json({ ok: true, document: depose }, { status: 201 });
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
