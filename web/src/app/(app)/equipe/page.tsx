import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeLEquipe } from "@/infrastructure/db/depots/equipe";
import {
  choixDeRole,
  resumeDesDroits,
  delaiLisible,
  LIBELLES_ROLES,
  pouvoirDuRole,
  type Droits,
} from "@/domain/equipe/droits";
import { roleDirigeant, type RoleEquipe } from "@/domain/equipe/invitations";
import { dateEnTete } from "@/lib/dates";
import { Vide } from "@/components/liste/Vide";
import { Inviter, ActionsMembre, ActionsInvitation, Retour } from "./Gestion";
import styles from "./Equipe.module.css";

export const metadata: Metadata = {
  title: "Équipe - Formalist",
  robots: { index: false, follow: false },
};

const ETATS: Record<string, string> = {
  en_attente: "En attente",
  acceptee: "Acceptée",
  revoquee: "Révoquée",
  expiree: "Expirée",
};

const TRAITS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * Les initiales d'une personne, pour sa pastille.
 *
 * Un nom composé donne deux lettres, un prénom seul en donne une : mieux vaut une
 * initiale juste que deux dont la seconde vient du hasard de la découpe.
 */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 1).toUpperCase();
  return (mots[0].slice(0, 1) + mots[mots.length - 1].slice(0, 1)).toUpperCase();
}

/**
 * La page de l'équipe.
 *
 * Trois choses s'y font : voir qui en est, changer ce que chacun peut faire, et
 * inviter quelqu'un. Elles étaient toutes les trois en place côté serveur ; seule la
 * première s'affichait.
 */
