import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerRole } from "@/infrastructure/db/utilisateur-courant";
import { validerCorps, validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { exigerDossier } from "@/infrastructure/db/depots/dossiers";
import { lireBrouillon } from "@/infrastructure/db/depots/brouillons";
import { identifiantsDeLAvocat } from "@/infrastructure/db/depots/identifiants-guichet";
import { identifiantsDeLEnvironnement } from "@/infrastructure/guichet/transport";
import { deposerLaCreation } from "@/infrastructure/guichet/depot";
import { formaliteDeCreation } from "@/domain/guichet/creation";
import { referenceDuDossier } from "@/infrastructure/guichet/formalites";
import { compteDeLAvocat } from "@/infrastructure/db/depots/identifiants-guichet";
import { marquerLeDepotAuGuichet } from "@/infrastructure/db/depots/avocat";
import { etatDesPiecesDuDossier } from "@/infrastructure/documents/verifier-pieces";
import { piecesDuCabinetIncompletes } from "@/domain/formalite/domiciliation";
import { piecesDuCabinet } from "@/infrastructure/db/depots/pieces-cabinet";

/**
 * Déposer un dossier de création au guichet unique.
 *
 * Réservé à l'avocat : c'est lui qui dépose, sous son compte e-procedures, et la
 * formalité part en son nom.
 *
 * Trois refus avant l'appel, dans cet ordre - du moins coûteux au plus :
 *
 *   - le dossier doit être une création ; la modification exige une signature par
 *     certificat électronique que nous ne savons pas encore produire ;
 *   - il doit être complet, au sens des pièces attendues : déposer sans une attestation
 *     de dépôt de capital, c'est faire rejeter la formalité une semaine plus tard ;
 *   - l'avocat doit avoir connecté son compte, faute de quoi l'écran ouvre la fenêtre de
 *     connexion plutôt que d'afficher une erreur.
 *
 * Le compte du serveur reste en repli : un cabinet qui n'en a qu'un n'a pas à le saisir.
 */

const SCHEMA = z.object({
  dossier: schemas.identifiant,
  /* Ce que le dossier ne porte pas : l'avocat le fournit au moment de déposer. */
  complement: z
    .object({
      categorisationActivite: z.array(z.string().trim().min(1)).max(4).optional(),
      codeInseeNaissance: z.record(z.string(), z.string().trim()).optional(),
      publicationLegale: z
        .object({
          journal: z.string().trim().optional(),
          date: z.string().trim().optional(),
          lieu: z.string().trim().optional(),
        })
        .optional(),
    })
    .default({}),
});

export class DossierNonDeposable extends Error {
  readonly statut = 409;
  constructor(message: string) {
    super(message);
    this.name = "DossierNonDeposable";
  }
}

export class CompteGuichetAbsent extends Error {
  readonly statut = 428;
  constructor() {
    super("Connectez votre compte du guichet unique avant de déposer");
    this.name = "CompteGuichetAbsent";
  }
}

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerRole("avocat", "admin");
  const { dossier: dossierId, complement } = await validerCorps(SCHEMA, requete);

  const dossier = await exigerDossier(utilisateur, dossierId);
  if (dossier.type && dossier.type !== "creation") {
    throw new DossierNonDeposable(
      "Seules les créations se déposent d'un clic : une modification demande une signature par certificat"
    );
  }

  const pieces = await etatDesPiecesDuDossier(dossierId);
  if (!pieces.complet) {
    throw new DossierNonDeposable(
      "Le dossier est incomplet : " +
        pieces.manquantes.concat(pieces.refusees).map((p) => p.titre).join(", ")
    );
  }

  const compte =
    (await identifiantsDeLAvocat(utilisateur.id)) ?? identifiantsDeLEnvironnement(false);
  if (!compte) throw new CompteGuichetAbsent();

  /*
   * Les codes INSEE arrivent en clés de texte - le JSON n'en connaît pas d'autres - et
   * le domaine les indexe par rang d'associé.
   */
  const codeInseeNaissance = Object.fromEntries(
    Object.entries(complement.codeInseeNaissance ?? {}).map(([rang, code]) => [Number(rang), code])
  );

  /*
   * `data_json` est une colonne de texte, non un JSON de PostgreSQL.
   *
   * Prisma la rend donc telle quelle, en chaîne. La traiter comme un objet ne lève
   * rien : tous ses champs valent `undefined`, la forme juridique manque, et le dossier
   * le plus complet se déclare intraduisible. `lireBrouillon` est le seul chemin - c'est
   * par lui que passent la production des actes et le parcours.
   */
  const resultat = await deposerLaCreation(
    dossierId,
    lireBrouillon(dossier.data_json),
    { ...complement, codeInseeNaissance },
    compte
  );

  /* Le dossier suit : le dépôt est fait, le client doit le voir. */
  await marquerLeDepotAuGuichet(utilisateur, dossierId);

  return NextResponse.json(resultat);
});

