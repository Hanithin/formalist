import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { conversations, messagesDuDossier } from "@/infrastructure/db/depots/messages";
import { messagesDe, nonLus as nonLusDuSupport } from "@/infrastructure/db/depots/support";
import { Messagerie, type Fil, type MessageAffiche } from "./Messagerie";

export const metadata: Metadata = {
  title: "Messagerie - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Les conversations, de deux origines.
 *
 * Un fil par dossier suivi par un avocat, et un fil avec le support : c'est le
 * découpage de public/messagerie.html, dont la liste portait les sections « Avocat »
 * et « Support ».
 *
 * Un dossier n'apparaît que s'il a un avocat ou des messages - la page d'origine
 * posait déjà cette condition. Sans elle, la liste se remplit de dossiers à peine
 * ouverts, sans nom et sans interlocuteur, où il n'y a personne à qui écrire.
 */
export default async function PageMessagerie({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; fil?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, fil } = await searchParams;

  const [parDossier, messagesSupport, nonLusSupport] = await Promise.all([
    conversations(utilisateur),
    messagesDe(utilisateur),
    nonLusDuSupport(utilisateur),
  ]);

  const dernierSupport = messagesSupport[messagesSupport.length - 1];

  const fils: Fil[] = [
    ...parDossier
      .filter((c) => c.avocat !== null || c.dernierMessage !== null || c.nonLus > 0)
      .map((c) => ({
        cle: "dossier-" + c.dossierId,
        genre: "dossier" as const,
        dossierId: c.dossierId,
        titre: c.societe,
        sousTitre: c.avocat ?? "Avocat non assigné",
        forme: c.forme,
        dernierMessage: c.dernierMessage,
        dernierDeMoi: c.dernierDeMoi,
        dernierLe: c.dernierLe?.toISOString() ?? null,
        nonLus: c.nonLus,
      })),
    {
      cle: "support",
      genre: "support" as const,
      dossierId: null,
      titre: "Support Formalist",
      sousTitre: "Réponse sous quelques heures, du lundi au vendredi",
      forme: null,
      dernierMessage: dernierSupport?.contenu ?? null,
      dernierDeMoi: dernierSupport ? dernierSupport.expediteurId === utilisateur.id : false,
      dernierLe: dernierSupport?.envoyeLe?.toISOString() ?? null,
      nonLus: nonLusSupport,
    },
  ];

  /*
   * Quelle conversation est ouverte.
   *
   * Rien dans l'adresse n'ouvre rien : l'écran d'accueil liste les conversations, et
   * c'est celui de l'original. Un identifiant inventé ne doit pas non plus ouvrir la
   * conversation de quelqu'un d'autre - il ne peut désigner qu'un fil de cette liste.
   */
  const demande = fil === "support" ? "support" : dossier ? "dossier-" + Number(dossier) : null;

  /*
   * Le dossier demandé s'ouvre, même s'il n'a encore rien à montrer.
   *
   * La liste écarte les dossiers sans avocat ni message - à juste titre : on n'affiche
   * pas trente conversations vides. Mais le parcours renvoie ici pour écrire le premier
   * message, et l'écran restait alors muet : aucun fil, aucun champ, rien à quoi
   * s'adresser. On ajoute donc celui qu'on demande, s'il est bien à ce client.
   */
  const absent =
    demande && demande !== "support" && !fils.some((f) => f.cle === demande)
      ? parDossier.find((c) => "dossier-" + c.dossierId === demande)
      : undefined;

  if (absent) {
    fils.unshift({
      cle: "dossier-" + absent.dossierId,
      genre: "dossier",
      dossierId: absent.dossierId,
      titre: absent.societe,
      sousTitre: absent.avocat ?? "Avocat non assigné",
      forme: absent.forme,
      dernierMessage: absent.dernierMessage,
      dernierDeMoi: absent.dernierDeMoi,
      dernierLe: absent.dernierLe?.toISOString() ?? null,
      nonLus: absent.nonLus,
    });
  }

  const actif = fils.find((f) => f.cle === demande) ?? null;

  let messages: MessageAffiche[] = [];
  if (actif?.genre === "support") {
    messages = messagesSupport.map((m) => ({
      id: m.id,
      expediteurId: m.expediteurId,
      expediteur: m.expediteur,
      contenu: m.contenu,
      type: null,
      fichier: m.fichier,
      repondA: null,
      // La colonne created_at du support accepte le nul : un message sans date se
      // place à l'instant de la lecture plutôt que de faire tomber la page.
      envoyeLe: (m.envoyeLe ?? new Date()).toISOString(),
    }));
  } else if (actif?.dossierId) {
    const lignes = await messagesDuDossier(utilisateur, actif.dossierId);
    messages = lignes.map((m) => ({
      id: m.id,
      expediteurId: m.expediteurId,
      expediteur: m.expediteur,
      contenu: m.contenu,
      type: m.type,
      fichier: m.fichier,
      repondA: m.repondA,
      envoyeLe: m.envoyeLe.toISOString(),
    }));
  }

  return (
    // La clé fait repartir le fil à zéro au changement de conversation :
    // réinitialiser dans un effet enchaînerait deux rendus.
    <Messagerie
      key={actif?.cle ?? "accueil"}
      fils={fils}
      filActif={actif?.cle ?? ""}
      messagesInitiaux={messages}
      moi={utilisateur.id}
    />
  );
}
