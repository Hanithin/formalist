import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirCessation } from "@/infrastructure/db/depots/cessation";
import { verifierCessation } from "@/domain/cessation/verification";
import { donneesDeLaCessation } from "@/domain/cessation/gabarit";
import { actesDeLaCessation } from "@/domain/cessation/actes";
import { genererDocument } from "@/infrastructure/documents/generation";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { remplacerDocumentsProduits } from "@/infrastructure/documents/depot";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les deux pièces de la cessation.
 *
 * Pas de renumérotation de résolutions ici : une auto-entreprise ne délibère pas. La
 * passe de typographie reste, elle, commune à tous les documents.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { cessation } = await ouvrirCessation(utilisateur, dossier);

  const manques = verifierCessation(cessation);
  if (manques.length > 0) {
    return NextResponse.json({ error: "Le dossier est incomplet", manques }, { status: 400 });
  }

  const donnees = donneesDeLaCessation(cessation);

  const actes = actesDeLaCessation(cessation.nature).map((acte) => ({
    titre: acte.titre,
    contenu: typographierLeDocument(genererDocument(acte.gabarit, donnees)),
  }));

  const { produits, conserves } = await remplacerDocumentsProduits(dossier, actes, {
    aRelire: true,
  });

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
});
