import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon } from "@/infrastructure/db/depots/brouillons";
import { documentsAProduire } from "@/domain/formalite/documents";
import { premiereEtapeIncomplete } from "@/domain/formalite/parcours";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { genererDocument } from "@/infrastructure/documents/generation";
import { remplacerDocumentsProduits } from "@/infrastructure/documents/depot";
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
  if (bloquante !== null && bloquante < 5) {
    return NextResponse.json(
      { error: "Le dossier est incomplet", etape: bloquante },
      { status: 400 }
    );
  }

  const aProduire = documentsAProduire({
    forme: brouillon.forme ?? "",
    aUnDirigeant: (brouillon.dirigeants ?? []).length > 0,
  });

  // La ville du RCS vient de la table du registre, pas de la commune du siège :
  // Sainte-Foy-lès-Lyon relève du tribunal de commerce de Lyon.
  const donnees = donneesDeGabarit(brouillon, {
    villeRcs: villeDuRcs(brouillon.codePostal, brouillon.ville),
  });
  // Tout est produit avant d'écrire quoi que ce soit : un gabarit qui échoue ne doit
  // pas laisser le dossier avec la moitié d'un jeu d'actes.
  const actes = aProduire.map((document) => ({
    titre: document.titre,
    contenu: genererDocument(document.gabarit, donnees),
  }));

  const { produits, conserves } = await remplacerDocumentsProduits(dossier, actes);

  return NextResponse.json(
    { ok: true, documents: [...produits, ...conserves] },
    { status: 201 }
  );
});
