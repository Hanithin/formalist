import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/infrastructure/db/client";
import { exigerDossierModifiable } from "@/infrastructure/db/depots/dossiers";
import { verifierDepot, nomDeStockage } from "@/lib/fichiers";
import type { UtilisateurConnecte } from "@/infrastructure/db/sessions";

/**
 * Stockage des pièces déposées.
 *
 * Le dossier reste celui du serveur d'origine tant que les deux cohabitent ; il
 * passera au stockage objet avec le reste de l'infrastructure.
 *
 * Chaque dépôt est inscrit au registre uploaded_files, avec son déposant et son
 * dossier. C'est ce registre qui permet de répondre à « qui a le droit de lire ce
 * fichier », et son absence est ce qui avait laissé /api/file ouvert.
 */
const DEPOT = path.join(process.cwd(), "..", "uploads");

export async function deposerPiece(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  piece: { identifiant: string; titre: string },
  fichier: File,
  formatsAcceptes?: string[]
) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);

  const contenu = new Uint8Array(await fichier.arrayBuffer());
  verifierDepot(fichier.name, contenu, formatsAcceptes);

  const nom = nomDeStockage(path.extname(fichier.name).toLowerCase());
  await mkdir(DEPOT, { recursive: true });
  await writeFile(path.join(DEPOT, nom), contenu);

  // Registre d'abord : un fichier sur le disque sans propriétaire connu est
  // exactement la situation qu'on veut rendre impossible.
  await prisma.uploaded_files.create({
    data: {
      filename: nom,
      user_id: utilisateur.id,
      formalite_id: dossier.id,
      original_name: fichier.name,
    },
  });

  const document = await prisma.documents.create({
    data: {
      formalite_id: dossier.id,
      name: piece.titre,
      type: piece.identifiant,
      file_path: nom,
      uploaded_by: utilisateur.roles.includes("avocat") ? "avocat" : "user",
      status: "uploaded",
    },
  });

  return { id: document.id, nom, titre: piece.titre };
}

/** Enregistre un document produit par la plateforme. */
export async function enregistrerDocumentProduit(
  dossierId: number,
  titre: string,
  nomFichier: string,
  contenu: Buffer
) {
  await mkdir(DEPOT, { recursive: true });
  await writeFile(path.join(DEPOT, nomFichier), contenu);

  return prisma.documents.create({
    data: {
      formalite_id: dossierId,
      name: titre,
      type: "docx",
      file_path: nomFichier,
      uploaded_by: "system",
      status: "generated",
    },
  });
}
