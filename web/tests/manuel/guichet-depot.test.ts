import { it } from "vitest";
import { formaliteDeCreation, type ComplementDeDepot } from "@/domain/guichet/creation";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { PIECES_DES_ACTES } from "@/domain/guichet/pieces";
import { demander, enProduction, hoteDuGuichet } from "@/infrastructure/guichet/transport";
import { detailDuDepot } from "@/infrastructure/guichet/formalites";
import { lireLeStatut } from "@/domain/guichet/statut";
import { joindreLaPiece, pieceDepuisUnActe } from "@/infrastructure/guichet/pieces";

/**
 * Un dépôt de création, contre le guichet de démonstration.
 *
 * Ce que ce test cherche à apprendre - et qu'aucune lecture du contrat ne donne avec
 * certitude :
 *
 *   1. la forme exacte du corps de `POST /api/formalities` : ce qui est obligatoire au
 *      premier appel, et ce qui se complète ensuite ;
 *   2. lesquels des champs que `contenuDeLaCreation` signale manquants sont réellement
 *      bloquants - la liste des `manques` est notre lecture du dictionnaire, pas celle
 *      du serveur ;
 *   3. le statut rendu juste après le dépôt : une création par mandataire ne passe pas
 *      par la signature, reste à voir si le règlement est prélevé ou attendu ;
 *   4. qu'une pièce jointe passe : conversion PDF, base64, code `typeDocument`.
 *
 * Il n'assert presque rien : il dépose et il raconte. Un refus est une réponse - c'est
 * même la réponse la plus instructive - et son corps est écrit en entier plutôt que
 * résumé, parce que c'est là que l'INPI nomme les champs qu'il attend.
 *
 * Hors de la suite : il appelle un tiers et laisse une trace chez lui.
 *   npm run guichet:depot
 */

/**
 * Une référence qu'aucun dossier ne porte.
 *
 * `referenceDuDossier` rend « FORMALIST-12 », et `dossierDeLaReference` ne reconnaît
 * que des chiffres : un essai qui emprunterait cette forme se rattacherait au dossier
 * 12 à la première synchronisation. Le mot « ESSAI » l'en empêche par construction.
 */
const REFERENCE = "FORMALIST-ESSAI-" + Date.now();

const brouillon = {
  forme: "SASU",
  denomination: "ROSEBERRY CAPITAL",
  activite: "Le conseil en stratégie et en organisation",
  adresse: "34 Rue Laugier",
  codePostal: "75017",
  ville: "Paris",
  modeDomiciliation: "Domicile personnel du dirigeant",
  occupationDomicile: "Propriétaire",
  banque: "Shine",
  capital: 20000,
  capitalLibere: 20000,
  partsTotales: 2000,
  dureeDeVie: 99,
  optionFiscale: "IS",
  regimeTva: "Régime réel simplifié",
  dateDebutActivite: "2026-10-01",
  dateCloturePremierExercice: "2027-12-31",
  associes: [
    {
      type: "physique",
      parts: 2000,
      versement: 20000,
      personne: {
        civilite: "Madame",
        prenom: "Amel",
        nom: "Belouafi",
        dateDeNaissance: "1996-01-27",
        villeDeNaissance: "Argenteuil",
        codePostalDeNaissance: "95100",
        paysDeNaissance: "France",
        nationalite: "Française",
        situationMatrimoniale: "Célibataire",
        nomDuPere: "BELOUAFI Karim",
        nomDeLaMere: "SAADI Nadia",
        adresse: "34 Rue Laugier",
        codePostal: "75017",
        ville: "Paris",
      },
    },
  ],
  dirigeants: [{ associe: 0, remuneration: "Non rémunéré", regimeSocial: "Assimilé salarié" }],
};

function raconter(titre: string, valeur: unknown) {
  console.log("\n" + titre + "\n" + JSON.stringify(valeur, null, 2));
}

