import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerRole } from "@/infrastructure/db/utilisateur-courant";
import { validerParametres } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { lireLeStatut } from "@/domain/guichet/statut";
import {
  enProduction,
  hoteDuGuichet,
  identifiantsDeLEnvironnement,
} from "@/infrastructure/guichet/transport";
import {
  depotDuDossier,
  detailDuDepot,
  referenceDuDossier,
} from "@/infrastructure/guichet/formalites";
import { identifiantsDeLAvocat } from "@/infrastructure/db/depots/identifiants-guichet";
import { depotConnu, noterLeDepot } from "@/infrastructure/db/depots/guichet";

/**
 * Ce que le guichet unique tient d'un dossier.
 *
 * Réservé à l'avocat : c'est lui qui dépose, et l'état d'un dépôt en cours n'a rien à
 * dire au client tant que le cabinet ne l'a pas relu.
 *
 * Le point d'accès interroge l'INPI et enregistre au passage ce qu'il apprend. Deux
 * raisons de ne pas se contenter de lire notre copie : elle peut être vieille de
 * plusieurs jours, et c'est ici que l'on veut voir échouer la liaison - pas au moment
 * de déposer.
 *
 * Une absence de dépôt est une réponse, non une erreur : la plupart des dossiers n'en
 * ont pas encore.
 */
const SCHEMA = z.object({ dossier: z.coerce.number().int().positive() });

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerRole("avocat", "admin");
  const { dossier } = validerParametres(SCHEMA, new URL(requete.url));

  const environnement = {
    hote: hoteDuGuichet(),
    production: enProduction(),
    reference: referenceDuDossier(dossier),
  };

  const compte =
    (await identifiantsDeLAvocat(utilisateur.id)) ?? identifiantsDeLEnvironnement(false);
  const connu = await depotConnu(dossier);

  /*
   * On lit par identifiant dès qu'on le connaît, jamais par la liste.
   *
   * Les deux ne disent pas la même chose. Le 8 septembre 2026, la formalité 266638
   * répondait `ERROR_DECLARATION_INSEE` à la recherche par référence et
   * `VALIDATION_PENDING` à la lecture par identifiant, au même instant - la liste est
   * une projection allégée et en retard, qui omet d'ailleurs la référence et le numéro
   * national qu'elle est censée porter. Un dossier restait donc figé sur une erreur que
   * le guichet avait résolue, et « Actualiser » n'y changeait rien.
   *
   * La recherche par référence garde un usage : retrouver un dépôt dont nous n'avons pas
   * encore l'identifiant.
   */
  const depot = connu?.formaliteId
    ? await detailDuDepot(connu.formaliteId, compte ?? undefined)
    : await depotDuDossier(dossier, compte ?? undefined);

  if (!depot) {
    /* Ce que nous en savions, s'il y a lieu : le guichet peut être muet sur un dépôt
       que nous avions vu, et le dire vaut mieux que rendre « rien ». */
    return NextResponse.json({ ...environnement, depot: null, connu });
  }

  await noterLeDepot(dossier, depot);
  const lecture = lireLeStatut(depot.statut ?? "");

  return NextResponse.json({
    ...environnement,
    depot: {
      id: depot.id,
      statut: depot.statut,
      statutLe: depot.statutLe,
      numNat: depot.numNat,
      typeFormalite: depot.typeFormalite,
      societe: depot.companyName,
      siren: depot.siren,
      attente: lecture.attente,
      explication: lecture.explication,
    },
  });
});
