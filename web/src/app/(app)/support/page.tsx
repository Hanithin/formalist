import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { messagesDe, conversations } from "@/infrastructure/db/depots/support";
import { Support } from "./Support";

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

  const { client } = await searchParams;
  const cible = estAdmin && client ? Number(client) : undefined;

  const [messages, liste] = await Promise.all([
    messagesDe(utilisateur, cible),
    estAdmin ? conversations(utilisateur) : Promise.resolve([]),
  ]);

  return (
    <main>
      <h1>Support</h1>
      <p>
        {estAdmin
          ? "Les conversations ouvertes avec les clients."
          : "Une question sur la plateforme ? Écrivez-nous, nous répondons sous 24 heures ouvrées."}
      </p>

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
