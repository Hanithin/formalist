import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirModification,
  ouvrirLeReglement,
} from "@/infrastructure/db/depots/modifications";
import { verifierModification } from "@/domain/modification/verification";
import { devis, INTITULE } from "@/domain/modification/offre";
import { statutsAMettreAJour } from "@/domain/modification/formalites";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { ouvrirPaiement, PaiementIndisponible } from "@/infrastructure/paiement/stripe";
import { adresseDeRetour } from "@/lib/site";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { cequiRetientLeReglement } from "@/infrastructure/documents/verifier-pieces";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/** Une heure : le temps de sortir sa carte, pas celui d'y penser une semaine. */
const OUVERTURE_SECONDES = 60 * 60;

/**
 * Ouvre le règlement d'une modification.
 *
 * Le montant est recalculé ici et non repris du navigateur : le devis affiché à
 * l'écran est une information, le prix se décide côté serveur. Sans quoi il suffirait
 * d'envoyer un autre chiffre.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);

  const { modification } = await ouvrirModification(utilisateur, dossier);

  if (modification.paye) {
    return NextResponse.json({ error: "Ce dossier est déjà réglé" }, { status: 409 });
  }

  // Un dossier incomplet ne se paie pas : l'avocat recevrait un dossier qu'il ne peut
  // pas déposer, et il faudrait rembourser.
  const manques = verifierModification(
    modification.codes,
    modification.valeurs,
    modification.societe,
    modification.assemblee,
    modification.cessions
  );
  if (manques.length > 0) {
    return NextResponse.json(
      { error: "Complétez votre dossier avant de le confier", manques },
      { status: 400 }
    );
  }

  const ressortActuel = villeDuRcs(modification.societe.codePostal, modification.societe.ville);
  const ressortNouveau = villeDuRcs(
    typeof modification.valeurs.nouveauCodePostal === "string"
      ? modification.valeurs.nouveauCodePostal
      : "",
    typeof modification.valeurs.nouvelleVille === "string" ? modification.valeurs.nouvelleVille : ""
  );


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

  const montant = devis({
    codes: modification.codes,
    ressortActuel,
    ressortNouveau,
    depotDesStatuts: statutsAMettreAJour(modification.codes),
  });

  const base = adresseDeRetour(requete, "/modification");

  try {
    const { reference, adresse } = await ouvrirPaiement({
      dossierId: dossier,
      intitule: INTITULE,
      montantCentimes: montant.totalTTC,
      email: utilisateur.email,
      /*
       * Le retour d'un règlement abouti mène aux actes, l'abandon au règlement.
       *
       * Les deux pointaient sur la même étape, du temps où le règlement était le
       * dernier écran. Depuis que les actes le suivent, revenir de la banque après un
       * paiement réussi doit montrer ce qu'on vient d'acheter ; revenir d'un abandon
       * doit ramener là où l'on paie, non sur une étape encore verrouillée.
       */
      retour: base + "?dossier=" + dossier + "&etape=7&session={SESSION}",
      abandon: base + "?dossier=" + dossier + "&etape=6&paiement=annule",
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
