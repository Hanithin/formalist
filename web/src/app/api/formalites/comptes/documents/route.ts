import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirComptes } from "@/infrastructure/db/depots/comptes";
import {
  produireLesActesDesComptes,
  ComptesIncomplets,
} from "@/infrastructure/documents/actes-comptes";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Reproduit les actes d'une approbation des comptes.
 *
 * La production suit le règlement : elle se fait d'elle-même dès que le paiement est
 * confirmé, et cette route ne sert plus qu'à la refaire - après une correction
 * demandée par l'avocat, par exemple. Ce qu'elle écrit vit dans le domaine, non ici :
 * décider ici des actes à produire répandrait la règle dans un écran et une route, qui
 * finiraient par ne plus dire la même chose.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { comptes } = await ouvrirComptes(utilisateur, dossier);

  try {
    const { produits, conserves } = await produireLesActesDesComptes(dossier, comptes);
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
    if (e instanceof ComptesIncomplets) {
      return NextResponse.json(
        { error: "Le dossier est incomplet", manques: e.manques },
        { status: 400 }
      );
    }
    throw e;
  }
});
