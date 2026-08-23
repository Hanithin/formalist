import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { messagesDe } from "@/infrastructure/db/depots/support";
import faq from "@/content/faq.json";
import { Recherche } from "./Recherche";
import { Support } from "../support/Support";
import styles from "./Aide.module.css";

export const metadata: Metadata = {
  title: "Centre d'aide - Formalist",
  robots: { index: false, follow: false },
};

interface Section {
  titre: string;
  questions: { question: string; reponse: string }[];
}

/**
 * Le centre d'aide : les réponses toutes faites, puis quelqu'un à qui parler.
 *
 * Les deux vivaient sur deux pages, annoncées par deux entrées de la colonne. Un
 * client bloqué avait donc à choisir entre « Aide & FAQ » et « Support » avant même
 * de savoir laquelle répondrait - et la FAQ, faute de mieux, le renvoyait vers la
 * messagerie, qui est la conversation de son dossier avec l'avocat, pas le support.
 *
 * Une seule page, dans l'ordre où l'on cherche : on lit, et si l'on n'a pas trouvé,
 * on écrit. Le fil de discussion est le même qu'avant, au même endroit dans la base.
 *
 * L'administrateur, lui, garde `/support` : ce n'est pas une page d'aide pour lui mais
 * l'atelier où il répond à tous les clients.
 */
export default async function CentreDAide() {
  const utilisateur = await exigerUtilisateur();
  const sections = faq as Section[];
  const messages = await messagesDe(utilisateur);

  return (
    <main>
      <h1>Centre d&apos;aide</h1>
      <p>Les réponses aux questions les plus fréquentes, et notre équipe si besoin.</p>

      {/* La recherche filtre côté navigateur : les dix questions sont déjà là,
          un aller-retour serveur n'apporterait rien. */}
      <Recherche sections={sections} />

      <section className={styles.contact} id="support">
        <h2>Vous n&apos;avez pas trouvé ?</h2>
        <p>Écrivez-nous, nous répondons sous 24 heures ouvrées.</p>

        <Support
          moi={utilisateur.id}
          estAdmin={false}
          clientActif={null}
          conversations={[]}
          messagesInitiaux={messages.map((m) => ({
            ...m,
            envoyeLe: m.envoyeLe?.toISOString() ?? new Date().toISOString(),
          }))}
        />
      </section>
    </main>
  );
}
