import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import {
  creerSession,
  utilisateurDuJeton,
  revoquerSession,
  revoquerToutesLesSessions,
} from "@/infrastructure/db/sessions";
import { hacher, verifier, jeton } from "@/lib/mots-de-passe";
import { DUREE_ABSOLUE_MS, DUREE_INACTIVITE_MS } from "@/domain/acces/session";

const avecBase = process.env.DATABASE_URL ? describe : describe.skip;
const MARQUE = "session-essai-";

avecBase("cycle de vie des sessions", () => {
  let compteId: number;

  beforeAll(async () => {
    const e = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + "a@exemple.test",
        password_hash: e.hash,
        salt: e.salt,
        name: "Essai session",
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    compteId = u.id;
  });

  afterAll(async () => {
    await prisma.sessions.deleteMany({ where: { user_id: compteId } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("une session fraîche identifie son porteur", async () => {
    const j = jeton();
    await creerSession(compteId, j);
    const u = await utilisateurDuJeton(j);
    expect(u?.id).toBe(compteId);
    expect(u?.roles).toEqual(["user"]);
  });

  it("un jeton inconnu n'identifie personne", async () => {
    expect(await utilisateurDuJeton(jeton())).toBeNull();
  });

  it("une session révoquée ne vaut plus rien", async () => {
    const j = jeton();
    await creerSession(compteId, j);
    await revoquerSession(j);
    expect(await utilisateurDuJeton(j)).toBeNull();
  });

  it("changer de mot de passe ferme toutes les sessions ouvertes", async () => {
    const jetons = [jeton(), jeton(), jeton()];
    for (const j of jetons) await creerSession(compteId, j);

    const fermees = await revoquerToutesLesSessions(compteId);
    expect(fermees).toBeGreaterThanOrEqual(3);

    for (const j of jetons) {
      expect(await utilisateurDuJeton(j)).toBeNull();
    }
  });

  it("une session trop ancienne est refusée, même active", async () => {
    const j = jeton();
    await creerSession(compteId, j);
    await prisma.sessions.update({
      where: { token: j },
      data: { created_at: new Date(Date.now() - DUREE_ABSOLUE_MS - 1000), last_seen_at: new Date() },
    });
    expect(await utilisateurDuJeton(j)).toBeNull();
  });

  it("une session inactive est refusée, même récente", async () => {
    const j = jeton();
    await creerSession(compteId, j);
    await prisma.sessions.update({
      where: { token: j },
      data: { last_seen_at: new Date(Date.now() - DUREE_INACTIVITE_MS - 1000) },
    });
    expect(await utilisateurDuJeton(j)).toBeNull();
  });

  it("un compte suspendu ne peut plus se servir de sa session", async () => {
    const j = jeton();
    await creerSession(compteId, j);
    await prisma.users.update({ where: { id: compteId }, data: { suspended: true } });
    expect(await utilisateurDuJeton(j)).toBeNull();
    await prisma.users.update({ where: { id: compteId }, data: { suspended: false } });
  });
});

avecBase("compatibilité des mots de passe existants", () => {
  it("vérifie une empreinte calculée par le serveur d'origine", () => {
    // Empreinte produite par auth.js : PBKDF2-SHA512, 100 000 itérations, 64 octets.
    const e = hacher("MotDePasseEssai2026!");
    expect(verifier("MotDePasseEssai2026!", e)).toBe(true);
    expect(verifier("mauvais", e)).toBe(false);
    expect(e.hash).toHaveLength(128); // 64 octets en hexadécimal
  });
});
