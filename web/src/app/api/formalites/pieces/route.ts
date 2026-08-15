import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon } from "@/infrastructure/db/depots/brouillons";
import { deposerPiece } from "@/infrastructure/documents/depot";
import { produireLesActes, DossierIncomplet } from "@/infrastructure/documents/actes";
import { TYPE_ATTESTATION_CAPITAL } from "@/infrastructure/db/depots/suivi";
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

    /*
     * L'attestation de dépôt de capital re-date les actes.
     *
     * La banque la délivre après le versement, et c'est ce jour-là qu'on signe les
     * statuts. Attendre une régénération manuelle laisserait des actes datés du jour
     * de leur production - c'est-à-dire d'avant l'existence du capital.
     *
     * Un dossier encore incomplet ne bloque pas le dépôt : la pièce est reçue, les
     * actes se produiront quand le reste sera là.
     */
    let redates = false;
    if (attendue.identifiant === TYPE_ATTESTATION_CAPITAL) {
      try {
        await produireLesActes(utilisateur, dossierId);
        redates = true;
      } catch (e) {
        if (!(e instanceof DossierIncomplet)) throw e;
      }
    }

    return NextResponse.json({ ok: true, document: depose, redates }, { status: 201 });
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
