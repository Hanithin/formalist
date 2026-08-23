import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirModification } from "@/infrastructure/db/depots/modifications";
import { verifierModification } from "@/domain/modification/verification";
import { donneesDuGabarit, actesAProduire } from "@/domain/modification/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { renumeroterLesResolutions } from "@/infrastructure/documents/resolutions";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { remplacerDocumentsProduits } from "@/infrastructure/documents/depot";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les actes de la modification.
 *
 * Un seul procès-verbal porte toutes les résolutions : c'est une seule assemblée. Les
 * résolutions y sont renumérotées après rendu, les gabarits écrivant « RÉSOLUTION
 * UNIQUE » en tête de chaque section - juste tant qu'il n'y en a qu'une.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { modification } = await ouvrirModification(utilisateur, dossier);

  // Un dossier incomplet produirait des actes troués, qui partiraient au greffe en
  // l'état.
  const manques = verifierModification(
    modification.codes,
    modification.valeurs,
    modification.societe
  );
  if (manques.length > 0) {
    return NextResponse.json({ error: "Le dossier est incomplet", manques }, { status: 400 });
  }

  const societe = {
    ...modification.societe,
    villeRcs:
      modification.societe.villeRcs ||
      villeDuRcs(modification.societe.codePostal, modification.societe.ville),
  };

  const donnees = donneesDuGabarit({
    societe,
    assemblee: modification.assemblee,
    codes: modification.codes,
    valeurs: modification.valeurs,
    cessions: modification.cessions,
    villeRcsNouvelle: villeDuRcs(
      typeof modification.valeurs.nouveauCodePostal === "string"
        ? modification.valeurs.nouveauCodePostal
        : "",
      typeof modification.valeurs.nouvelleVille === "string" ? modification.valeurs.nouvelleVille : ""
    ),
  });

  const aProduire = actesAProduire(
    modification.codes,
    modification.societe.forme,
    modification.valeurs,
    /*
     * Le nombre d'associés décide du procès-verbal.
     *
     * Une SASU dont deux associés sont saisis n'a plus d'associé unique : l'acte
     * s'intitulait « DÉCISION DE L'ASSOCIÉ UNIQUE » et listait deux noms détenant
     * chacun des parts.
     */
    (modification.assemblee.associes ?? []).length
  );
  if (aProduire.length === 0) {
    return NextResponse.json({ error: "Aucun acte ne correspond" }, { status: 400 });
  }

  // Comme à la création : régénérer remplace le jeu précédent au lieu de l'empiler.
  const actes = aProduire.map((acte) => ({
    titre: acte.titre,
    /*
     * Rendu, renuméroté, puis typographié.
     *
     * La dernière passe ne peut pas se faire sur le gabarit : « {{PRIX_CESSION}} euros »
     * n'a pas de chiffre avant l'unité, et c'est une fois la valeur posée qu'on sait
     * qu'il faut lier « 2 000 » à « euros ».
     */
    contenu: typographierLeDocument(
      renumeroterLesResolutions(genererDocument(acte.gabarit, donnees))
    ),
  }));

  /*
   * Ce que produit le cabinet attend sa relecture.
   *
   * Une modification passe toujours par un avocat : ses actes ne sont des documents
   * qu'une fois relus, et le client ne doit pas les voir avant.
   */
  const { produits, conserves } = await remplacerDocumentsProduits(dossier, actes, {
    aRelire: true,
  });

  /*
   * L'état part avec le titre.
   *
   * Ce qu'on vient de produire attend l'avocat ; ce qui a été conservé lui a déjà
   * échappé, parce que relu ou signé - c'est justement pourquoi la régénération ne
   * l'a pas remplacé. L'écran doit pouvoir le dire : une liste de titres nus laisse
   * chercher un lien de téléchargement qui n'existe pas encore.
   */
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
