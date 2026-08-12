import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/infrastructure/db/client";
import { exigerDossierModifiable } from "@/infrastructure/db/depots/dossiers";
import { verifierDepot, nomDeStockage } from "@/lib/fichiers";
import { journal } from "@/lib/journal";
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

/**
 * Remplace les documents produits par la plateforme.
 *
 * Régénérer ne doit pas empiler. La page d'origine ne pouvait pas empiler : elle ne
 * stockait rien, et renderDocSpace() vidait la liste (container.innerHTML = '') pour
 * la reconstruire depuis le formulaire à chaque appel. Ici les actes sont persistés -
 * la signature, l'espace avocat et le dépôt au greffe les lisent - donc le geste
 * équivalent est de retirer le jeu précédent au lieu d'en ajouter un second.
 *
 * Un acte sorti de l'état « generated » n'est pas touché : un document signé ou
 * vérifié ne se remplace pas en silence, et il n'est pas reproduit non plus. Sans
 * cette réserve, régénérer après signature détruirait l'acte signé.
 */
export async function remplacerDocumentsProduits(
  dossierId: number,
  actes: { titre: string; contenu: Buffer }[]
) {
  const existants = await prisma.documents.findMany({
    where: { formalite_id: dossierId, uploaded_by: "system" },
  });

  const conserves = existants.filter((d) => d.status !== "generated");
  const figes = new Set(conserves.map((d) => d.name));
  const remplaces = existants.filter((d) => d.status === "generated");

  await mkdir(DEPOT, { recursive: true });

  // Les fichiers d'abord, la base ensuite : une ligne qui désigne un fichier absent
  // casse l'aperçu, alors qu'un fichier sans ligne n'est qu'un octet perdu.
  const ecrits: { titre: string; nom: string }[] = [];
  for (const acte of actes) {
    if (figes.has(acte.titre)) continue;
    const nom = nomDeStockage(".docx");
    await writeFile(path.join(DEPOT, nom), acte.contenu);
    ecrits.push({ titre: acte.titre, nom });
  }

  // Retrait et insertion dans la même transaction : un échec au milieu laisserait
  // sinon le dossier sans aucun acte, alors qu'il en avait avant le clic.
  const produits = await prisma.$transaction(async (tx) => {
    if (remplaces.length > 0) {
      await tx.documents.deleteMany({ where: { id: { in: remplaces.map((d) => d.id) } } });
    }

    const lignes = [];
    for (const ecrit of ecrits) {
      lignes.push(
        await tx.documents.create({
          data: {
            formalite_id: dossierId,
            name: ecrit.titre,
            type: "docx",
            file_path: ecrit.nom,
            uploaded_by: "system",
            status: "generated",
          },
        })
      );
    }
    return lignes;
  });

  // Les fichiers du jeu précédent, une fois la base à jour. Un fichier qui résiste
  // ne doit pas faire échouer une régénération réussie par ailleurs.
  for (const ancien of remplaces) {
    if (!ancien.file_path) continue;
    try {
      await rm(path.join(DEPOT, ancien.file_path), { force: true });
    } catch (e) {
      journal.warn({ err: e, fichier: ancien.file_path }, "Ancien document non supprimé");
    }
  }

  return {
    produits: produits.map((d) => ({ id: d.id, titre: d.name })),
    conserves: conserves.map((d) => ({ id: d.id, titre: d.name })),
  };
}
