import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import {
  mesDisponibilites,
  ajouterPlage,
  retirerPlage,
  ajouterAbsence,
  retirerAbsence,
  creneauxDe,
  avocatsDisponibles,
} from "@/infrastructure/db/depots/consultations";
import { hacher, jeton } from "@/lib/mots-de-passe";
import type { UtilisateurConnecte } from "@/infrastructure/db/sessions";

/**
 * Les disponibilités publiées par l'avocat, sur une vraie base.
 *
 * Deux choses s'y vérifient qu'un test de domaine ne peut pas voir : que le refus du
 * chevauchement est bien appliqué par le chemin qu'emprunte l'API - la page d'origine
 * ne le vérifiait que dans le navigateur, ce qu'un appel direct contournait - et qu'un
 * avocat ne touche qu'à ses propres plages.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "dispo-essai-";

avecBase("disponibilités d'un avocat", () => {
  let avocat: UtilisateurConnecte;
  let autre: UtilisateurConnecte;
  let cliente: UtilisateurConnecte;

  async function creerCompte(suffixe: string, roles: string[]): Promise<UtilisateurConnecte> {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + suffixe + "@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Essai " + suffixe,
        role: roles[0],
        roles: JSON.stringify(roles),
        email_verified: true,
      },
    });
    return {
      id: u.id,
      email: u.email,
      nom: u.name,
      roles: roles as UtilisateurConnecte["roles"],
      jeton: jeton(8),
    };
  }

  beforeAll(async () => {
    avocat = await creerCompte("avocat", ["avocat"]);
    autre = await creerCompte("autre-avocat", ["avocat"]);
    cliente = await creerCompte("cliente", ["user"]);
  });

  beforeEach(async () => {
    await prisma.avocat_availability.deleteMany({
      where: { avocat_id: { in: [avocat.id, autre.id] } },
    });
    await prisma.avocat_blocked_dates.deleteMany({
      where: { avocat_id: { in: [avocat.id, autre.id] } },
    });
  });

  afterAll(async () => {
    await prisma.avocat_availability.deleteMany({
      where: { avocat_id: { in: [avocat.id, autre.id] } },
    });
    await prisma.avocat_blocked_dates.deleteMany({
      where: { avocat_id: { in: [avocat.id, autre.id] } },
    });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  /*
   * Le jour s'écrit à partir des composantes locales, jamais par toISOString() : un
   * minuit local converti en UTC tombe la veille sous nos latitudes, et l'absence
   * serait enregistrée pour le mauvais jour.
   */
  const enJour = (d: Date) =>
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0");

  const plage = (jourSemaine: number, debut: string, fin: string, duree = 30) => ({
    jourSemaine,
    debut,
    fin,
    dureeCreneauMinutes: duree,
  });

  it("une plage publiée se relit", async () => {
    await ajouterPlage(avocat, plage(2, "09:00", "12:00"));

    const { plages } = await mesDisponibilites(avocat);
    expect(plages).toHaveLength(1);
    expect(plages[0].start_time).toBe("09:00");
    expect(plages[0].slot_duration_minutes).toBe(30);
  });

  it("une plage qui en chevauche une autre est refusée", async () => {
    /*
     * Deux plages superposées produisent des créneaux en double, qu'un client peut
     * réserver deux fois. Le contrôle vit dans le dépôt, et non dans la page : là,
     * un appel direct à l'API le contournerait.
     */
    await ajouterPlage(avocat, plage(2, "09:00", "12:00"));

    await expect(ajouterPlage(avocat, plage(2, "11:00", "14:00"))).rejects.toMatchObject({
      statut: 403,
    });

    const { plages } = await mesDisponibilites(avocat);
    expect(plages).toHaveLength(1);
  });

  it("deux plages qui se touchent bout à bout passent", async () => {
    await ajouterPlage(avocat, plage(2, "09:00", "12:00"));
    await ajouterPlage(avocat, plage(2, "12:00", "14:00"));

    expect((await mesDisponibilites(avocat)).plages).toHaveLength(2);
  });

  it("le même horaire un autre jour n'est pas un chevauchement", async () => {
    await ajouterPlage(avocat, plage(2, "09:00", "12:00"));
    await ajouterPlage(avocat, plage(3, "09:00", "12:00"));

    expect((await mesDisponibilites(avocat)).plages).toHaveLength(2);
  });

  it("la plage d'un autre avocat n'entre pas dans le calcul", async () => {
    // Sinon deux avocats aux mêmes horaires se bloqueraient mutuellement.
    await ajouterPlage(autre, plage(2, "09:00", "12:00"));
    await expect(ajouterPlage(avocat, plage(2, "09:00", "12:00"))).resolves.toBeTruthy();
  });

  it("une plage incohérente est refusée", async () => {
    await expect(ajouterPlage(avocat, plage(2, "12:00", "09:00"))).rejects.toMatchObject({
      statut: 403,
    });
    await expect(ajouterPlage(avocat, plage(2, "09:00", "09:20", 30))).rejects.toMatchObject({
      statut: 403,
    });
  });

  it("un avocat ne retire pas la plage d'un autre", async () => {
    const sienne = await ajouterPlage(autre, plage(2, "09:00", "12:00"));

    await expect(retirerPlage(avocat, sienne.id)).rejects.toMatchObject({ statut: 403 });
    expect((await mesDisponibilites(autre)).plages).toHaveLength(1);
  });

  it("un client ne publie pas de disponibilités", async () => {
    await expect(mesDisponibilites(cliente)).rejects.toMatchObject({ statut: 403 });
    await expect(ajouterPlage(cliente, plage(2, "09:00", "12:00"))).rejects.toMatchObject({
      statut: 403,
    });
  });

  it("publier rend l'avocat visible dans la prise de rendez-vous", async () => {
    /*
     * C'est le lien qui manquait : un avocat sans plage n'apparaît nulle part, et
     * rien à l'écran ne disait pourquoi.
     */
    expect((await avocatsDisponibles()).map((a) => a.id)).not.toContain(avocat.id);

    await ajouterPlage(avocat, plage(2, "09:00", "12:00"));

    expect((await avocatsDisponibles()).map((a) => a.id)).toContain(avocat.id);
  });

  it("une absence retire les créneaux de la journée", async () => {
    await ajouterPlage(avocat, plage(2, "09:00", "12:00"));

    const mardi = new Date();
    mardi.setHours(0, 0, 0, 0);
    mardi.setDate(mardi.getDate() + ((9 - mardi.getDay()) % 7 || 7));
    const jour = enJour(mardi);

    const avant = await creneauxDe(avocat.id, mardi, mardi);
    expect(avant.length).toBeGreaterThan(0);

    const absence = await ajouterAbsence(avocat, { debut: jour, fin: jour, motif: "Congés" });
    expect(await creneauxDe(avocat.id, mardi, mardi)).toHaveLength(0);

    // Et l'absence retirée, les créneaux reviennent.
    await retirerAbsence(avocat, absence.id);
    expect((await creneauxDe(avocat.id, mardi, mardi)).length).toBe(avant.length);
  });

  it("une absence dont la fin précède le début est refusée", async () => {
    await expect(
      ajouterAbsence(avocat, { debut: "2026-09-10", fin: "2026-09-01" })
    ).rejects.toMatchObject({ statut: 403 });
  });
});
