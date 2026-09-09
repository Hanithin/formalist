import { NextResponse } from "next/server";
import { exigerRole } from "@/infrastructure/db/utilisateur-courant";
import {
  piecesDuCabinet,
  remplacerLaPieceDuCabinet,
  PieceDuCabinetInconnue,
} from "@/infrastructure/db/depots/pieces-cabinet";
import { PIECES_DU_CABINET, fraicheur } from "@/domain/formalite/domiciliation";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

/**
 * Les pièces que le cabinet fournit quand il domicilie une société.
 *
 * Elles ne sont pas celles d'un dossier : elles sont au cabinet, et se déposent une
 * fois. C'est ce qui permet à un dépôt au guichet de rester un geste, et ce qui permet
 * de dire qu'un extrait Kbis a plus de trois mois avant qu'un greffe ne le dise.
 *
 * Réservé à l'administration : ces pièces valent pour tous les dossiers du cabinet, et
 * les remplacer engage chacun d'eux.
 */
export const GET = route(async () => {
  await exigerRole("admin");

  const deposees = await piecesDuCabinet();

  return NextResponse.json({
    pieces: PIECES_DU_CABINET.map((attendue) => {
      const deposee = deposees.find((d) => d.identifiant === attendue.identifiant);
      return {
        ...attendue,
        deposee: deposee
          ? {
              nomFichier: deposee.nomFichier,
              etabliLe: deposee.etabliLe,
              deposeLe: deposee.deposeLe,
              /* L'état n'a de sens que pour ce qui se périme : un passeport a sa validité. */
              etat: attendue.perissable ? fraicheur(deposee.etabliLe) : "fraiche",
            }
          : null,
      };
    }),
  });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerRole("admin");

  const formulaire = await requete.formData();
  const identifiant = String(formulaire.get("piece") ?? "");
  const fichier = formulaire.get("fichier");
  const etabliLeBrut = String(formulaire.get("etabliLe") ?? "").trim();

  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  /*
   * La date se lit au format ISO ou pas du tout.
   *
   * `fraicheur` la refuse autrement, et une pièce dont la date n'est pas lue est
   * traitée comme une pièce sans date : autant l'écarter ici, où l'on peut le dire.
   */
  const etabliLe = /^\d{4}-\d{2}-\d{2}$/.test(etabliLeBrut) ? etabliLeBrut : null;

  try {
    const deposee = await remplacerLaPieceDuCabinet(utilisateur, identifiant, fichier, etabliLe);
    return NextResponse.json({ piece: deposee }, { status: 201 });
  } catch (e) {
    if (e instanceof PieceDuCabinetInconnue || e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
