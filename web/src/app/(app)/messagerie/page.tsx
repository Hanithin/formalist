import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { conversations, messagesDuDossier } from "@/infrastructure/db/depots/messages";
import { Messagerie } from "./Messagerie";
import { Vide } from "@/components/liste/Vide";

export const metadata: Metadata = {
  title: "Messagerie - Formalist",
  robots: { index: false, follow: false },
};

export default async function PageMessagerie({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const fils = await conversations(utilisateur);

  if (fils.length === 0) {
    return (
      <main>
        <h1>Messagerie</h1>
        <Vide
          titre="Aucune conversation"
          texte="Vos échanges avec l'avocat en charge de vos dossiers apparaîtront ici."
          action={{ libelle: "Créer une société", lien: "/creation?type=creation" }}
        />
      </main>
    );
  }

  // Le dossier demandé, s'il fait partie des conversations visibles ; sinon le
  // premier. Un identifiant inventé dans l'adresse ne doit rien ouvrir d'autre.
  const { dossier } = await searchParams;
  const demande = Number(dossier);
  const choisi = fils.find((f) => f.dossierId === demande) ?? fils[0];

  const messages = await messagesDuDossier(utilisateur, choisi.dossierId);

  return (
    <main>
      <h1>Messagerie</h1>
      {/* La clé fait repartir le fil à zéro au changement de conversation :
          réinitialiser dans un effet enchaînerait deux rendus. */}
      <Messagerie
        key={choisi.dossierId}
        conversations={fils.map((f) => ({
          ...f,
          dernierLe: f.dernierLe?.toISOString() ?? null,
        }))}
        dossierActif={choisi.dossierId}
        messagesInitiaux={messages.map((m) => ({ ...m, envoyeLe: m.envoyeLe.toISOString() }))}
        moi={utilisateur.id}
      />
    </main>
  );
}