export default async function PageEquipe({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { equipe, nom, membres, invitations, peutGerer } = await tableauDeLEquipe(utilisateur);
  const { invitation: retourDInvitation } = await searchParams;

  const enAttente = invitations.filter((i) => i.etat === "en_attente");
  const voientTout = membres.filter((m) => m.can_view_all).length;
  const dirigeant = roleDirigeant(equipe);
  const dirigeants = membres.filter((m) => m.role === dirigeant).length;
  const roles = choixDeRole(equipe);

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <h1>{nom}</h1>
        <div className={styles.topbarActions}>
          <span className={styles.topbarDate}>{dateEnTete()}</span>
          {peutGerer && <Inviter roles={roles} />}
        </div>
      </div>

      <p className={styles.introduction}>
        {equipe.type === "cabinet"
          ? "Les avocats du cabinet invitent les membres et fixent ce que chacun peut voir des dossiers."
          : "Invitez vos collaborateurs et choisissez, pour chacun, ce qu'il peut voir et faire de vos dossiers."}
      </p>

      <div className={styles.content}>
        {retourDInvitation && <Retour issue={retourDInvitation} />}

        <ul className={styles.stats}>
          <Compteur
            valeur={membres.length}
            libelle="Membres"
            sousTitre={
              dirigeants === 1
                ? "dont 1 " + LIBELLES_ROLES[dirigeant].toLowerCase()
                : "dont " + dirigeants + " " + LIBELLES_ROLES[dirigeant].toLowerCase() + "s"
            }
            teinte={styles.statCardIconBleu}
          >
            <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </Compteur>

          <Compteur
            valeur={enAttente.length}
            libelle="Invitations en attente"
            sousTitre={enAttente.length > 0 ? "lien valable 7 jours" : "personne n'attend"}
            teinte={styles.statCardIconAmbre}
          >
            <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
              <path d="M4 4h16v16H4z" />
              <polyline points="4 6 12 13 20 6" />
            </svg>
          </Compteur>

          <Compteur
            valeur={voientTout}
            libelle="Accès complet"
            sousTitre={
              voientTout > 0 ? "voient tous les dossiers" : "chacun ne voit que les siens"
            }
            teinte={styles.statCardIconVert}
          >
            <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </Compteur>
        </ul>

        <section className={styles.section}>
          <h2 className={styles.titreSection}>
            {membres.length === 1 ? "1 membre" : membres.length + " membres"}
          </h2>

          <ul className={styles.membres}>
            {membres.map((m) => {
              const droits: Droits = {
                voitTousLesDossiers: m.can_view_all,
                peutModifier: m.can_edit,
                peutCreer: m.can_create,
              };
              const role = m.role as RoleEquipe;
              const moi = m.user_id === utilisateur.id;

              return (
                <li key={m.id} className={styles.membre}>
                  <span className={styles.pastille} aria-hidden="true">
                    {initiales(m.users?.name ?? m.users?.email ?? "?")}
                  </span>

                  <div className={styles.identite}>
                    <span className={styles.nom}>
                      {m.users?.name || m.users?.email}
                      {moi && <span className={styles.vous}>Vous</span>}
                    </span>
                    <span className={styles.email}>{m.users?.email}</span>
                  </div>

                  <div className={styles.attributs}>
                    <span
                      className={
                        role === dirigeant
                          ? `${styles.role} ${styles.roleDirigeant}`
                          : styles.role
                      }
                      title={pouvoirDuRole(equipe, role)}
                    >
                      {LIBELLES_ROLES[role] ?? role}
                    </span>
                    {resumeDesDroits(droits).map((d) => (
                      <span key={d} className={styles.droit}>
                        {d}
                      </span>
                    ))}
                  </div>

                  {peutGerer && (
                    <ActionsMembre
                      membre={{
                        id: m.id,
                        nom: m.users?.name || m.users?.email || "ce membre",
                        role,
                        ...droits,
                      }}
                      roles={roles}
                      moi={moi}
                      dernierDirigeant={role === dirigeant && dirigeants === 1}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.section}>
          {/* Le titre reste « Invitations » : l'état vide se dit dans le bloc, pas
              dans le titre de la section. */}
          <h2 className={styles.titreSection}>
            {enAttente.length === 0
              ? "Invitations"
              : enAttente.length === 1
                ? "1 invitation en attente"
                : enAttente.length + " invitations en attente"}
          </h2>

          {invitations.length === 0 ? (
            <Vide
              ton="encart"
              texte={
                peutGerer
                  ? "Aucune invitation envoyée. Celles que vous enverrez apparaîtront ici, avec leur état."
                  : "Aucune invitation envoyée."
              }
            />
          ) : (
            <ul className={styles.invitations}>
              {invitations.map((i) => (
                <li key={i.id} className={styles.invitation}>
                  <div className={styles.identite}>
                    <span className={styles.nom}>{i.email}</span>
                    <span className={styles.email}>
                      {LIBELLES_ROLES[i.role as RoleEquipe] ?? i.role}
                      {i.etat === "en_attente" && " - " + delaiLisible(i.expires_at)}
                    </span>
                  </div>

                  <span className={`${styles.etat} ${styles[i.etat]}`}>{ETATS[i.etat]}</span>

                  {peutGerer && (
                    <ActionsInvitation
                      invitation={{ id: i.id, email: i.email, etat: i.etat, lien: i.lien }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

/** Un compteur de tête. À zéro, il s'efface plutôt que d'afficher un zéro. */
function Compteur({
  valeur,
  libelle,
  sousTitre,
  teinte,
  children,
}: {
  valeur: number;
  libelle: string;
  sousTitre: string;
  teinte: string;
  children: React.ReactNode;
}) {
  const vide = valeur === 0;

  return (
    <li className={vide ? `${styles.statCard} ${styles.statCardVide}` : styles.statCard}>
      <span className={`${styles.statCardIcon} ${teinte}`} aria-hidden="true">
        {children}
      </span>
      <span className={styles.statLabel}>{libelle}</span>
      <span className={styles.statValue}>{vide ? "-" : valeur}</span>
      <span className={styles.statSub}>{sousTitre}</span>
    </li>
  );
}
