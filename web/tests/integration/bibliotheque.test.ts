import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { listerDocuments } from "@/infrastructure/db/depots/documents";
import { deposerAuCoffre } from "@/infrastructure/documents/depot";
import { grouper, TITRE_SANS_SOCIETE } from "@/domain/document/bibliotheque";
import { hacher, jeton } from "@/lib/mots-de-passe";
import type { UtilisateurConnecte } from "@/infrastructure/db/sessions";

/**
 * La bibliothèque de documents, sur une vraie base.
 *
 * Deux choses s'y vérifient qu'un test de domaine ne peut pas voir : qu'un document
 * ne franchit pas la frontière entre deux clients, et qu'un rattachement à une société
 * qui n'est pas la sienne ne prend pas - sinon un identifiant recopié à la main ferait
 * apparaître le nom d'une société étrangère dans sa propre bibliothèque.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "biblio-essai-";

function fichierPdf(nom: string): File {
  // Un PDF minimal : le dépôt vérifie la signature réelle, pas l'extension.
  const contenu = new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n");
  return new File([contenu], nom, { type: "application/pdf" });
}

avecBase("bibliothèque de documents", () => {
  let cliente: UtilisateurConnecte;
  let tiers: UtilisateurConnecte;
  let dossierCliente: number;
  let dossierTiers: number;

  async function creerCompte(suffixe: string): Promise<UtilisateurConnecte> {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + suffixe + "@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Essai " + suffixe,
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    return { id: u.id, email: u.email, nom: u.name, roles: ["user"], jeton: jeton(8) };
  }

  async function creerDossier(utilisateurId: number, societe: string) {
    const d = await prisma.formalites.create({
      data: {
        user_id: utilisateurId,
        type: "creation",
        forme: "SASU",
        societe,
        status: "en_cours",
        data_json: "{}",
      },
    });
    return d.id;
  }

  beforeAll(async () => {
    cliente = await creerCompte("cliente");
    tiers = await creerCompte("tiers");
    dossierCliente = await creerDossier(cliente.id, MARQUE + "SOCIETE A");
    dossierTiers = await creerDossier(tiers.id, MARQUE + "SOCIETE B");
  });

  afterAll(async () => {
    const ids = [cliente.id, tiers.id];
    await prisma.documents.deleteMany({
      where: { formalite_id: { in: [dossierCliente, dossierTiers] } },
    });
    await prisma.user_documents.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.uploaded_files.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.formalites.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    await prisma.$disconnect();
  });

  it("un dépôt rattaché à sa société la rejoint dans le rangement", async () => {
    const depose = await deposerAuCoffre(
      cliente,
      fichierPdf("bail.pdf"),
      "Bail commercial",
      dossierCliente
    );
    expect(depose.dossierId).toBe(dossierCliente);

    const documents = await listerDocuments(cliente);
    const range = documents.find((d) => d.nom === "Bail commercial");
    expect(range?.societeId).toBe(dossierCliente);

    const groupes = grouper(documents);
    const groupe = groupes.find((g) => g.societeId === dossierCliente);
    expect(groupe?.documents.map((d) => d.nom)).toContain("Bail commercial");
  });

  it("un dépôt sans société rejoint les dépôts personnels", async () => {
    await deposerAuCoffre(cliente, fichierPdf("kbis.pdf"), "Ancien Kbis", null);

    const groupes = grouper(await listerDocuments(cliente));
    const personnels = groupes.find((g) => g.societeId === null);

    expect(personnels?.titre).toBe(TITRE_SANS_SOCIETE);
    expect(personnels?.documents.map((d) => d.nom)).toContain("Ancien Kbis");
    // Et il ferme la liste, quel que soit l'ordre d'arrivée.
    expect(groupes[groupes.length - 1].societeId).toBeNull();
  });

  it("un rattachement à la société d'un autre ne prend pas", async () => {
    /*
     * Le dossier est simplement ignoré : le document rejoint les dépôts personnels
     * plutôt que d'afficher le nom d'une société qui n'est pas la sienne. Refuser
     * sèchement apprendrait au passage que ce dossier existe.
     */
    const depose = await deposerAuCoffre(
      cliente,
      fichierPdf("intrusion.pdf"),
      "Essai de rattachement",
      dossierTiers
    );

    expect(depose.dossierId).toBeNull();

    const documents = await listerDocuments(cliente);
    expect(documents.find((d) => d.nom === "Essai de rattachement")?.societeId).toBeNull();
  });

  it("les documents d'un client n'apparaissent pas chez un autre", async () => {
    await prisma.documents.create({
      data: {
        formalite_id: dossierTiers,
        name: MARQUE + "acte du tiers",
        type: "statuts",
        file_path: "peu-importe.pdf",
        uploaded_by: "system",
        status: "generated",
      },
    });

    const documents = await listerDocuments(cliente);
    expect(documents.map((d) => d.nom)).not.toContain(MARQUE + "acte du tiers");
  });

  it("le déposant est inscrit au registre, sans quoi il ne pourrait pas relire", async () => {
    // Un fichier sans propriétaire connu est refusé à la lecture : c'est la règle
    // qui avait manqué à /api/file.
    const depose = await deposerAuCoffre(cliente, fichierPdf("relu.pdf"), "Relu", null);

    const registre = await prisma.uploaded_files.findUnique({
      where: { filename: depose.fichier },
    });
    expect(registre?.user_id).toBe(cliente.id);
  });

  it("un fichier dont le contenu ne correspond pas à son extension est refusé", async () => {
    const faux = new File([new TextEncoder().encode("ceci est du texte")], "faux.pdf", {
      type: "application/pdf",
    });

    await expect(deposerAuCoffre(cliente, faux, "Faux", null)).rejects.toMatchObject({
      statut: 400,
    });
  });
});
