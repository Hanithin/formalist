import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirModification } from "@/infrastructure/db/depots/modifications";
import { verifierModification, documentsModification } from "@/domain/formalite/modifications";
import { genererDocument } from "@/infrastructure/documents/generation";
import { remplacerDocumentsProduits } from "@/infrastructure/documents/depot";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { brouillon } = await ouvrirModification(utilisateur, dossier);

  const type = brouillon.typeModification ?? "";
  const valeurs = brouillon.valeurs ?? {};

  // Un dossier incomplet produirait un procès-verbal troué, qui partirait au
  // greffe en l'état.
  const manques = verifierModification(type, valeurs);
  if (manques.length > 0) {
    return NextResponse.json(
      { error: "Le dossier est incomplet", manques },
      { status: 400 }
    );
  }

  const aProduire = documentsModification(type, brouillon.forme);
  if (aProduire.length === 0) {
    return NextResponse.json({ error: "Aucun document ne correspond" }, { status: 400 });
  }

  // Les champs reprennent les noms attendus par les gabarits Word.
  const donnees: Record<string, unknown> = {
    SOCIETE_NOM: brouillon.denomination ?? "",
    SOCIETE_FORME: brouillon.forme ?? "",
    ...Object.fromEntries(
      Object.entries(valeurs).map(([cle, valeur]) => [cle.toUpperCase(), String(valeur)])
    ),
  };

  // Comme pour la création : régénérer remplace le jeu précédent au lieu de l'empiler.
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
