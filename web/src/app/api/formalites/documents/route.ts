import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon } from "@/infrastructure/db/depots/brouillons";
import { documentsAProduire } from "@/domain/formalite/documents";
import { premiereEtapeIncomplete } from "@/domain/formalite/parcours";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { enregistrerDocumentProduit } from "@/infrastructure/documents/depot";
import { nomDeStockage } from "@/lib/fichiers";
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
  const { brouillon } = await ouvrirBrouillon(utilisateur, dossier);

  // Un dossier incomplet produirait des documents troués, qui seraient déposés
  // au greffe en l'état. Mieux vaut dire ce qui manque.
  const bloquante = premiereEtapeIncomplete(brouillon);
  if (bloquante !== null && bloquante < 4) {
    return NextResponse.json(
      { error: "Le dossier est incomplet", etape: bloquante },
      { status: 400 }
    );
  }

  const aProduire = documentsAProduire({
    forme: brouillon.forme ?? "",
    aUnDirigeant: (brouillon.dirigeants ?? []).length > 0,
  });

  const donnees = donneesDeGabarit(brouillon);
  const produits = [];

  for (const document of aProduire) {
    const contenu = genererDocument(document.gabarit, donnees);
    const nom = nomDeStockage(".docx");
    const enregistre = await enregistrerDocumentProduit(dossier, document.titre, nom, contenu);
    produits.push({ id: enregistre.id, titre: document.titre });
  }

  return NextResponse.json({ ok: true, documents: produits }, { status: 201 });
});
