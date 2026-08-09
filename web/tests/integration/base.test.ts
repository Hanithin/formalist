import { describe, it, expect } from "vitest";
import { prisma } from "@/infrastructure/db/client";

/**
 * Vérifie que la couche d'accès parle réellement à Postgres.
 *
 * Ignoré quand DATABASE_URL est absente : ce test a besoin d'une base, il n'a pas
 * à faire échouer une vérification lancée sans.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

avecBase("connexion à Postgres", () => {
  it("lit les tables du schéma", async () => {
    const comptes = await prisma.users.count();
    expect(comptes).toBeGreaterThanOrEqual(0);
  });

  it("rend les types convertis, pas du texte brut", async () => {
    const u = await prisma.users.findFirst({
      select: { created_at: true, email_verified: true },
    });
    if (!u) return;
    expect(u.created_at).toBeInstanceOf(Date);
    expect(typeof u.email_verified).toBe("boolean");
  });
});
