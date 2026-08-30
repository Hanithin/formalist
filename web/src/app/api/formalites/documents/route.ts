import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { produireLesActesDuDossier, DossierIncomplet } from "@/infrastructure/documents/actes";
import { prisma } from "@/infrastructure/db/client";
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

  /*
   * Ce qui sort d'ici attend l'avocat, dès lors qu'il y en a un.
   *
   * Avant la transmission, les actes sont une lecture de travail : le client appuie
   * sur le bouton pour voir ce que donnent ses réponses, aucun avocat ne les a vus, et
   * les annoncer « en relecture » serait faux. Une fois le dossier transmis, c'est
   * l'inverse : un acte reproduit ici n'est plus celui qui a été validé, et le laisser
   * passer pour tel remettrait au client, sans relecture, des documents qu'il pourrait
   * signer aussitôt.
   *
   * C'est la même règle que le dépôt de l'attestation de capital applique déjà.
   */
  const ligne = await prisma.formalites.findUnique({
    where: { id: dossier },
    select: { status: true },
  });

  try {
    const { produits, conserves } = await produireLesActesDuDossier(utilisateur, dossier, {
      forcerLaRelecture: ligne?.status !== "en_cours",
    });
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
