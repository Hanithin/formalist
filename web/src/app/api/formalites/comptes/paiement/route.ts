import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirComptes,
  ouvrirLeReglementDesComptes,
} from "@/infrastructure/db/depots/comptes";
import { verifierComptes } from "@/domain/comptes/verification";
import { devisDesComptes, INTITULE } from "@/domain/comptes/offre";
import { ouvrirPaiement, PaiementIndisponible } from "@/infrastructure/paiement/stripe";
import { adresseDeRetour } from "@/lib/site";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { cequiRetientLeReglement } from "@/infrastructure/documents/verifier-pieces";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/** Une heure : le temps de sortir sa carte, pas celui d'y penser une semaine. */
const OUVERTURE_SECONDES = 60 * 60;

/**
 * Ouvre le règlement d'un dépôt de comptes.
 *
 * Le montant est recalculé ici et non repris du navigateur : le devis affiché à
 * l'écran est une information, le prix se décide côté serveur.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  const { comptes } = await ouvrirComptes(utilisateur, dossier);

  if (comptes.paye) {
    return NextResponse.json({ error: "Ce dossier est déjà réglé" }, { status: 409 });
  }

  const manques = verifierComptes(comptes);
  if (manques.length > 0) {
    return NextResponse.json(
      { error: "Complétez votre dossier avant de le confier", manques },
      { status: 400 }
    );
  }


  /*
   * Les justificatifs retiennent le règlement, ici aussi.
   *
   * L'écran de saisie le disait déjà, mais le contrôle vivait dans la page - et une
   * page se contourne. Payer sans les pièces fait partir un dossier que l'avocat ne
   * peut pas déposer : il relance quelqu'un qui a quitté l'application, et la
   * formalité attend.
   */
  const manquePiece = await cequiRetientLeReglement(dossier);
  if (manquePiece) {
    return NextResponse.json({ error: manquePiece }, { status: 400 });
  }

  const montant = devisDesComptes({
    forme: comptes.societe.forme,
    confidentialite: comptes.demandeLaConfidentialite,
  });

  const base = adresseDeRetour(requete, "/depot-des-comptes");

  try {
    const { reference, adresse } = await ouvrirPaiement({
      dossierId: dossier,
      intitule: INTITULE,
      montantCentimes: montant.totalTTC,
      email: utilisateur.email,
      retour: base + "?dossier=" + dossier + "&etape=7&session={SESSION}",
      // L'abandon se marque dans l'adresse : sans cela on revient sur l'offre sans
      // savoir si quelque chose a été débité.
      abandon: base + "?dossier=" + dossier + "&etape=7&paiement=annule",
      expireDans: OUVERTURE_SECONDES,
    });

    await ouvrirLeReglementDesComptes(utilisateur, dossier, reference);
    return NextResponse.json({ adresse });
  } catch (e) {
    if (e instanceof PaiementIndisponible) {
      return NextResponse.json(
        { error: "Le paiement est momentanément indisponible. Réessayez dans un instant." },
        { status: 503 }
      );
    }
    throw e;
  }
});
