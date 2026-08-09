import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/navigation/Sidebar";
import { utilisateurCourant } from "@/infrastructure/db/utilisateur-courant";
import styles from "./layout.module.css";

/**
 * Habillage commun à toutes les pages de l'application.
 *
 * La colonne de navigation est écrite ici, une fois. Les vingt et une pages du
 * serveur d'origine en portaient chacune leur copie.
 *
 * Le filtre de requêtes a déjà écarté les visiteurs sans cookie ; on revérifie
 * ici parce que lui ne peut pas atteindre la base, donc ne sait pas si la session
 * est encore valide.
 */
export default async function DispositionApplication({ children }: { children: ReactNode }) {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) redirect("/connexion");

  const chemin = (await headers()).get("x-chemin") ?? "";

  return (
    <div className={styles.page}>
      <Sidebar
        chemin={chemin}
        utilisateur={{ nom: utilisateur.nom, email: utilisateur.email, roles: utilisateur.roles }}
      />
      <div className={styles.contenu}>{children}</div>
    </div>
  );
}
