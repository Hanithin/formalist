import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirDeclaration,
  ouvrirLeReglement,
} from "@/infrastructure/db/depots/auto-entrepreneur";
import { premiereEtapeIncomplete } from "@/domain/auto-entrepreneur/declaration";
import { INTITULE, PRIX_TTC_CENTIMES } from "@/domain/auto-entrepreneur/offre";
import { ouvrirPaiement, PaiementIndisponible } from "@/infrastructure/paiement/stripe";
import { adresseDeRetour } from "@/lib/site";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/** Une heure : le temps de sortir sa carte, pas celui d'y penser une semaine. */
const OUVERTURE_SECONDES = 60 * 60;

/**
 * Ouvre le règlement de la création d'auto-entreprise.
 *
 * Le paiement est hébergé par Stripe : aucune donnée bancaire ne traverse
 * l'application. La référence de session est retenue avant de renvoyer le client,
 * faute de quoi l'encaissement reviendrait sans savoir quel dossier confirmer.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  const { declaration } = await ouvrirDeclaration(utilisateur, dossier);

  // Un dossier déjà réglé ne se règle pas deux fois.
  if (declaration.paye) {
    return NextResponse.json({ error: "Ce dossier est déjà réglé" }, { status: 409 });
  }

  /*
   * Une déclaration incomplète ne se paie pas : l'avocat recevrait un dossier qu'il
   * ne peut pas déposer, et il faudrait rembourser.
   */
  const bloquante = premiereEtapeIncomplete(declaration);
  if (bloquante !== null) {
    return NextResponse.json(
      { error: "Complétez votre déclaration avant de la confier", etape: bloquante },
      { status: 400 }
    );
  }

  const base = adresseDeRetour(requete, "/auto-entrepreneur");

  try {
    const { reference, adresse } = await ouvrirPaiement({
      dossierId: dossier,
      intitule: INTITULE,
      montantCentimes: PRIX_TTC_CENTIMES,
      email: utilisateur.email,
      retour: base + "?dossier=" + dossier + "&etape=8&session={SESSION}",
      // L'abandon se marque dans l'adresse : sans cela on revient sur l'offre sans
      // savoir si quelque chose a été débité.
      abandon: base + "?dossier=" + dossier + "&etape=8&paiement=annule",
      expireDans: OUVERTURE_SECONDES,
    });

    await ouvrirLeReglement(utilisateur, dossier, reference);
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
