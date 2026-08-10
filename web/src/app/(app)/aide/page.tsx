import type { Metadata } from "next";
import Link from "next/link";
import faq from "@/content/faq.json";
import { Recherche } from "./Recherche";
import styles from "./Aide.module.css";

export const metadata: Metadata = {
  title: "Aide & FAQ - Formalist",
  robots: { index: false, follow: false },
};

interface Section {
  titre: string;
  questions: { question: string; reponse: string }[];
}

export default function Aide() {
  const sections = faq as Section[];

  return (
    <main>
      <h1>Aide & FAQ</h1>
      <p>Les réponses aux questions les plus fréquentes.</p>

      {/* La recherche filtre côté navigateur : les dix questions sont déjà là,
          un aller-retour serveur n'apporterait rien. */}
      <Recherche sections={sections} />

      <section className={styles.contact}>
        <h2>Vous n&apos;avez pas trouvé ?</h2>
        <p>
          <Link href="/messagerie">Écrivez au support</Link>, nous répondons sous 24 heures
          ouvrées.
        </p>
      </section>
    </main>
  );
}
