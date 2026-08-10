import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon } from "@/infrastructure/db/depots/brouillons";
import { deposerPiece } from "@/infrastructure/documents/depot";
import { piecesAttendues } from "@/domain/formalite/documents";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const formulaire = await requete.formData();
  const dossierId = Number(formulaire.get("dossier"));
  const identifiant = String(formulaire.get("piece") ?? "");
  const fichier = formulaire.get("fichier");

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  // La pièce doit être l'une de celles attendues pour cette forme : on
  // n'accepte pas un identifiant libre, qui deviendrait un fourre-tout.
  const { brouillon } = await ouvrirBrouillon(utilisateur, dossierId);
  const attendue = piecesAttendues(brouillon.forme).find((p) => p.identifiant === identifiant);
  if (!attendue) {
    return NextResponse.json({ error: "Cette pièce n'est pas attendue" }, { status: 400 });
  }

  try {
    const depose = await deposerPiece(
      utilisateur,
      dossierId,
      { identifiant: attendue.identifiant, titre: attendue.titre },
      fichier,
      attendue.formats
    );
    return NextResponse.json({ ok: true, document: depose }, { status: 201 });
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
