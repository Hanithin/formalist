import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirModification } from "@/infrastructure/db/depots/modifications";
import { lireDocumentProduit } from "@/infrastructure/documents/depot";
import { pageEnImage, StatutsIllisibles } from "@/infrastructure/documents/statuts";
import { route } from "@/lib/reponses";
import { TITRE_STATUTS } from "../statuts/route";

/**
 * L'image d'une page des statuts, pour l'éditeur.
 *
 * L'éditeur travaille sur ce que l'on voit : il faut donc une image, et les
 * coordonnées des retouches se posent dessus. Afficher le PDF dans une visionneuse
 * intégrée aurait demandé d'embarquer une bibliothèque de rendu et de faire coïncider
 * ses coordonnées avec les nôtres, pour le même résultat.
 *
 * L'accès passe par le dossier : sans cette vérification, l'adresse d'une page
 * livrerait les statuts de n'importe quelle société à qui devine un identifiant.
 */
export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const parametres = new URL(requete.url).searchParams;
  const dossierId = Number(parametres.get("dossier"));
  const numero = Number(parametres.get("page") ?? "1");

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }

  await ouvrirModification(utilisateur, dossierId);

  const statuts = await lireDocumentProduit(dossierId, TITRE_STATUTS);
  if (!statuts) {
    return NextResponse.json({ error: "Les statuts ne sont pas au dossier" }, { status: 404 });
  }

  try {
    const image = await pageEnImage(statuts, numero);
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        // La page ne change pas tant que les statuts ne changent pas, et l'éditeur
        // en redemande à chaque aller-retour.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    if (e instanceof StatutsIllisibles) {
      return NextResponse.json({ error: e.message }, { status: e.statut });
    }
    throw e;
  }
});
