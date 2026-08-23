import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { validerParametres } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * La ville du RCS d'un code postal.
 *
 * Le greffe compétent n'est pas celui de la commune : Argenteuil relève du RCS de
 * Pontoise, Sainte-Foy-lès-Lyon de celui de Lyon. Un acte qui écrit la commune se
 * fait refuser, et c'est précisément le genre d'erreur qu'on ne voit pas en la
 * recopiant à la main depuis un résultat de recherche.
 *
 * La table vit dans rcs.cjs et charge par createRequire : elle ne peut pas descendre
 * dans le navigateur. D'où ce point d'entrée, plutôt qu'une seconde copie de cent
 * communes côté client - deux copies finissent toujours par diverger.
 *
 * Indépendant du registre national : il répond même quand l'INPI n'est pas
 * configuré, ce qui est le cas courant en développement.
 */
const SCHEMA = z.object({
  codePostal: z.string().trim().max(10),
  ville: z.string().trim().max(120).optional(),
});

export const GET = route(async (requete: Request) => {
  await exigerUtilisateur();
  const { codePostal, ville } = validerParametres(SCHEMA, new URL(requete.url));

  return NextResponse.json({ villeRcs: villeDuRcs(codePostal, ville ?? "") });
});
