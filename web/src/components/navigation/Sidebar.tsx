import Link from "next/link";
import { menuPour, entreeActive } from "@/domain/navigation/menu";
import type { Role } from "@/domain/acces/regles";
import styles from "./Sidebar.module.css";

interface Props {
  chemin: string;
  utilisateur: { nom: string; email: string; roles: Role[] };
}

/** Initiales pour l'avatar : « Hani Madfai » donne HM. */
function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

export function Sidebar({ chemin, utilisateur }: Props) {
  const groupes = menuPour(utilisateur.roles);
  const active = entreeActive(chemin, groupes);
  const estAdmin = utilisateur.roles.includes("admin");

  return (
    <aside className={styles.colonne}>
      <div className={styles.entete}>
        <Link href="/tableau-de-bord" className={styles.logo}>
          formalist
        </Link>
        {estAdmin && <span className={styles.badgeAdmin}>Admin</span>}
      </div>

      <Link href="/creation?type=creation" className={styles.action}>
        Créer une formalité
      </Link>

      <nav className={styles.navigation} aria-label="Navigation principale">
        {groupes.map((groupe, i) => (
          <div key={groupe.titre ?? i} className={styles.groupe}>
            {groupe.titre && <p className={styles.titreGroupe}>{groupe.titre}</p>}
            {groupe.entrees.map((entree) => {
              const lienNu = entree.lien.split("?")[0];

              if (entree.bientot) {
                return (
                  <span key={entree.lien} className={styles.bientot} aria-disabled="true">
                    {entree.libelle}
                    <span className={styles.pastille}>Bientôt</span>
                  </span>
                );
              }

              return (
                <Link
                  key={entree.lien}
                  href={entree.lien}
                  className={lienNu === active ? styles.lienActif : styles.lien}
                  aria-current={lienNu === active ? "page" : undefined}
                >
                  {entree.libelle}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.pied}>
        <span className={styles.avatar} aria-hidden="true">
          {initiales(utilisateur.nom)}
        </span>
        <span className={styles.identite}>
          <span className={styles.nom}>{utilisateur.nom}</span>
          <span className={styles.email}>{utilisateur.email}</span>
        </span>
      </div>
    </aside>
  );
}
