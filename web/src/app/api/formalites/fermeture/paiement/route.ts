import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirFermeture,
  ouvrirLeReglementDeLaFermeture,
} from "@/infrastructure/db/depots/fermeture";
import { manquesDeLaPhase, unipersonnelleDans } from "@/domain/fermeture/verification";
import { devisDeFermeture, INTITULE } from "@/domain/fermeture/offre";
import { estUnipersonnelle } from "@/domain/fermeture/voie";
import { ouvrirPaiement, PaiementIndisponible } from "@/infrastructure/paiement/stripe";
import { adresseDeRetour } from "@/lib/site";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { journal } from "@/lib/journal";
import { cequiRetientLeReglement } from "@/infrastructure/documents/verifier-pieces";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/** Une heure : le temps de sortir sa carte, pas celui d'y penser une semaine. */
const OUVERTURE_SECONDES = 60 * 60;

/**
 * Ouvre le règlement d'une fermeture.
 *
 * Le montant se recalcule ici. Il couvre les deux phases : la clôture, des mois plus
 * tard, ne se repaie pas. Le devis affiché à l'écran est une information ; le prix se
 * décide côté serveur.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  const { fermeture } = await ouvrirFermeture(utilisateur, dossier);

  if (fermeture.paye) {
    return NextResponse.json({ error: "Ce dossier est déjà réglé" }, { status: 409 });
  }

  if (fermeture.voie === null || fermeture.voie === "liquidation-judiciaire") {
    return NextResponse.json(
      {
        error:
          "Cette société ne peut pas être fermée à l'amiable : la cessation des paiements se déclare au tribunal",
      },
      { status: 400 }
    );
  }

  /*
   * On ne fait payer que la dissolution vérifiée.
   *
   * La clôture n'est pas encore saisie - elle ne le sera qu'après la liquidation - et
   * l'exiger ici rendrait le paiement impossible.
   */
  const manques = manquesDeLaPhase({
    voie: fermeture.voie,
    phase: "dissolution",
    societe: fermeture.societe,
    valeurs: fermeture.valeurs,
    nombreDAssocies: fermeture.associes.length,
  });
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

  const montant = devisDeFermeture({
    voie: fermeture.voie,
    associeUniqueDirigeant:
      estUnipersonnelle(fermeture.societe.forme) &&
      unipersonnelleDans({
        societe: fermeture.societe,
        nombreDAssocies: fermeture.associes.length,
      }),
  });

  const base = adresseDeRetour(requete, "/fermeture");

  try {
    const { reference, adresse } = await ouvrirPaiement({
      dossierId: dossier,
      intitule: INTITULE,
      montantCentimes: montant.totalTTC,
      email: utilisateur.email,
      retour: base + "?dossier=" + dossier + "&etape=4&session={SESSION}",
      abandon: base + "?dossier=" + dossier + "&etape=4&paiement=annule",
      expireDans: OUVERTURE_SECONDES,
    });

    await ouvrirLeReglementDeLaFermeture(utilisateur, dossier, reference);
    return NextResponse.json({ adresse });
  } catch (e) {
    if (e instanceof PaiementIndisponible) {
      /*
       * La raison ne se lit que dans les traces.
       *
       * « Réessayez dans un instant » convient à une panne passagère, et c'est ce que
       * lit le client. Mais la cause la plus fréquente n'est pas passagère - une clé
       * Stripe absente de l'environnement - et réessayer n'y changera jamais rien.
       * Sans cette ligne, un dépôt bloqué ne laissait aucune trace de son motif.
       */
      journal.error({ err: e, dossier }, "Paiement indisponible, règlement non ouvert");
      return NextResponse.json(
        { error: "Le paiement est momentanément indisponible. Réessayez dans un instant." },
        { status: 503 }
      );
    }
    throw e;
  }
});
