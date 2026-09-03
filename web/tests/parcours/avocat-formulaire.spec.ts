import { test, expect } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }) });
test.use({ storageState: "./tests/parcours/session-avocat.json" });

/**
 * Le vrai formulaire, et le décalage qu'il peut créer.
 *
 * La fenêtre de correction rend les champs à plat : elle va vite pour une coquille et
 * perd ce qui les entoure - l'ordre des étapes, les aides, les listes de personnes.
 * L'avocat assigné a toujours eu le droit de modifier le dossier ; le parcours du
 * client s'ouvre donc tel quel.
 *
 * Ce parcours enregistre au fil de la frappe. Un capital corrigé là-bas laisse les
 * actes tels quels : les statuts déposés diraient une chose, le dossier une autre. La
 * page du cabinet compare donc la date des actes à celle du dossier, et le dit.
 */
test("l'avocat ouvre le formulaire du client, et le décalage se voit", async ({ page, request }) => {
  const client = await prisma.users.findFirstOrThrow({ where: { email: "parcours@exemple.test" } });
  const avocat = await prisma.users.findFirstOrThrow({ where: { email: "avocat-parcours@exemple.test" } });
  const d = await prisma.formalites.create({
    data: {
      user_id: client.id, assigned_avocat_id: avocat.id, type: "creation", forme: "SASU",
      societe: "FORMULAIRE ESSAI", status: "en_attente_validation", phase: 5, business_sub_phase: "5c",
      data_json: JSON.stringify({
        forme: "SASU", denomination: "FORMULAIRE ESSAI", activite: "Conseil", adresse: "3 rue Centrale",
        codePostal: "33000", ville: "Bordeaux", banque: "Qonto", capital: 1000, capitalLibere: 1000,
        partsTotales: 100, offre: "business", paye: true, dureeDeVie: 99,
        dateCloturePremierExercice: "2027-12-31", revue: { informations: true, par: avocat.id },
        associes: [{ type: "physique", parts: 100, versement: 1000, personne: {
          civilite: "Monsieur", prenom: "Camille", nom: "Durand", dateDeNaissance: "1985-04-12",
          villeDeNaissance: "Bordeaux", adresse: "3 rue Centrale", codePostal: "33000", ville: "Bordeaux" } }],
        dirigeants: [{ associe: 0 }],
      }),
    },
  });
  await request.post("/api/formalites/documents", { data: { dossier: d.id } });

  await page.goto("/avocat/" + d.id);
  await expect(page.getByText(/Le dossier a changé depuis la production/)).toHaveCount(0);

  const lien = page.getByRole("link", { name: "Ouvrir le formulaire" });
  await lien.click();
  await page.waitForURL(/\/creation\?/);
  await expect(page.getByRole("link", { name: /Le dossier au cabinet/ })).toBeVisible();

  /*
   * Une vraie correction, par le chemin de l'application.
   *
   * Écrire `updated_at` depuis le client Prisma des tests le décale : il force
   * « timezone=UTC » sur sa connexion, et la date atterrit deux heures en arrière.
   */
  await page.waitForTimeout(6000);
  await request.put("/api/formalites/brouillon", {
    data: { dossier: d.id, modifications: { capital: 2000 } },
  });
  await page.goto("/avocat/" + d.id);
  await expect(page.getByText(/Le dossier a changé depuis la production/)).toBeVisible();

  await prisma.documents.deleteMany({ where: { formalite_id: d.id } });
  await prisma.audit_log.deleteMany({ where: { formalite_id: d.id } });
  await prisma.formalites.delete({ where: { id: d.id } });
  await prisma.$disconnect();
});
