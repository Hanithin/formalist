import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";

/**
 * Les dates lues valent bien l'instant écrit.
 *
 * Ce test existe pour un décalage qui a réellement eu lieu, et qui ne se voyait pas :
 * la connexion prenait le fuseau du serveur, PostgreSQL renvoyait ses timestamptz
 * sous la forme « 2026-08-17 19:29:02+02 », et le pilote reconstruisait la date en
 * ignorant le « +02 ». Toutes les dates de l'application avaient deux heures d'avance
 * en été, une en hiver.
 *
 * Rien ne le signalait : le rendez-vous, sa date affichée et son délai étaient faux
 * de la même quantité, donc cohérents entre eux. Seule une comparaison avec ce que la
 * base contient vraiment pouvait le montrer - c'est ce que fait ce test, en relisant
 * l'instant par son horodatage Unix, qui ne dépend d'aucun fuseau.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

avecBase("fuseau horaire de la connexion", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("la connexion parle en UTC", async () => {
    const zone = await prisma.$queryRawUnsafe<{ TimeZone: string }[]>("SHOW TimeZone");
    expect(zone[0].TimeZone).toBe("UTC");
  });

  it("un instant relu vaut l'instant écrit", async () => {
    const lignes = await prisma.$queryRawUnsafe<{ quand: Date; unix: string }[]>(
      "SELECT now() AS quand, EXTRACT(EPOCH FROM now())::text AS unix"
    );

    const relu = lignes[0].quand.getTime();
    const attendu = Math.round(Number(lignes[0].unix) * 1000);

    // Une seconde de tolérance : les deux expressions sont évaluées dans la même
    // requête, l'écart ne peut venir que d'un arrondi.
    expect(Math.abs(relu - attendu)).toBeLessThan(1000);
  });

  it("une date écrite par l'application se relit à l'identique", async () => {
    /*
     * Le chemin complet : une Date de JavaScript écrite par Prisma, relue par Prisma,
     * comparée à l'horodatage Unix que PostgreSQL en donne.
     */
    const instant = new Date("2026-08-17T17:29:02.000Z");

    const lignes = await prisma.$queryRawUnsafe<{ quand: Date; unix: string }[]>(
      "SELECT $1::timestamptz AS quand, EXTRACT(EPOCH FROM $1::timestamptz)::text AS unix",
      instant
    );

    expect(lignes[0].quand.toISOString()).toBe(instant.toISOString());
    expect(Number(lignes[0].unix) * 1000).toBe(instant.getTime());
  });
});
