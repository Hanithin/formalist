import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirModification } from "@/infrastructure/db/depots/modifications";
import {
  produireLesActesDeLaModification,
  DossierIncompletPourLesActes,
  AucunActeAProduire,
} from "@/infrastructure/documents/actes-modification";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les actes de la modification.
 *
 * Un seul procès-verbal porte toutes les résolutions : c'est une seule assemblée. Le
 * travail lui-même vit dans actes-modification.ts, parce que la confirmation du
 * règlement le lance aussi - depuis que les actes suivent le paiement, le client n'a
 * plus d'écran où appuyer sur un bouton.
 */

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { modification } = await ouvrirModification(utilisateur, dossier);

  try {
    const { produits, conserves } = await produireLesActesDeLaModification(dossier, modification);

    /*
     * L'état part avec le titre.
     *
     * Ce qu'on vient de produire attend l'avocat ; ce qui a été conservé lui a déjà
     * échappé, parce que relu ou signé - c'est justement pourquoi la régénération ne
     * l'a pas remplacé. L'écran doit pouvoir le dire : une liste de titres nus laisse
     * chercher un lien de téléchargement qui n'existe pas encore.
     */
    return NextResponse.json(
      {
        ok: true,
        documents: [
          ...produits.map((d) => ({ ...d, enRelecture: true })),
          ...conserves.map((d) => ({ ...d, enRelecture: false })),
        ],
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof DossierIncompletPourLesActes) {
      return NextResponse.json({ error: e.message, manques: e.manques }, { status: e.statut });
    }
    if (e instanceof AucunActeAProduire) {
      return NextResponse.json({ error: e.message }, { status: e.statut });
    }
    throw e;
  }
});
