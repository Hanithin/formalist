import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon } from "@/infrastructure/db/depots/brouillons";
import { documentsAProduire } from "@/domain/formalite/documents";
import { premiereEtapeIncomplete } from "@/domain/formalite/parcours";
import { genererDocument } from "@/infrastructure/documents/generation";
import { enregistrerDocumentProduit } from "@/infrastructure/documents/depot";
import { nomDeStockage } from "@/lib/fichiers";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les documents du dossier.
 *
 * Les champs attendus par les gabarits reprennent les noms du serveur d'origine :
 * ce sont eux qui figurent dans les fichiers Word, et les renommer supposerait de
 * reprendre les trente gabarits.
 */
function donneesGabarit(brouillon: Awaited<ReturnType<typeof ouvrirBrouillon>>["brouillon"]) {
  const associes = brouillon.associes ?? [];
  const dirigeant = (brouillon.dirigeants ?? [])[0];

  return {
    SOCIETE_NOM: brouillon.denomination ?? "",
    SOCIETE_FORME: brouillon.forme ?? "",
    SOCIETE_ACTIVITE: brouillon.activite ?? "",
    SOCIETE_ADRESSE: brouillon.adresse ?? "",
    SOCIETE_CP: brouillon.codePostal ?? "",
    SOCIETE_VILLE: brouillon.ville ?? "",
    CAPITAL: String(brouillon.capital ?? ""),
    CAPITAL_LIBERE: String(brouillon.capitalLibere ?? ""),
    PRESIDENT_NOM: dirigeant ? dirigeant.prenom + " " + dirigeant.nom : "",
    GERANT_NOM: dirigeant ? dirigeant.prenom + " " + dirigeant.nom : "",
    ASSOCIES: associes.map((a) => ({
      NOM: (a.prenom ?? "") + " " + (a.nom ?? ""),
      APPORT: String(a.apport ?? ""),
    })),
  };
}

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

  const donnees = donneesGabarit(brouillon);
  const produits = [];

  for (const document of aProduire) {
    const contenu = genererDocument(document.gabarit, donnees);
    const nom = nomDeStockage(".docx");
    const enregistre = await enregistrerDocumentProduit(dossier, document.titre, nom, contenu);
    produits.push({ id: enregistre.id, titre: document.titre });
  }

  return NextResponse.json({ ok: true, documents: produits }, { status: 201 });
});
