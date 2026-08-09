import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { analyserDateFrancaise, trierParDate, type Article } from "@/domain/contenu/articles";
import { journal } from "@/lib/journal";

/**
 * Lecture des articles depuis src/content/blog.
 *
 * Le contenu rédactionnel est du HTML déjà publié et référencé : on le sert tel
 * quel plutôt que de le réécrire, ce qui n'apporterait que des occasions de le
 * déformer. Le catalogue porte les métadonnées.
 */

const RACINE = path.join(process.cwd(), "src", "content", "blog");

interface EntreeCatalogue {
  identifiant: string;
  titre: string;
  resume: string;
  date: string | null;
}

let cache: Article[] | null = null;

export async function listerArticles(): Promise<Article[]> {
  if (cache) return cache;

  const brut = await readFile(path.join(RACINE, "catalogue.json"), "utf8");
  const entrees = JSON.parse(brut) as EntreeCatalogue[];

  const articles: Article[] = [];
  for (const e of entrees) {
    const publieLe = analyserDateFrancaise(e.date);
    if (!publieLe) {
      // Un article sans date lisible ne peut ni être classé ni daté pour les
      // moteurs : mieux vaut le savoir que le publier mal.
      journal.warn({ article: e.identifiant, date: e.date }, "Date d'article illisible");
      continue;
    }
    articles.push({
      identifiant: e.identifiant,
      titre: e.titre,
      resume: e.resume,
      publieLe,
    });
  }

  cache = trierParDate(articles);
  return cache;
}

export async function lireArticle(identifiant: string): Promise<{ article: Article; corps: string } | null> {
  const articles = await listerArticles();
  const article = articles.find((a) => a.identifiant === identifiant);
  if (!article) return null;

  // L'identifiant vient de l'URL : on ne construit jamais un chemin de fichier
  // avec, sans quoi ../../ sortirait du dossier de contenu.
  const nom = path.basename(identifiant) + ".html";
  try {
    const corps = await readFile(path.join(RACINE, nom), "utf8");
    return { article, corps };
  } catch {
    return null;
  }
}

/** Identifiants connus, pour la génération statique des pages d'articles. */
export async function identifiantsArticles(): Promise<string[]> {
  const fichiers = await readdir(RACINE);
  return fichiers.filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5));
}
