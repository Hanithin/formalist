import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { messagesDe, conversations } from "@/infrastructure/db/depots/support";
import { Support } from "./Support";
import styles from "./Support.module.css";

export const metadata: Metadata = {
  title: "Support - Formalist",
  robots: { index: false, follow: false },
};

export default async function PageSupport({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const estAdmin = utilisateur.roles.includes("admin");

  /*
   * Un client n'a plus rien à faire ici.
   *
   * Son fil de support vit dans le centre d'aide, sous la FAQ, avec les mêmes
   * messages. La redirection garde les anciens liens et les signets valides plutôt
   * que de les casser.
   */
  if (!estAdmin) redirect("/aide#support");

  const { client } = await searchParams;
  const cible = estAdmin && client ? Number(client) : undefined;

  const [messages, liste] = await Promise.all([
    messagesDe(utilisateur, cible),
    estAdmin ? conversations(utilisateur) : Promise.resolve([]),
  ]);

  return (
    /*
      La page prend l'écran, comme une messagerie.

      Elle héritait du gabarit des pages de contenu - neuf cent quatre-vingts pixels au
      milieu d'un écran qui en offre douze cents - et le fil des messages s'y trouvait
      à l'étroit pendant qu'un tiers de la largeur restait gris. Un échange se lit sur
      toute la place disponible, et sa hauteur est celle de la fenêtre.
    */
    <main className={styles.page}>
      <div className={styles.tete}>
        <h1>Support</h1>
        <p>Les conversations ouvertes avec les clients.</p>
      </div>

      <Support
        moi={utilisateur.id}
        estAdmin={estAdmin}
        clientActif={cible ?? null}
        conversations={liste.map((c) => ({
          ...c,
          dernierLe: c.dernierLe?.toISOString() ?? null,
        }))}
        messagesInitiaux={messages.map((m) => ({
          ...m,
          envoyeLe: m.envoyeLe?.toISOString() ?? new Date().toISOString(),
        }))}
      />
    </main>
  );
}
