import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirCessation,
  ouvrirLeReglementDeLaCessation,
} from "@/infrastructure/db/depots/cessation";
import { verifierCessation } from "@/domain/cessation/verification";
import { devisDeCessation, INTITULE } from "@/domain/cessation/offre";
import { ouvrirPaiement, PaiementIndisponible } from "@/infrastructure/paiement/stripe";
import { adresseDeRetour } from "@/lib/site";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/** Une heure : le temps de sortir sa carte, pas celui d'y penser une semaine. */
const OUVERTURE_SECONDES = 60 * 60;

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  const { cessation } = await ouvrirCessation(utilisateur, dossier);

  if (cessation.paye) {
    return NextResponse.json({ error: "Ce dossier est déjà réglé" }, { status: 409 });
  }

  const manques = verifierCessation(cessation);
  if (manques.length > 0) {
    return NextResponse.json(
      { error: "Complétez votre dossier avant de le confier", manques },
      { status: 400 }
    );
  }

  const montant = devisDeCessation(cessation.nature);
  const base = adresseDeRetour(requete, "/cessation");

  try {
    const { reference, adresse } = await ouvrirPaiement({
      dossierId: dossier,
      intitule: INTITULE,
      montantCentimes: montant.totalTTC,
      email: utilisateur.email,
      retour: base + "?dossier=" + dossier + "&etape=3&session={SESSION}",
      abandon: base + "?dossier=" + dossier + "&etape=3&paiement=annule",
      expireDans: OUVERTURE_SECONDES,
    });

    await ouvrirLeReglementDeLaCessation(utilisateur, dossier, reference);
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
