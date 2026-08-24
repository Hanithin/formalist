import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { mesSocietes } from "@/infrastructure/db/depots/societes";
import {
  etatDeLaSociete,
  libelleDesFormalites,
  libelleDuPortefeuille,
  type Societe,
} from "@/domain/societe/portefeuille";
import { echeancesDesDossiers } from "@/domain/formalite/accueil";
import { sirenLisible } from "@/domain/modification/annonce";
import { accorder } from "@/domain/formalite/etapes";
import { dateEnTete } from "@/lib/dates";
import { Vide } from "@/components/liste/Vide";
import styles from "./Societes.module.css";

export const metadata: Metadata = {
  title: "Mes sociétés - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Le portefeuille de sociétés.
 *
 * Une société n'est pas une formalité. « Mes formalités » liste des opérations, la
 * bibliothèque des fichiers ; cette page liste les entreprises elles-mêmes, et répond
 * à la seule question que les deux autres laissent sans réponse : qu'est-ce que je
 * possède, et dans quel état ?
 *
 * En registre, non en galerie. Les grandes cartes conviennent à trois éléments qu'on
 * regarde ; à huit sociétés, on ne les regarde plus, on les cherche - et l'on veut
 * alors des colonnes alignées, où l'œil descend un état ou une échéance sans relire
 * chaque bloc.
 */
export default async function Societes() {
  const utilisateur = await exigerUtilisateur();
  const societes = await mesSocietes(utilisateur);

  return (
    <main className={styles.page}>
      <header className={styles.entete}>
        <div>
          <h1 className={styles.titre}>{libelleDuPortefeuille(societes.length)}</h1>
          <p className={styles.sousTitre}>
            {societes.length === 0
              ? "Vos sociétés apparaîtront ici dès votre première formalité."
              : accorder(societes.length, "société suivie", "sociétés suivies")}
          </p>
        </div>
        <span className={styles.date}>{dateEnTete()}</span>
      </header>

      <div className={styles.contenu}>
        {societes.length === 0 ? (
          <Vide
            icone="/creation"
            texte={
              <>
                <strong>Aucune société pour l&apos;instant.</strong> Créez-en une, ou
                lancez une formalité sur une société existante : elle prendra sa place
                ici.
              </>
            }
          />
        ) : (
          <div className={styles.registre}>
            <div className={styles.registreEntete} aria-hidden="true">
              <span>Société</span>
              <span>SIREN</span>
              <span>État</span>
              <span>Formalités</span>
              <span>Prochaine échéance</span>
            </div>

            <ul className={styles.registreLignes}>
              {societes.map((societe) => (
                <Ligne key={societe.cle} societe={societe} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}

function Ligne({ societe }: { societe: Societe }) {
  const etat = etatDeLaSociete(societe);

  const prochaine =
    echeancesDesDossiers(
      societe.dossiers.map((d) => ({
        id: d.id,
        type: d.type,
        societe: societe.denomination,
        status: d.status,
        limiteDepot: d.limiteDepot,
        termeDuMandat: d.termeDuMandat,
      }))
    )[0] ?? null;

  return (
    <li>
      <Link href={"/societes/" + societe.cle} className={styles.ligneSociete}>
        <span className={styles.celluleNom}>
          <span className={styles.nom} title={societe.denomination}>
            {societe.denomination}
          </span>
          <span className={styles.forme}>{societe.forme ?? "Société"}</span>
        </span>

        {/*
          Un tiret plutôt qu'un mot pour ce qui n'existe pas.
          « Aucune » répété sur huit lignes fait une colonne de mots qu'on lit, alors
          qu'il n'y a rien à y lire : le tiret se saute.
        */}
        <span className={styles.celluleSiren}>
          {societe.siren ? sirenLisible(societe.siren) : "—"}
        </span>

        <span className={styles.celluleEtat}>
          <span className={`${styles.badge} ${styles["badge-" + etat.ton] ?? ""}`}>
            {etat.libelle}
          </span>
        </span>

        {/*
          Une phrase, non deux nombres.
          « 2 · 2 en cours » faisait lire le même chiffre deux fois, et le premier ne
          disait pas de quoi il parlait.
        */}
        <span
          className={
            societe.enCours > 0
              ? `${styles.celluleFormalites} ${styles.enCours}`
              : styles.celluleFormalites
          }
        >
          {libelleDesFormalites(societe.dossiers.length, societe.enCours)}
        </span>

        <span className={styles.celluleEcheance}>
          {prochaine ? (
            <>
              <span className={styles.echeanceNom}>{prochaine.intitule}</span>
              <span className={styles.echeanceQuand}>
                {prochaine.limite.split("-").reverse().join("/")}
              </span>
            </>
          ) : (
            "—"
          )}
        </span>

        <svg
          className={styles.chevron}
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
      </Link>
    </li>
  );
}
