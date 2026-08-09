import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

/**
 * Client Prisma unique.
 *
 * En développement, Next recharge les modules à chaque modification : sans ce cache
 * sur l'objet global, chaque rechargement ouvrirait un nouveau jeu de connexions
 * jusqu'à saturer la base.
 */
const global_ = globalThis as unknown as { prisma?: PrismaClient };

function creerClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante");

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = global_.prisma ?? creerClient();

if (process.env.NODE_ENV !== "production") global_.prisma = prisma;
