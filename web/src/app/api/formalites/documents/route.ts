import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { produireLesActes, DossierIncomplet } from "@/infrastructure/documents/actes";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les documents du dossier.
 *
 * Le jeu de champs attendu par les gabarits est construit dans le domaine
 * (donneesDeGabarit) : c'est une transformation pure, et c'est là qu'elle se teste.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  try {
    const { produits, conserves } = await produireLesActes(utilisateur, dossier);
    return NextResponse.json(
      { ok: true, documents: [...produits, ...conserves] },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof DossierIncomplet) {
      return NextResponse.json({ error: e.message, etape: e.etape }, { status: 400 });
    }
    throw e;
  }
});
