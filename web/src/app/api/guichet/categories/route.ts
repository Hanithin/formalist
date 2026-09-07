import { NextResponse } from "next/server";
import { exigerRole } from "@/infrastructure/db/utilisateur-courant";
import { route } from "@/lib/reponses";
import { demander, identifiantsDeLEnvironnement } from "@/infrastructure/guichet/transport";
import { identifiantsDeLAvocat } from "@/infrastructure/db/depots/identifiants-guichet";

/**
 * L'arbre des catégories d'activité de l'INPI.
 *
 * C'est le seul champ d'une création qui demande un choix plutôt qu'une conversion : la
 * description libre du client ne s'y ramène pas, et le guichet en exige deux niveaux au
 * moins. L'arbre compte huit branches et quelques centaines de feuilles.
 *
 * Servi depuis chez eux plutôt qu'embarqué : une nomenclature recopiée vieillit sans
 * qu'on s'en aperçoive, et celle-ci n'a aucune raison de rester figée. Elle est gardée
 * en mémoire pour la journée - elle ne bouge pas d'une heure à l'autre, et la
 * retélécharger à chaque ouverture de fenêtre ferait attendre l'avocat pour rien.
 */

const DUREE = 24 * 60 * 60 * 1000;

let arbre: { valeur: unknown; obtenu: number } | null = null;

export const GET = route(async () => {
  const utilisateur = await exigerRole("avocat", "admin");

  if (arbre && Date.now() - arbre.obtenu < DUREE) {
    return NextResponse.json(arbre.valeur);
  }

  const compte =
    (await identifiantsDeLAvocat(utilisateur.id)) ?? identifiantsDeLEnvironnement(false);
  const valeur = await demander(
    "/api/data_dictionary/category_activities",
    {},
    compte ?? undefined
  );

  arbre = { valeur, obtenu: Date.now() };
  return NextResponse.json(valeur);
});
