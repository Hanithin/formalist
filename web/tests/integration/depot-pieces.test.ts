import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/infrastructure/db/client";
import { deposerPiece } from "@/infrastructure/documents/depot";
import { hacher } from "@/lib/mots-de-passe";

/**
 * Redéposer une pièce la remplace.
 *
 * Rien n'écartait le dépôt précédent : un client qui s'était trompé de fichier, ou qui
 * répondait à un refus, laissait deux « Justificatif de jouissance du nouveau local »
 * côte à côte dans l'espace avocat, à une minute d'intervalle. L'avocat devait deviner
 * lequel faisait foi, et statuer deux fois sur la même pièce.
 */
const avecBase = process.env.DATABASE_URL ? describe : describe.skip;

const MARQUE = "depot-pieces-essai-";
const DEPOT = path.join(process.cwd(), "..", "uploads");
const PIECE = { identifiant: "jouissance-locaux", titre: "Justificatif de jouissance" };

function fichier(nom: string, contenu: string) {
  // Un PDF est reconnu à sa signature : le contrôle de dépôt la vérifie.
  return new File([Buffer.from("%PDF-1.4\n" + contenu)], nom, { type: "application/pdf" });
}

async function surLeDisque(nom: string) {
  return stat(path.join(DEPOT, nom)).then(
    () => true,
    () => false
  );
}

avecBase("dépôt d'une pièce", () => {
  let utilisateur: { id: number; roles: string[]; email: string };
  let dossier: number;
  const fichiers = new Set<string>();

  beforeAll(async () => {
    const empreinte = hacher("MotDePasseEssai2026!");
    const u = await prisma.users.create({
      data: {
        email: MARQUE + "client@exemple.test",
        password_hash: empreinte.hash,
        salt: empreinte.salt,
        name: "Essai dépôt",
        role: "user",
        roles: JSON.stringify(["user"]),
        email_verified: true,
      },
    });
    utilisateur = { id: u.id, roles: ["user"], email: u.email };

    const d = await prisma.formalites.create({
      data: {
        user_id: u.id,
        type: "modification",
        forme: "SAS",
        societe: MARQUE + "societe",
        status: "en_cours",
        data_json: "{}",
      },
    });
    dossier = d.id;
  });

  afterAll(async () => {
    await prisma.documents.deleteMany({ where: { formalite_id: dossier } });
    await prisma.uploaded_files.deleteMany({ where: { formalite_id: dossier } });
    await prisma.formalites.deleteMany({ where: { id: dossier } });
    await prisma.users.deleteMany({ where: { email: { startsWith: MARQUE } } });
    for (const nom of fichiers) await rm(path.join(DEPOT, nom), { force: true }).catch(() => {});
    await prisma.$disconnect();
  });

  async function deposer(contenu: string) {
    const pose = await deposerPiece(
      utilisateur as never,
      dossier,
      PIECE,
      fichier("bail.pdf", contenu),
      [".pdf"]
    );
    fichiers.add(pose.nom);
    return pose;
  }

  it("un second dépôt de la même pièce remplace le premier", async () => {
    const premier = await deposer("premiere version");
    const second = await deposer("seconde version");

    const lignes = await prisma.documents.findMany({
      where: { formalite_id: dossier, type: PIECE.identifiant },
    });

    expect(lignes).toHaveLength(1);
    expect(lignes[0].file_path).toBe(second.nom);
    // Le fichier remplacé ne reste pas sur le disque à s'accumuler.
    expect(await surLeDisque(premier.nom)).toBe(false);
    expect(await surLeDisque(second.nom)).toBe(true);
  });

  it("une pièce refusée est remplacée par la nouvelle", async () => {
    const refusee = (await prisma.documents.findFirst({
      where: { formalite_id: dossier, type: PIECE.identifiant },
    }))!;
    await prisma.documents.update({
      where: { id: refusee.id },
      data: { rejection_reason: "Document illisible", rejected_at: new Date() },
    });

    await deposer("troisieme version");

    const lignes = await prisma.documents.findMany({
      where: { formalite_id: dossier, type: PIECE.identifiant },
    });
    expect(lignes).toHaveLength(1);
    expect(lignes[0].rejection_reason).toBeNull();
  });

  it("une pièce déjà vérifiée n'est pas détruite par un nouveau dépôt", async () => {
    const verifiee = (await prisma.documents.findFirst({
      where: { formalite_id: dossier, type: PIECE.identifiant },
    }))!;
    await prisma.documents.update({
      where: { id: verifiee.id },
      data: { status: "verified" },
    });

    await deposer("quatrieme version");

    const lignes = await prisma.documents.findMany({
      where: { formalite_id: dossier, type: PIECE.identifiant },
      orderBy: { id: "asc" },
    });

    // Nous ne détruisons pas ce que l'avocat a validé : c'est à lui de trancher.
    expect(lignes).toHaveLength(2);
    expect(lignes[0].id).toBe(verifiee.id);
    expect(lignes[0].status).toBe("verified");
  });
});
