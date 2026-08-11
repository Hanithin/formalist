import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

/**
 * Client Prisma unique, créé au premier usage.
 *
 * La création est paresseuse, et c'est nécessaire : « next build » importe chaque
 * module de route pour en collecter la configuration. Un client construit à
 * l'import exigeait donc DATABASE_URL au moment de la construction, alors que
 * c'est un secret d'exécution - la construction de l'image échouait sur
 * « Failed to collect page data for /api/signature ».
 *
 * En développement, Next recharge les modules à chaque modification : sans le cache
 * sur l'objet global, chaque rechargement ouvrirait un nouveau jeu de connexions
 * jusqu'à saturer la base.
 */
const global_ = globalThis as unknown as { prisma?: PrismaClient };

function creerClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante");

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

let client: PrismaClient | undefined;

function clientCourant(): PrismaClient {
  if (global_.prisma) return global_.prisma;

  if (!client) {
    client = creerClient();
    if (process.env.NODE_ENV !== "production") global_.prisma = client;
  }
  return client;
}

/**
 * Le client, derrière un intermédiaire.
 *
 * Il se présente comme un PrismaClient et le reste du code l'utilise sans savoir
 * qu'il est différé. Les méthodes du client - $transaction, $queryRaw - sont liées
 * à l'instance réelle, sans quoi elles perdraient leur `this` ; les délégués de
 * modèle, eux, sont des objets et se rendent tels quels.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_cible, propriete) {
    const reel = clientCourant() as unknown as Record<string | symbol, unknown>;
    const valeur = reel[propriete];
    return typeof valeur === "function" ? valeur.bind(reel) : valeur;
  },
});
