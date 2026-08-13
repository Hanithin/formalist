import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/infrastructure/db/client";
import { remplacerDocumentsProduits } from "@/infrastructure/documents/depot";
import { conversionDisponible } from "@/infrastructure/documents/conversion";
import { genererDocument } from "@/infrastructure/documents/generation";
import { hacher } from "@/lib/mots-de-passe";

/**
 * Régénérer les actes remplace le jeu précédent.
 *
 * Le parcours d'origine ne pouvait pas empiler : il ne stockait rien, et sa liste se
 * reconstruisait entièrement à chaque appel. La version qui persiste les actes, elle,
 * ajoutait un jeu complet à chaque clic - un dossier régénéré deux fois portait trois
 * exemplaires de chaque document. C'est ce que ce test interdit.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "regeneration-essai-";
const DEPOT = path.join(process.cwd(), "..", "uploads");

function acte(titre: string, version: string) {
  return { titre, contenu: Buffer.from(titre + " " + version) };
}

const JEU = [
  acte("Statuts constitutifs", "v1"),
  acte("Liste des souscripteurs", "v1"),
  acte("Procès-verbal de nomination", "v1"),
];

async function surLeDisque(nom: string) {
  return stat(path.join(DEPOT, nom)).then(
    () => true,
    () => false
  );
}

avecBase("régénération des actes", () => {
  const dossiers: number[] = [];
  const fichiers = new Set<string>();
  let proprietaire: number;

  async function nouveauDossier() {
    const d = await prisma.formalites.create({
      data: {
        user_id: proprietaire,
        type: "creation",
        forme: "SASU",
        societe: MARQUE + dossiers.length,
        status: "en_cours",
        data_json: "{}",
      },
    });
    dossiers.push(d.id);
    return d.id;
  }

  /** Les actes du dossier, et le relevé de leurs fichiers pour le nettoyage. */
  async function actesDu(dossier: number) {
    const lignes = await prisma.documents.findMany({
      where: { formalite_id: dossier },
      orderBy: { id: "asc" },
    });
    for (const l of lignes) {
      if (l.file_path) fichiers.add(l.file_path);
      if (l.source_path) fichiers.add(l.source_path);
    }
    return lignes;
  }

  beforeAll(async () => {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + "proprietaire@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Essai régénération",
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    proprietaire = u.id;
  });

  afterAll(async () => {
    await prisma.documents.deleteMany({ where: { formalite_id: { in: dossiers } } });
    await prisma.formalites.deleteMany({ where: { id: { in: dossiers } } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    for (const nom of fichiers) {
      await rm(path.join(DEPOT, nom), { force: true }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("deux productions de suite laissent un seul jeu, pas deux", async () => {
    const dossier = await nouveauDossier();

    await remplacerDocumentsProduits(dossier, JEU);
    expect(await actesDu(dossier)).toHaveLength(JEU.length);

    await remplacerDocumentsProduits(dossier, JEU);
    const apres = await actesDu(dossier);

    expect(apres).toHaveLength(JEU.length);
    expect(apres.map((d) => d.name).sort()).toEqual(JEU.map((a) => a.titre).sort());
  });

  it("trois productions n'en laissent pas trois exemplaires", async () => {
    const dossier = await nouveauDossier();

    for (let i = 0; i < 3; i++) await remplacerDocumentsProduits(dossier, JEU);

    const apres = await actesDu(dossier);
    expect(apres).toHaveLength(JEU.length);

    const parNom = new Map<string, number>();
    for (const d of apres) parNom.set(d.name, (parNom.get(d.name) ?? 0) + 1);
    expect([...parNom.values()]).toEqual([1, 1, 1]);
  });

  it("le fichier reproduit remplace l'ancien sur le disque", async () => {
    const dossier = await nouveauDossier();

    await remplacerDocumentsProduits(dossier, [acte("Statuts constitutifs", "v1")]);
    const premier = (await actesDu(dossier))[0];
    expect(premier.file_path).toBeTruthy();
    expect(await surLeDisque(premier.file_path!)).toBe(true);

    await remplacerDocumentsProduits(dossier, [acte("Statuts constitutifs", "v2")]);
    const second = (await actesDu(dossier))[0];

    expect(second.file_path).not.toBe(premier.file_path);
    // L'ancien fichier ne doit pas rester sur le disque à s'accumuler.
    expect(await surLeDisque(premier.file_path!)).toBe(false);
    expect(await surLeDisque(second.file_path!)).toBe(true);
  });

  it("l'acte est figé en PDF et garde son Word en source", async () => {
    if (!(await conversionDisponible())) return; // LibreOffice absent : voir le repli plus bas

    const dossier = await nouveauDossier();
    const docx = genererDocument("sasu-statuts.docx", { NOM_SOCIETE: "ESSAI PDF FIGE" });

    await remplacerDocumentsProduits(dossier, [
      { titre: "Statuts constitutifs", contenu: docx },
    ]);

    const [acte] = await actesDu(dossier);

    // C'est le PDF qu'on remet, et il ne dépend plus d'une conversion à la lecture.
    expect(acte.file_path).toMatch(/\.pdf$/);
    expect(await surLeDisque(acte.file_path!)).toBe(true);
    const octets = await readFile(path.join(DEPOT, acte.file_path!));
    expect(octets.subarray(0, 4).toString()).toBe("%PDF");

    // Le Word reste : la signature s'y appose avant conversion.
    expect(acte.source_path).toMatch(/\.docx$/);
    expect(await surLeDisque(acte.source_path!)).toBe(true);
  }, 90_000);

  it("sans LibreOffice, l'acte est gardé en Word plutôt que perdu", async () => {
    // Rien à vérifier ici quand la conversion marche : c'est le comportement en son
    // absence qui compte, et LibreOffice convertit jusqu'au texte brut - on ne peut
    // donc pas provoquer l'échec par le contenu.
    if (await conversionDisponible()) return;

    const dossier = await nouveauDossier();
    await remplacerDocumentsProduits(dossier, [
      { titre: "Statuts constitutifs", contenu: Buffer.from("acte") },
    ]);

    const [acte] = await actesDu(dossier);
    expect(acte.file_path).toMatch(/\.docx$/);
    expect(acte.source_path).toBeNull();
    expect(await surLeDisque(acte.file_path!)).toBe(true);
  }, 90_000);

  it("un acte signé survit et n'est pas reproduit", async () => {
    const dossier = await nouveauDossier();

    await remplacerDocumentsProduits(dossier, JEU);
    const avant = await actesDu(dossier);
    const statuts = avant.find((d) => d.name === "Statuts constitutifs")!;

    // Un acte signé ne se remplace pas en silence : le remplacer détruirait la
    // signature, et le reproduire en ferait un doublon à côté.
    await prisma.documents.update({ where: { id: statuts.id }, data: { status: "signed" } });

    await remplacerDocumentsProduits(dossier, JEU);
    const apres = await actesDu(dossier);

    expect(apres).toHaveLength(JEU.length);
    const survivant = apres.filter((d) => d.name === "Statuts constitutifs");
    expect(survivant).toHaveLength(1);
    expect(survivant[0].id).toBe(statuts.id);
    expect(survivant[0].status).toBe("signed");
    expect(survivant[0].file_path).toBe(statuts.file_path);
  });

  it("les pièces déposées par le client ne sont pas emportées", async () => {
    const dossier = await nouveauDossier();

    const piece = await prisma.documents.create({
      data: {
        formalite_id: dossier,
        name: "Justificatif de domicile",
        type: "justificatif",
        file_path: "piece-essai.pdf",
        uploaded_by: "user",
        status: "uploaded",
      },
    });

    await remplacerDocumentsProduits(dossier, JEU);
    await remplacerDocumentsProduits(dossier, JEU);

    const apres = await actesDu(dossier);
    expect(apres).toHaveLength(JEU.length + 1);
    expect(apres.find((d) => d.id === piece.id)?.file_path).toBe("piece-essai.pdf");
  });
});
