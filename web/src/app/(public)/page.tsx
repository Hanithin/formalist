import { redirect } from "next/navigation";

/**
 * La racine mène à la connexion.
 *
 * La vitrine vit désormais sur un autre site : ce domaine ne sert plus que
 * l'application. Ouvrir formalist.fr, c'est vouloir entrer, pas lire une page de
 * présentation - on abrège donc le détour.
 */
export default function Racine() {
  redirect("/connexion");
}
