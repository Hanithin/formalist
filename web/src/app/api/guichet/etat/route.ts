import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerRole } from "@/infrastructure/db/utilisateur-courant";
import { validerParametres } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { lireLeStatut } from "@/domain/guichet/statut";
import { enProduction, hoteDuGuichet } from "@/infrastructure/guichet/transport";
import { depotDuDossier, referenceDuDossier } from "@/infrastructure/guichet/formalites";
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
  await exigerRole("avocat", "admin");
  const { dossier } = validerParametres(SCHEMA, new URL(requete.url));

  const environnement = {
    hote: hoteDuGuichet(),
    production: enProduction(),
    reference: referenceDuDossier(dossier),
  };

  const depot = await depotDuDossier(dossier);
  if (!depot) {
    /* Ce que nous en savions, s'il y a lieu : le guichet peut être muet sur un dépôt
       que nous avions vu, et le dire vaut mieux que rendre « rien ». */
    const connu = await depotConnu(dossier);
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