it("dépose une création de démonstration, et dit ce que le guichet en fait", async () => {
  /*
   * La production ne sert pas d'essai.
   *
   * Un dépôt réel n'est pas annulable et se paye. Le garde-fou est ici plutôt que dans
   * la consigne d'emploi : une variable d'environnement mal posée ne doit pas suffire.
   */
  if (enProduction()) {
    throw new Error(
      "Ce test dépose : il ne s'exécute que sur la démonstration. GUICHET_HOTE vise " +
        hoteDuGuichet() +
        "."
    );
  }
  console.log("Hôte      : " + hoteDuGuichet());
  console.log("Référence : " + REFERENCE);

  /*
   * Ce que le dossier ne porte pas, et que l'avocat fournira au dépôt.
   *
   * Trois trous, et trois seulement, depuis que le domaine sait composer le reste : la
   * catégorisation de l'activité - un choix dans l'arbre de l'INPI, « 07 > 04 > 08 > 02 »
   * pour du conseil - la commune de naissance en code INSEE, et l'annonce légale une
   * fois parue.
   */
  const complement: ComplementDeDepot = {
    categorisationActivite: ["07", "04", "08", "02"],
    codeInseeNaissance: { 0: "95018" },
    publicationLegale: { journal: "Actu-Juridique", date: "2026-10-01", lieu: "Paris" },
  };

  const { corps, manques } = formaliteDeCreation(brouillon as never, REFERENCE, complement);

  console.log("\nManques annoncés par le domaine : " + manques.length);
  for (const manque of manques) {
    console.log("  [" + manque.origine + "] " + manque.chemin + " - " + manque.quoi);
  }

  let depose: unknown;
  try {
    depose = await demander("/api/formalities", {
      method: "POST",
      body: JSON.stringify(corps),
    });
  } catch (e) {
    /*
     * Le refus est la leçon.
     *
     * Le corps d'une erreur du guichet nomme les champs qu'il attend, chemin par
     * chemin : c'est lui qui dira si nos quatre manques sont bloquants, et s'il en
     * existe d'autres que le dictionnaire nous a fait manquer.
     */
    const refus = e as { statutHttp?: number; corps?: unknown; message?: string };
    raconter(
      "Le guichet a refusé le dépôt" + (refus.statutHttp ? " (" + refus.statutHttp + ")" : "") + " :",
      refus.corps ?? refus.message ?? e
    );
    throw e;
  }

  raconter("Formalité créée :", depose);

  const id = (depose as { id?: unknown } | null)?.id;
  if (typeof id !== "number") {
    throw new Error("Le guichet n'a pas rendu d'identifiant de formalité : rien à poursuivre.");
  }

  /*
   * Une seule pièce, la plus lourde.
   *
   * Les statuts font une vingtaine de pages : si le format, l'encodage et le plafond de
   * dix mégaoctets passent pour eux, ils passeront pour les quatre autres actes. Un
   * essai qui en joindrait cinq n'apprendrait rien de plus et laisserait cinq traces.
   */
  const donnees = donneesDeGabarit(brouillon as never, { villeRcs: "Paris" } as never);
  const statuts = await pieceDepuisUnActe(
    "Statuts constitutifs.pdf",
    PIECES_DES_ACTES.statuts[0],
    genererDocument("sasu-statuts.docx", donnees)
  );
  console.log(
    "\nStatuts convertis : " + Math.round(statuts.pdf.byteLength / 1024) + " Ko, code " +
      statuts.type.code
  );

  try {
    raconter("Pièce jointe :", await joindreLaPiece(id, statuts));
  } catch (e) {
    const refus = e as { statutHttp?: number; corps?: unknown; message?: string };
    raconter("La pièce a été refusée :", refus.corps ?? refus.message ?? e);
    throw e;
  }

  /*
   * La signature, qui pour une création tient en un appel.
   *
   * Le contrat distingue deux régimes. La création se signe « simple » : un POST avec le
   * seul champ `formality`, sans certificat ni document à téléverser. La modification et
   * la cessation se signent « complexe » - il faut télécharger la synthèse, la signer
   * avec un certificat d'une autorité de la liste `tl-fr.xml`, et remonter le PDF signé.
   *
   * Le rafraîchissement précède : il regénère le document de synthèse et recalcule le
   * panier. Signer une synthèse qui ne porte pas la pièce qu'on vient de joindre, c'est
   * signer autre chose que ce qu'on dépose.
   */
  raconter("Panier rafraîchi :", await demander("/api/formalities/" + id + "/refresh"));

  try {
    raconter(
      "Signature :",
      await demander("/api/signatures", {
        method: "POST",
        body: JSON.stringify({ formality: "/api/formalities/" + id }),
      })
    );
  } catch (e) {
    const refus = e as { statutHttp?: number; corps?: unknown; message?: string };
    raconter("La signature a été refusée :", refus.corps ?? refus.message ?? e);
    throw e;
  }

  /*
   * L'état après dépôt, relu chez le guichet.
   *
   * C'est la réponse qu'on est venu chercher : `PAYMENT_PENDING` dirait que la
   * signature a porté et qu'il ne reste que le règlement, `SIGNATURE_PENDING` qu'elle
   * n'a pas pris, et tout autre statut que le trajet n'est pas celui qu'on croyait.
   */
  /*
   * Le statut ne bascule pas dans la seconde.
   *
   * Relu aussitôt après la signature, le dépôt annonce encore `SIGNATURE_PENDING` : le
   * guichet traite le panier puis l'avancement en tâche de fond. Lire une fois donnait
   * donc une réponse fausse à la seule question qu'on est venu poser. On attend le
   * changement, brièvement, et on dit ce qu'on a vu même s'il ne vient pas.
   */
  let relu = await detailDuDepot(id);
  for (let essai = 0; essai < 8 && relu?.statut === "SIGNATURE_PENDING"; essai++) {
    await new Promise((suite) => setTimeout(suite, 3000));
    relu = await detailDuDepot(id);
  }

  raconter("Relu chez le guichet :", relu);
  console.log("\nStatut après signature : " + (relu?.statut ?? "aucun"));
  console.log(lireLeStatut(relu?.statut ?? "").explication);
});
