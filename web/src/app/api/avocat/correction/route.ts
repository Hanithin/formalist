import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { corrigerEtReproduire } from "@/infrastructure/db/depots/correction";
import { ComptesIncomplets } from "@/infrastructure/documents/actes-comptes";
import { CessationIncomplete } from "@/infrastructure/documents/actes-cessation";
import {
  FermetureIncomplete,
  VoieImpossible,
} from "@/infrastructure/documents/actes-fermeture";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Corriger un dossier depuis l'espace avocat, puis reproduire ses actes.
 *
 * L'avocat qui voyait une coquille n'avait qu'un chemin : télécharger le Word, le
 * corriger à la main, redéposer sa version. La faute restait dans le dossier, l'acte
 * suivant la reprenait, et le document remis ne correspondait plus aux données dont il
 * était censé sortir.
 *
 * Les valeurs arrivent telles que la fenêtre les a saisies : des chaînes et des
 * nombres, jamais des objets. Ce qui les range dans le brouillon dépend du type, et
 * c'est le dépôt qui le sait.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, valeurs } = await validerCorps(
    z.object({
      dossier: schemas.identifiant,
      valeurs: z.record(z.string(), z.union([z.string(), z.number()])),
    }),
    requete
  );

  try {
    const { produits } = await corrigerEtReproduire(utilisateur, dossier, valeurs);
    return NextResponse.json({ ok: true, produits });
  } catch (e) {
    /* Ce qui manque est nommé : l'avocat corrige, il ne devine pas. */
    if (e instanceof ComptesIncomplets || e instanceof CessationIncomplete) {
      return NextResponse.json(
        { error: "Le dossier est incomplet", manques: e.manques },
        { status: 400 }
      );
    }
    if (e instanceof FermetureIncomplete) {
      return NextResponse.json(
        { error: "Le dossier est incomplet", manques: e.manques },
        { status: 400 }
      );
    }
    if (e instanceof VoieImpossible) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
