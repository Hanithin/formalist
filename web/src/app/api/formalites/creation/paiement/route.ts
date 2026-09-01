import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon, ouvrirLeReglementDeLaCreation } from "@/infrastructure/db/depots/brouillons";
import { premiereEtapeIncomplete } from "@/domain/formalite/parcours";
import { INTITULE, montantDeLOffre } from "@/domain/formalite/offres";
import { ouvrirPaiement, PaiementIndisponible } from "@/infrastructure/paiement/stripe";
import { adresseDeRetour } from "@/lib/site";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { journal } from "@/lib/journal";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/** Une heure : le temps de sortir sa carte, pas celui d'y penser une semaine. */
const OUVERTURE_SECONDES = 60 * 60;

/**
 * Ouvre le règlement d'une création.
 *
 * Ce parcours était le seul à ne pas encaisser : l'étape « Offres » notait un choix,
 * et le dossier partait chez l'avocat sans qu'un euro ait changé de main. Les quatre
 * autres formalités payantes ont cette route depuis longtemps ; celle-ci en est la
 * copie, aux règles de complétude près.
 *
 * Le montant est recalculé ici et non repris du navigateur : le prix affiché à l'écran
 * est une information, le prix facturé se décide au serveur. Sans quoi il suffirait
 * d'envoyer un autre chiffre.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  const { dossier: ligne, brouillon } = await ouvrirBrouillon(utilisateur, dossier);

  if (brouillon.paye) {
    return NextResponse.json({ error: "Ce dossier est déjà réglé" }, { status: 409 });
  }

  /*
   * Un dossier incomplet ne se paie pas.
   *
   * L'avocat recevrait des actes troués qu'il ne peut pas déposer, et il faudrait
   * rembourser. La cinquième étape - les pièces - ne retient pas : elle se complète
   * après la transmission, quand la banque délivre l'attestation de dépôt.
   */
  const bloquante = premiereEtapeIncomplete(brouillon);
  if (bloquante !== null && bloquante < 5) {
    return NextResponse.json(
      { error: "Complétez votre dossier avant de le confier", etape: bloquante },
      { status: 400 }
    );
  }

  const montant = montantDeLOffre(brouillon.offre);
  if (montant === null) {
    return NextResponse.json(
      { error: "Choisissez une formule avant de régler", etape: 6 },
      { status: 400 }
    );
  }

  const base = adresseDeRetour(requete, "/creation");

  try {
    const { reference, adresse } = await ouvrirPaiement({
      dossierId: ligne.id,
      intitule: INTITULE,
      montantCentimes: montant,
      email: utilisateur.email,
      /*
       * Le retour d'un règlement abouti mène aux actes, l'abandon aux offres : revenir
       * de la banque après un paiement réussi doit montrer ce qu'on vient d'acheter ;
       * revenir d'un abandon doit ramener là où l'on paie.
       */
      retour: base + "?dossier=" + ligne.id + "&etape=7&session={SESSION}",
      abandon: base + "?dossier=" + ligne.id + "&etape=6&paiement=annule",
      expireDans: OUVERTURE_SECONDES,
    });

    await ouvrirLeReglementDeLaCreation(utilisateur, ligne.id, reference);
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
      journal.error({ err: e, dossier: ligne.id }, "Paiement indisponible, règlement non ouvert");
      return NextResponse.json(
        { error: "Le paiement est momentanément indisponible. Réessayez dans un instant." },
        { status: 503 }
      );
    }
    throw e;
  }
});
