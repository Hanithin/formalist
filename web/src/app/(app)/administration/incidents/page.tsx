import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { incidentsDuJournal } from "@/infrastructure/db/depots/incidents";
import { Incidents } from "./Incidents";
import styles from "../Administration.module.css";

export const metadata: Metadata = {
  title: "Incidents - Administration - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Ce qui a cassé, depuis la dernière fois qu'on a regardé.
 *
 * Les erreurs du serveur partaient dans la sortie du conteneur : lisibles tant qu'on
 * regarde, perdues au redéploiement, et jamais consultées puisque rien n'en annonce
 * l'arrivée. Le seul détecteur de panne était le client qui écrit pour dire que ça n'a
 * pas marché - c'est-à-dire, le plus souvent, le client qui ne revient pas.
 *
 * Une ligne par panne, non par occurrence : la même erreur rencontrée mille fois se lit
 * en une ligne qui dit mille, avec sa première et sa dernière apparition. C'est le
 * compteur qui hiérarchise, et la date qui dit si c'est encore vivant.
 */
export default async function IncidentsDeLaPlateforme({
  searchParams,
}: {
  searchParams: Promise<{ voir?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();

  /* Comme le reste de l'administration : 404 plutôt qu'un refus, qui apprendrait que la
     page existe. */
  if (!utilisateur.roles.includes("admin")) notFound();

  const { voir } = await searchParams;
  const resolus = voir === "resolus";
  const incidents = await incidentsDuJournal(utilisateur, { resolus });

  return (
    <main className={styles.page}>
      <div className={styles.tete}>
        <p className={styles.eyebrow}>Administration</p>
        <h1>Incidents</h1>
        <Link className={styles.lienSuivi} href="/administration">
          Revenir à la plateforme
        </Link>
      </div>

      {/* Le corps prend les marges des autres écrans de l'administration : sans elles,
          la liste touchait le bord droit de la fenêtre. */}
      <div className={styles.incidentsCorps}>
        <Incidents
          incidents={incidents.map((i) => ({
            ...i,
            premiereLe: i.premiereLe.toISOString(),
            derniereLe: i.derniereLe.toISOString(),
            resoluLe: i.resoluLe?.toISOString() ?? null,
          }))}
          resolus={resolus}
        />
      </div>
    </main>
  );
}
