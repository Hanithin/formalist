import type { Metadata } from "next";
import Link from "next/link";
import { listerArticles } from "@/infrastructure/contenu/blog";
import { adresseAbsolue } from "@/lib/site";
import styles from "./Blog.module.css";

export const metadata: Metadata = {
  title: "Le blog - Formalist",
  description:
    "Création et modification de sociétés, expliquées simplement : capital social, formes juridiques, obligations comptables.",
  alternates: { canonical: adresseAbsolue("/blog"), types: { "application/rss+xml": adresseAbsolue("/flux.xml") } },
};

export default async function Blog() {
  const articles = await listerArticles();

  return (
    <main>
      <header className={styles.entete}>
        <h1>Le blog</h1>
        <p>Création et modification de sociétés, expliquées simplement.</p>
      </header>

      <ul className={styles.articles}>
        {articles.map((a) => (
          <li key={a.identifiant}>
            <article>
              <h2>
                <Link href={"/blog/" + a.identifiant}>{a.titre}</Link>
              </h2>
              <time className={styles.date} dateTime={a.publieLe.toISOString()}>
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(a.publieLe)}
              </time>
              <p className={styles.resume}>{a.resume}</p>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
