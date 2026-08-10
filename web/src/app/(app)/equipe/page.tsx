import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeLEquipe } from "@/infrastructure/db/depots/equipe";
import { rolesProposables } from "@/domain/equipe/invitations";
import { Vide } from "@/components/liste/Vide";
import { Inviter } from "./Inviter";
import styles from "./Equipe.module.css";

export const metadata: Metadata = {
  title: "Équipe - Formalist",
  robots: { index: false, follow: false },
};

const LIBELLES: Record<string, string> = {
  collaborateur: "Collaborateur",
  admin: "Administrateur",
  avocat: "Avocat",
};

const ETATS: Record<string, string> = {
  en_attente: "En attente",
  acceptee: "Acceptée",
  revoquee: "Révoquée",
  expiree: "Expirée",
};

export default async function PageEquipe() {
  const utilisateur = await exigerUtilisateur();
  const { equipe, nom, membres, invitations, peutGerer } = await tableauDeLEquipe(utilisateur);

  const enAttente = invitations.filter((i) => i.etat === "en_attente");

  return (
    <main>
      <h1>{nom}</h1>
      <p>
        {equipe.type === "cabinet"
          ? "Cabinet : seuls les avocats invitent de nouveaux membres."
          : "Invitez vos collaborateurs et choisissez ce qu'ils peuvent voir."}
      </p>

      <section>
        <h2>
          {membres.length === 1 ? "1 membre" : membres.length + " membres"}
        </h2>
        <ul className={styles.membres}>
          {membres.map((m) => (
            <li key={m.id} className={styles.membre}>
              <span className={styles.nom}>
                {m.users?.name}
                {m.user_id === utilisateur.id && <span className={styles.vous}> Vous</span>}
              </span>
              <span className={styles.role}>{LIBELLES[m.role] ?? m.role}</span>
              <span className={styles.details}>
                <span>{m.users?.email}</span>
                <span>
                  {m.can_view_all ? "Voit tous les dossiers" : "Voit ses dossiers"}
                  {m.can_edit && ", peut modifier"}
                  {m.can_create && ", peut créer"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {peutGerer && (
        <section className={styles.invitation}>
          <h2>Inviter quelqu&apos;un</h2>
          <p className={styles.explication}>
            La personne reçoit un lien valable sept jours. Elle rejoint l&apos;équipe avec les
            droits que vous choisissez ici.
          </p>
          <Inviter roles={rolesProposables(equipe).map((r) => ({ valeur: r, libelle: LIBELLES[r] }))} />
        </section>
      )}

      <section>
        {/* Le titre reste « Invitations » : l'état vide se dit dans le bloc, pas
            dans le titre de la section. */}
        <h2>
          {enAttente.length === 0
            ? "Invitations"
            : enAttente.length === 1
              ? "1 invitation en attente"
              : enAttente.length + " invitations en attente"}
        </h2>

        {invitations.length === 0 && (
          <Vide
            ton="encart"
            texte={
              peutGerer
                ? "Aucune invitation envoyée. Celles que vous enverrez apparaîtront ici, avec leur état."
                : "Aucune invitation envoyée."
            }
          />
        )}

        {invitations.length > 0 && (
          <ul className={styles.etats}>
            {invitations.map((i) => (
              <li key={i.id}>
                <strong>{i.email}</strong>
                <span>{LIBELLES[i.role] ?? i.role}</span>
                <span className={styles[i.etat]}>{ETATS[i.etat]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
