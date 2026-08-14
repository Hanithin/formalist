import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import {
  demanderReinitialisation,
  etatDuLien,
  reinitialiser,
} from "@/infrastructure/db/depots/reinitialisation";
import { utilisateurDuJeton, creerSession } from "@/infrastructure/db/sessions";
import { TYPE_JETON, DUREE_JETON_MS } from "@/domain/acces/reinitialisation";
import { hacher, verifier, jeton } from "@/lib/mots-de-passe";

/**
 * Mot de passe oublié, sur une vraie base.
 *
 * Ce qui se joue ici ne se voit pas en test unitaire : le jeton qui ne sert qu'une
 * fois, les sessions ouvertes qui tombent, et l'ancien mot de passe qui cesse de
 * fonctionner. Ce sont les trois choses qu'une réinitialisation doit garantir, et
 * l'oubli de l'une d'elles ne se remarque pas à l'usage - le compte s'ouvre quand
 * même.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "reinit-essai-";
const ANCIEN = "ancien-mot-de-passe-42";
const NOUVEAU = "nouveau-mot-de-passe-77";

avecBase("réinitialisation du mot de passe", () => {
  let compteId: number;
  const email = MARQUE + "cliente@exemple.test";

  async function jetonEnBase(): Promise<string | null> {
    const ligne = await prisma.email_tokens.findFirst({
      where: { user_id: compteId, type: TYPE_JETON },
      orderBy: { created_at: "desc" },
    });
    return ligne?.token ?? null;
  }

  beforeAll(async () => {
    const empreinte = hacher(ANCIEN);
    const compte = await prisma.users.create({
      data: {
        email,
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Camille Essai",
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    compteId = compte.id;
  });

  beforeEach(async () => {
    await prisma.email_tokens.deleteMany({ where: { user_id: compteId } });
    await prisma.sessions.deleteMany({ where: { user_id: compteId } });
    await prisma.tentatives.deleteMany({ where: { cle: email } });

    const empreinte = hacher(ANCIEN);
    await prisma.users.update({
      where: { id: compteId },
      data: { password_hash: empreinte.hash, salt: empreinte.salt, suspended: false },
    });
  });

  afterAll(async () => {
    await prisma.email_tokens.deleteMany({ where: { user_id: compteId } });
    await prisma.sessions.deleteMany({ where: { user_id: compteId } });
    await prisma.tentatives.deleteMany({ where: { cle: email } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("une demande crée un jeton valable une heure", async () => {
    await demanderReinitialisation(email);

    const valeur = await jetonEnBase();
    expect(valeur).not.toBeNull();
    expect(await etatDuLien(valeur!)).toBe("valide");

    const ligne = await prisma.email_tokens.findUnique({ where: { token: valeur! } });
    const duree = ligne!.expires_at.getTime() - Date.now();
    expect(duree).toBeGreaterThan(DUREE_JETON_MS - 60_000);
    expect(duree).toBeLessThanOrEqual(DUREE_JETON_MS);
  });

  it("une adresse inconnue ne crée rien et ne lève pas", async () => {
    // La page ne doit pas trahir l'existence d'un compte : la fonction se tait.
    await expect(demanderReinitialisation("personne@exemple.test")).resolves.toBeUndefined();
  });

  it("une seconde demande invalide le lien précédent", async () => {
    /*
     * Deux liens actifs en même temps doublent la surface d'attaque, et on ne
     * saurait plus lequel a servi.
     */
    await demanderReinitialisation(email);
    const premier = await jetonEnBase();

    await demanderReinitialisation(email);
    const second = await jetonEnBase();

    expect(second).not.toBe(premier);
    expect(await etatDuLien(premier!)).toBe("inconnu");
    expect(await etatDuLien(second!)).toBe("valide");
  });

  it("le nouveau mot de passe remplace l'ancien", async () => {
    await demanderReinitialisation(email);
    const valeur = await jetonEnBase();

    const resultat = await reinitialiser(valeur!, NOUVEAU);
    expect(resultat.etat).toBe("valide");

    const compte = await prisma.users.findUniqueOrThrow({ where: { id: compteId } });
    expect(verifier(NOUVEAU, { hash: compte.password_hash, salt: compte.salt })).toBe(true);
    expect(verifier(ANCIEN, { hash: compte.password_hash, salt: compte.salt })).toBe(false);
  });

  it("le lien ne sert qu'une fois", async () => {
    await demanderReinitialisation(email);
    const valeur = await jetonEnBase();

    await reinitialiser(valeur!, NOUVEAU);
    const second = await reinitialiser(valeur!, "encore-un-autre-88");

    expect(second.etat).toBe("utilise");
    expect(second.session).toBeNull();

    // Le second mot de passe n'a pas pris : c'est bien le premier qui vaut.
    const compte = await prisma.users.findUniqueOrThrow({ where: { id: compteId } });
    expect(verifier(NOUVEAU, { hash: compte.password_hash, salt: compte.salt })).toBe(true);
  });

  it("un lien expiré est refusé", async () => {
    await demanderReinitialisation(email);
    const valeur = await jetonEnBase();
    await prisma.email_tokens.update({
      where: { token: valeur! },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    expect(await etatDuLien(valeur!)).toBe("expire");
    expect((await reinitialiser(valeur!, NOUVEAU)).etat).toBe("expire");
  });

  it("un jeton inventé est refusé", async () => {
    expect(await etatDuLien("x".repeat(64))).toBe("inconnu");
    expect((await reinitialiser("x".repeat(64), NOUVEAU)).etat).toBe("inconnu");
  });

  it("un jeton de confirmation d'adresse ne sert pas à réinitialiser", async () => {
    /*
     * Les deux vivent dans la même table. Sans contrôle du type, un lien de
     * confirmation d'inscription - valable 24 h et envoyé plus largement - ouvrirait
     * le changement de mot de passe.
     */
    const valeur = jeton();
    await prisma.email_tokens.create({
      data: {
        token: valeur,
        user_id: compteId,
        type: "verify",
        expires_at: new Date(Date.now() + 3_600_000),
      },
    });

    expect(await etatDuLien(valeur)).toBe("inconnu");
    expect((await reinitialiser(valeur, NOUVEAU)).etat).toBe("inconnu");
  });

  it("les sessions ouvertes tombent, et une nouvelle s'ouvre", async () => {
    const ancienne = jeton();
    await creerSession(compteId, ancienne);
    expect(await utilisateurDuJeton(ancienne)).not.toBeNull();

    await demanderReinitialisation(email);
    const valeur = await jetonEnBase();
    const resultat = await reinitialiser(valeur!, NOUVEAU);

    // On réinitialise souvent parce qu'un accès est compromis : le laisser vivre
    // viderait le geste de son sens.
    expect(await utilisateurDuJeton(ancienne)).toBeNull();
    expect(resultat.session).not.toBeNull();
    expect((await utilisateurDuJeton(resultat.session!))?.id).toBe(compteId);
  });

  it("les tentatives de connexion comptées sont effacées", async () => {
    // Sinon la personne se retrouve bloquée juste après avoir choisi son mot de passe.
    for (let i = 0; i < 3; i++) {
      await prisma.tentatives.create({ data: { action: "connexion", cle: email } });
    }

    await demanderReinitialisation(email);
    await reinitialiser((await jetonEnBase())!, NOUVEAU);

    const restantes = await prisma.tentatives.count({
      where: { action: "connexion", cle: email },
    });
    expect(restantes).toBe(0);
  });

  it("un compte suspendu ne se rouvre pas par ce chemin", async () => {
    await demanderReinitialisation(email);
    const valeur = await jetonEnBase();
    await prisma.users.update({ where: { id: compteId }, data: { suspended: true } });

    // Ce serait contourner la décision qui l'a suspendu.
    expect((await reinitialiser(valeur!, NOUVEAU)).etat).toBe("inconnu");

    const compte = await prisma.users.findUniqueOrThrow({ where: { id: compteId } });
    expect(verifier(ANCIEN, { hash: compte.password_hash, salt: compte.salt })).toBe(true);
  });

  it("un compte suspendu ne reçoit pas de lien non plus", async () => {
    await prisma.users.update({ where: { id: compteId }, data: { suspended: true } });
    await demanderReinitialisation(email);
    expect(await jetonEnBase()).toBeNull();
  });

  it("une adresse non confirmée l'est après réinitialisation", async () => {
    /*
     * Recevoir le lien prouve que l'adresse est bien la sienne : la laisser non
     * confirmée refuserait la connexion juste après le changement.
     */
    await prisma.users.update({ where: { id: compteId }, data: { email_verified: false } });
    await demanderReinitialisation(email);
    await reinitialiser((await jetonEnBase())!, NOUVEAU);

    const compte = await prisma.users.findUniqueOrThrow({ where: { id: compteId } });
    expect(compte.email_verified).toBe(true);
  });
});