/**
 * Ce qui empêche encore de déposer.
 *
 * L'écran le demande avant d'ouvrir sa fenêtre : il n'a rien à deviner de ce que le
 * guichet exige, et la liste reste juste le jour où elle change - elle vient du code qui
 * traduit, non d'un formulaire écrit à côté.
 *
 * Aucun appel à l'INPI ici : on lit notre dossier. Une panne du guichet ne doit pas
 * empêcher de savoir ce qu'il manque.
 */
export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerRole("avocat", "admin");
  const { dossier: dossierId } = validerParametres(
    z.object({ dossier: z.coerce.number().int().positive() }),
    new URL(requete.url)
  );

  const dossier = await exigerDossier(utilisateur, dossierId);
  const pieces = await etatDesPiecesDuDossier(dossierId);
  const brouillon = lireBrouillon(dossier.data_json);

  const { manques } = formaliteDeCreation(brouillon, referenceDuDossier(dossierId));

  /*
   * Le classeur du cabinet compte comme le dossier.
   *
   * Quand c'est le cabinet qui domicilie, un extrait Kbis de plus de trois mois fait
   * refuser le dépôt au greffe. L'écran doit le dire avant qu'on appuie, non après :
   * c'est le même refus, et il se répare dans l'administration plutôt que sur le
   * dossier.
   */
  if (brouillon.modeDomiciliation === "Domiciliation au cabinet") {
    const deposees = (await piecesDuCabinet()).map((piece) => ({
      identifiant: piece.identifiant,
      etabliLe: piece.etabliLe,
    }));

    for (const { piece, etat } of piecesDuCabinetIncompletes(deposees)) {
      manques.push({
        chemin: "cabinet." + piece.identifiant,
        quoi:
          piece.titre +
          (etat === "absente"
            ? " : à déposer dans l'administration du cabinet"
            : etat === "perimee"
              ? " : plus de trois mois, à renouveler"
              : " : sa date n'est pas renseignée"),
        origine: "configuration",
      });
    }
  }

  /* Les dirigeants, pour que l'écran sache de qui il demande la commune de naissance. */
  const associes = brouillon.associes ?? [];
  const dirigeants = (brouillon.dirigeants ?? []).map((dirigeant, rang) => {
    const rangAssocie = typeof dirigeant.associe === "number" ? dirigeant.associe : rang;
    const personne = associes[rangAssocie]?.personne ?? dirigeant.personne;
    return {
      rang: rangAssocie,
      nom: [personne?.prenom, personne?.nom].filter(Boolean).join(" "),
      villeDeNaissance: personne?.villeDeNaissance ?? null,
    };
  });

  return NextResponse.json({
    type: dossier.type ?? "creation",
    piecesCompletes: pieces.complet,
    piecesManquantes: pieces.manquantes.concat(pieces.refusees).map((p) => p.titre),
    manques,
    dirigeants,
    compte: await compteDeLAvocat(utilisateur.id),
    /* Un cabinet qui n'a qu'un compte le pose dans l'environnement : rien à saisir. */
    compteDuServeur: identifiantsDeLEnvironnement(false) !== null,
  });
});
