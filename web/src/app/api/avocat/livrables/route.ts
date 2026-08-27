import { NextResponse } from "next/server";
import { exigerUtilisateur, Interdit } from "@/infrastructure/db/utilisateur-courant";
import { deposerPiece } from "@/infrastructure/documents/depot";
import {
  LIVRABLES,
  estLivrable,
  avancerSelonLeTravail,
} from "@/infrastructure/db/depots/avocat";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

/**
 * Le Kbis et le registre des bénéficiaires, déposés par le cabinet.
 *
 * Ils n'avaient aucun chemin pour arriver dans le dossier du client : les deux seules
 * routes de dépôt sont les pièces attendues de lui, restreintes à une liste, et le
 * coffre personnel, qui range dans les documents de celui qui dépose.
 *
 * Le type est contraint à deux valeurs, comme les pièces : un identifiant libre
 * deviendrait un fourre-tout, et c'est le type qui dit ensuite au suivi que l'étape
 * est franchie.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Réservé aux avocats");
  }

  const formulaire = await requete.formData();
  const dossierId = Number(formulaire.get("dossier"));
  const type = String(formulaire.get("type") ?? "");
  const fichier = formulaire.get("fichier");

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }
  if (!estLivrable(type)) {
    return NextResponse.json({ error: "Ce document n'est pas attendu ici" }, { status: 400 });
  }
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  const livrable = LIVRABLES[type];

  try {
    const depose = await deposerPiece(
      utilisateur,
      dossierId,
      { identifiant: type, titre: livrable.titre },
      fichier,
      [...livrable.formats]
    );
    /*
     * Le document du greffe clôt le parcours : l'étape suit, et le client est prévenu.
     */
    await avancerSelonLeTravail(utilisateur, dossierId);

    return NextResponse.json({ ok: true, document: depose }, { status: 201 });
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
