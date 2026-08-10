import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { lireArticle, identifiantsArticles } from "@/infrastructure/contenu/blog";
import Link from "next/link";
import { adresseAbsolue } from "@/lib/site";
import styles from "../Blog.module.css";

type Parametres = { params: Promise<{ article: string }> };

/** Les articles sont connus à la compilation : on les génère tous en statique. */
export async function generateStaticParams() {
  const identifiants = await identifiantsArticles();
  return identifiants.map((article) => ({ article }));
}

export async function generateMetadata({ params }: Parametres): Promise<Metadata> {
  const { article } = await params;
  const trouve = await lireArticle(article);
  if (!trouve) return { title: "Article introuvable - Formalist" };

  const adresse = adresseAbsolue("/blog/" + trouve.article.identifiant);
  return {
    title: trouve.article.titre + " - Formalist",
    description: trouve.article.resume,
    alternates: { canonical: adresse },
    openGraph: {
      type: "article",
      title: trouve.article.titre,
      description: trouve.article.resume,
      url: adresse,
      publishedTime: trouve.article.publieLe.toISOString(),
      locale: "fr_FR",
    },
  };
}

export default async function PageArticle({ params }: Parametres) {
  const { article } = await params;
  const trouve = await lireArticle(article);
  if (!trouve) notFound();

  // Données structurées : sans elles, un moteur devine le titre et la date depuis
  // la mise en page, et se trompe régulièrement.
  const donneesStructurees = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: trouve.article.titre,
    description: trouve.article.resume,
    datePublished: trouve.article.publieLe.toISOString(),
    inLanguage: "fr-FR",
    publisher: { "@type": "Organization", name: "Formalist" },
    mainEntityOfPage: adresseAbsolue("/blog/" + trouve.article.identifiant),
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(donneesStructurees) }}
      />
      <article className={styles.article}>
        <h1>{trouve.article.titre}</h1>
        <time className={styles.date} dateTime={trouve.article.publieLe.toISOString()}>
          {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(
            trouve.article.publieLe
          )}
        </time>
        {/* Contenu rédactionnel existant, déjà publié : servi tel quel plutôt que
            réécrit. Il ne vient d'aucune saisie utilisateur. */}
        <div className={styles.corps} dangerouslySetInnerHTML={{ __html: trouve.corps }} />

        <Link href="/blog" className={styles.retour}>
          Tous les articles
        </Link>
      </article>
    </main>
  );
}
