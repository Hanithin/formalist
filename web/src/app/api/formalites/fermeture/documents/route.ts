import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirFermeture } from "@/infrastructure/db/depots/fermeture";
import { manquesDeLaPhase, unipersonnelleDans } from "@/domain/fermeture/verification";
import { donneesDeLaFermeture } from "@/domain/fermeture/gabarit";
import { actesDeLaFermeture } from "@/domain/fermeture/actes";
import { delaiDOpposition } from "@/domain/fermeture/delais";
import { genererDocument } from "@/infrastructure/documents/generation";
import { renumeroterLesResolutions } from "@/infrastructure/documents/resolutions";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { remplacerDocumentsProduits } from "@/infrastructure/documents/depot";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les actes de la phase en cours.
 *
 * La phase compte autant que la voie. Produire les comptes définitifs en même temps que
 * la dissolution donnerait au client un quitus signé avant la première opération de
 * liquidation, c'est-à-dire un acte antidaté - et une pièce que le greffe rapproche des
 * dates de l'annonce légale.
 *
 * Les actes déjà produits pour la phase précédente sont conservés : ils font partie du
 * dossier, et la clôture s'appuie sur la dissolution.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { fermeture } = await ouvrirFermeture(utilisateur, dossier);

  if (fermeture.voie === null || fermeture.voie === "liquidation-judiciaire") {
    return NextResponse.json(
      {
        error:
          "Cette société ne peut pas être fermée à l'amiable : la cessation des paiements se déclare au tribunal",
      },
      { status: 400 }
    );
  }

  const societe = {
    ...fermeture.societe,
    villeRcs:
      fermeture.societe.villeRcs ||
      villeDuRcs(fermeture.societe.codePostal, fermeture.societe.ville),
  };

  const manques = manquesDeLaPhase({
    voie: fermeture.voie,
    phase: fermeture.phase,
    societe,
    valeurs: fermeture.valeurs,
    nombreDAssocies: fermeture.associes.length,
  });
  if (manques.length > 0) {
    return NextResponse.json({ error: "Le dossier est incomplet", manques }, { status: 400 });
  }

  const opposition = delaiDOpposition(String(fermeture.valeurs.publicationBodacc ?? ""));

  const aProduire = actesDeLaFermeture({
    voie: fermeture.voie,
    phase: fermeture.phase,
    unipersonnelle: unipersonnelleDans({ societe, nombreDAssocies: fermeture.associes.length }),
    oppositionEcoulee: Boolean(opposition?.ecoule),
  });

  const donnees = donneesDeLaFermeture({
    voie: fermeture.voie,
    societe,
    associes: fermeture.associes,
    valeurs: fermeture.valeurs,
  });

  const actes = aProduire.map((acte) => ({
    titre: acte.titre,
    contenu: typographierLeDocument(
      renumeroterLesResolutions(genererDocument(acte.gabarit, donnees))
    ),
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
