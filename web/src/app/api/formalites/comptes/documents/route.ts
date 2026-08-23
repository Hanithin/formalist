import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirComptes } from "@/infrastructure/db/depots/comptes";
import { verifierComptes } from "@/domain/comptes/verification";
import { donneesDesComptes } from "@/domain/comptes/gabarit";
import { actesDesComptes } from "@/domain/comptes/actes";
import { genererDocument } from "@/infrastructure/documents/generation";
import { renumeroterLesResolutions } from "@/infrastructure/documents/resolutions";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { remplacerDocumentsProduits } from "@/infrastructure/documents/depot";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les actes de l'approbation.
 *
 * Le procès-verbal toujours ; le rapport spécial seulement quand la loi l'exige ; la
 * déclaration de confidentialité seulement quand la société y a droit et la demande.
 * Ces conditions vivent dans le domaine : le décider ici les répandrait dans un écran
 * et une route, qui finiraient par ne plus dire la même chose.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { comptes } = await ouvrirComptes(utilisateur, dossier);

  // Un dossier incomplet produirait des actes troués, qui partiraient au greffe.
  const manques = verifierComptes(comptes);
  if (manques.length > 0) {
    return NextResponse.json({ error: "Le dossier est incomplet", manques }, { status: 400 });
  }

  const societe = {
    ...comptes.societe,
    villeRcs:
      comptes.societe.villeRcs ||
      villeDuRcs(comptes.societe.codePostal, comptes.societe.ville),
  };

  const nb = (v: unknown) => {
    const lu = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(lu) ? lu : 0;
  };

  const aProduire = actesDesComptes({
    forme: societe.forme,
    nombreDAssocies: comptes.associes.length,
    avecCommissaire: comptes.valeurs.commissaireAuxComptes === "Oui",
    nombreDeConventions: comptes.conventions.length,
    chiffres: {
      totalBilanCentimes: Math.round(nb(comptes.valeurs.totalBilan) * 100),
      chiffreAffairesCentimes: Math.round(nb(comptes.valeurs.chiffreAffaires) * 100),
      effectif: nb(comptes.valeurs.effectif),
    },
    exclusions: comptes.exclusions,
    demandeLaConfidentialite: comptes.demandeLaConfidentialite,
  });

  const donnees = donneesDesComptes({ ...comptes, societe });

  const actes = aProduire.map((acte) => ({
    titre: acte.titre,
    contenu: typographierLeDocument(
      renumeroterLesResolutions(genererDocument(acte.gabarit, donnees))
    ),
  }));

  /*
   * Ce que produit le cabinet attend sa relecture.
   *
   * Une approbation de comptes passe par un avocat : ses actes ne sont des documents
   * qu'une fois relus, et le client ne doit pas les déposer au greffe avant.
   */
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
