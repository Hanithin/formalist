import Link from "next/link";
import Image from "next/image";
import { menuPour, entreeActive } from "@/domain/navigation/menu";
import { icone } from "@/domain/navigation/icones";
import type { Role } from "@/domain/acces/regles";
import { Deconnexion } from "./Deconnexion";
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
          <Image src="/images/logo.png" alt="Formalist" width={150} height={30} priority />
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
              const dessin = (
                <span
                  className={styles.icone}
                  aria-hidden="true"
                  /* Les tracés viennent de la navigation d'origine, pas d'une saisie. */
                  dangerouslySetInnerHTML={{ __html: icone(entree.lien) }}
                />
              );

              if (entree.bientot) {
                return (
                  <span key={entree.lien} className={styles.bientot} aria-disabled="true">
                    {dessin}
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
                  {dessin}
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

        <Link href="/parametres" className={styles.bouton} title="Paramètres" aria-label="Paramètres">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </Link>

        <Deconnexion />
      </div>
    </aside>
  );
}
