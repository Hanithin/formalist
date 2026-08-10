import Link from "next/link";
import Image from "next/image";
import { menuPour, entreeActive, SEPARATEUR } from "@/domain/navigation/menu";
import { libelleCompteur, type ResumeColonne } from "@/domain/navigation/colonne";
import { icone } from "@/domain/navigation/icones";
import type { Role } from "@/domain/acces/regles";
import { Deconnexion } from "./Deconnexion";
import { NouvelleFormalite } from "./NouvelleFormalite";
import styles from "./Sidebar.module.css";

interface Props {
  chemin: string;
  utilisateur: { nom: string; email: string; roles: Role[] };
  resume: ResumeColonne;
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

export function Sidebar({ chemin, utilisateur, resume }: Props) {
  const menu = menuPour(utilisateur.roles);
  const active = entreeActive(chemin, menu);
  const estAdmin = utilisateur.roles.includes("admin");

  return (
    <aside className={styles.colonne}>
      <div className={styles.entete}>
        <Link href="/tableau-de-bord" className={styles.logo}>
          <Image src="/images/logo.png"
            alt="Formalist"
            width={150}
            height={30}
            style={{ height: 30, width: "auto" }}
            priority />
        </Link>
        {estAdmin && <span className={styles.badgeAdmin}>Admin</span>}
      </div>

      {/* Le bloc de contexte n'apparaît qu'une fois une société ouverte, comme à
          l'origine où il restait en display:none jusque-là. Avec une seule, il
          n'ouvre rien : il situe. Avec plusieurs, il mène à la liste. */}
      {resume.societe && (
        <Contexte nom={resume.societe} plusieurs={resume.plusieurs} />
      )}

      <NouvelleFormalite />

      <nav className={styles.navigation} aria-label="Navigation principale">
        {menu.map((element, i) => {
          if (element === SEPARATEUR) {
            return <hr key={"filet-" + i} className={styles.filet} />;
          }

          const lienNu = element.lien.split("?")[0];
          const dessin = (
            <span
              className={styles.icone}
              aria-hidden="true"
              /* Les tracés viennent de la navigation, pas d'une saisie. */
              dangerouslySetInnerHTML={{ __html: icone(element.lien) }}
            />
          );

          if (element.bientot) {
            return (
              <span key={element.lien} className={styles.bientot} aria-disabled="true">
                {dessin}
                {element.libelle}
                <span className={styles.pastille}>Bientôt</span>
              </span>
            );
          }

          const estActive = lienNu === active;
          const compteur = element.compteur ? libelleCompteur(element.compteur, resume) : null;

          return (
            <Link
              key={element.lien}
              href={element.lien}
              className={estActive ? styles.lienActif : styles.lien}
              aria-current={estActive ? "page" : undefined}
            >
              {dessin}
              {element.libelle}
              {compteur && <span className={styles.compteur}>{compteur}</span>}
            </Link>
          );
        })}
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

/** La société active : pastille, libellé, nom tronqué, chevron s'il y a un choix. */
function Contexte({ nom, plusieurs }: { nom: string; plusieurs: boolean }) {
  const dedans = (
    <>
      <span className={styles.ctxIcone} aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 21h18M5 21V7l7-4 7 4v14" />
        </svg>
      </span>

      <span className={styles.ctxCorps}>
        <span className={styles.ctxLibelle}>Société active</span>
        <span className={styles.ctxNom}>{nom}</span>
      </span>

      {plusieurs && (
        <svg
          className={styles.ctxChevron}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </>
  );

  if (!plusieurs) {
    return <div className={`${styles.contexte} ${styles.contexteSeul}`}>{dedans}</div>;
  }

  return (
    <Link href="/formalites" className={styles.contexte}>
      {dedans}
    </Link>
  );
}
