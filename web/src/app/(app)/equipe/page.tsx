import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeLEquipe } from "@/infrastructure/db/depots/equipe";
import { rolesProposables } from "@/domain/equipe/invitations";
import { Inviter } from "./Inviter";

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
        <ul>
          {membres.map((m) => (
            <li key={m.id}>
              <strong>{m.users?.name}</strong>
              <span>{m.users?.email}</span>
              <span>{LIBELLES[m.role] ?? m.role}</span>
              {m.user_id === utilisateur.id && <span>Vous</span>}
              <span>
                {m.can_view_all ? "Voit tous les dossiers" : "Voit ses dossiers"}
                {m.can_edit && ", peut modifier"}
                {m.can_create && ", peut créer"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {peutGerer && (
        <section>
          <h2>Inviter quelqu&apos;un</h2>
          <Inviter roles={rolesProposables(equipe).map((r) => ({ valeur: r, libelle: LIBELLES[r] }))} />
        </section>
      )}

      <section>
        <h2>
          {enAttente.length === 0
            ? "Aucune invitation en attente"
            : enAttente.length === 1
              ? "1 invitation en attente"
              : enAttente.length + " invitations en attente"}
        </h2>
        {invitations.length > 0 && (
          <ul>
            {invitations.map((i) => (
              <li key={i.id}>
                <span>{i.email}</span>
                <span>{LIBELLES[i.role] ?? i.role}</span>
                <span>{ETATS[i.etat]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
