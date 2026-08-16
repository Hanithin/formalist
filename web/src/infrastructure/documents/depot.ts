import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/infrastructure/db/client";
import { exigerDossierModifiable, lireDossier } from "@/infrastructure/db/depots/dossiers";
import { verifierDepot, nomDeStockage } from "@/lib/fichiers";
import { convertirEnPdf, ConversionImpossible } from "./conversion";
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
 * Écrit une pièce jointe de message et rend son nom de stockage.
 *
 * Elle n'entre pas dans les documents du dossier : une pièce envoyée dans une
 * conversation appartient à son message, et la faire apparaître dans les pièces à
 * vérifier par l'avocat mêlerait un échange à une formalité. Le contrôle d'accès
 * passe par le message lui-même - voir fichierLisible.
 *
 * Le contenu est vérifié comme tout dépôt : extension attendue, taille, et signature
 * réelle du fichier. Un .pdf qui contient du HTML est refusé.
 */
export async function ecrirePieceJointe(fichier: File, formatsAcceptes?: string[]) {
  const contenu = new Uint8Array(await fichier.arrayBuffer());
  verifierDepot(fichier.name, contenu, formatsAcceptes);

  const nom = nomDeStockage(path.extname(fichier.name).toLowerCase());
  await mkdir(DEPOT, { recursive: true });
  await writeFile(path.join(DEPOT, nom), contenu);

  return nom;
}

/**
 * Écrit une pièce joignée à une consultation et rend de quoi l'afficher.
 *
 * Elle est déposée pendant l'assistant, donc avant que la consultation existe : sans
 * inscription au registre, le fichier n'aurait aucun propriétaire et le client ne
 * pourrait pas relire ce qu'il vient de joindre. L'inscription lui en donne un tout
 * de suite ; l'avocat y accède ensuite par la consultation - voir fichierLisible.
 *
 * Aucun dossier n'est rattaché : une consultation n'est pas une formalité, et la
 * pièce n'a pas à apparaître dans les documents d'un dossier.
 */
export async function deposerPieceDeConsultation(
  utilisateur: UtilisateurConnecte,
  fichier: File
): Promise<{ fichier: string; nom: string }> {
  const nom = await ecrirePieceJointe(fichier);

  await prisma.uploaded_files.create({
    data: { filename: nom, user_id: utilisateur.id, original_name: fichier.name },
  });

  return { fichier: nom, nom: fichier.name };
}

/**
 * Dépôt libre d'un document par le client, dans son coffre.
 *
 * Il se distingue de deposerPiece : celui-ci répond à une pièce attendue sur un
 * dossier, avec un identifiant tiré de la liste des pièces exigées. Ici, le client
 * range ce qu'il veut - un bail, une facture, un ancien Kbis - sans que la plateforme
 * ait à le prévoir.
 *
 * Le rattachement à une société est facultatif et vérifié : le dossier doit lui être
 * accessible, sinon le document rejoint ses dépôts personnels plutôt que d'afficher
 * le nom d'une société qui n'est pas la sienne.
 */
export async function deposerAuCoffre(
  utilisateur: UtilisateurConnecte,
  fichier: File,
  nom: string,
  dossierId: number | null
) {
  let rattachement: number | null = null;
  if (dossierId !== null) {
    const dossier = await lireDossier(utilisateur, dossierId);
    rattachement = dossier?.id ?? null;
  }

  const stocke = await ecrirePieceJointe(fichier);

  // Registre d'abord : un fichier sur le disque sans propriétaire connu est
  // exactement la situation qu'on veut rendre impossible.
  await prisma.uploaded_files.create({
    data: { filename: stocke, user_id: utilisateur.id, original_name: fichier.name },
  });

  const ligne = await prisma.user_documents.create({
    data: {
      user_id: utilisateur.id,
      source_type: "upload",
      source_id: rattachement,
      name: nom.trim().slice(0, 200) || fichier.name,
      file_path: stocke,
      status: "actif",
    },
  });

  return { id: ligne.id, nom: ligne.name, fichier: stocke, dossierId: rattachement };
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
 *
 * Chaque acte est figé en PDF ici même : c'est ce fichier qu'on remet, et il ne
 * dépend plus d'une conversion à chaque lecture. Le Word qui l'a produit reste
 * stocké en source, la signature s'y apposant avant conversion.
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
  const ecrits: { titre: string; livre: string; source: string | null }[] = [];
  for (const acte of actes) {
    if (figes.has(acte.titre)) continue;

    const source = nomDeStockage(".docx");
    await writeFile(path.join(DEPOT, source), acte.contenu);

    try {
      const pdf = await convertirEnPdf(acte.contenu);
      const livre = nomDeStockage(".pdf");
      await writeFile(path.join(DEPOT, livre), pdf);
      ecrits.push({ titre: acte.titre, livre, source });
    } catch (e) {
      if (!(e instanceof ConversionImpossible)) throw e;
      // LibreOffice indisponible : l'acte est enregistré en Word plutôt que perdu,
      // et la remise le convertira à la demande. Mieux vaut un dossier complet dans
      // le mauvais format qu'une génération qui échoue entièrement.
      journal.warn({ acte: acte.titre }, "Acte figé en Word, conversion PDF indisponible");
      ecrits.push({ titre: acte.titre, livre: source, source: null });
    }
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
            type: path.extname(ecrit.livre).slice(1),
            file_path: ecrit.livre,
            source_path: ecrit.source,
            uploaded_by: "system",
            status: "generated",
          },
        })
      );
    }
    return lignes;
  });

  // Les fichiers du jeu précédent, une fois la base à jour. Un fichier qui résiste
  // ne doit pas faire échouer une régénération réussie par ailleurs. Le Word source
  // part avec le PDF qu'il a produit : sans son acte, il ne sert plus à rien.
  for (const ancien of remplaces) {
    for (const chemin of [ancien.file_path, ancien.source_path]) {
      if (!chemin) continue;
      try {
        await rm(path.join(DEPOT, chemin), { force: true });
      } catch (e) {
        journal.warn({ err: e, fichier: chemin }, "Ancien document non supprimé");
      }
    }
  }

  return {
    produits: produits.map((d) => ({ id: d.id, titre: d.name })),
    conserves: conserves.map((d) => ({ id: d.id, titre: d.name })),
  };
}

/**
 * Enregistre un PDF déjà constitué comme document du dossier.
 *
 * remplacerDocumentsProduits part d'un Word et le convertit ; ici le PDF existe
 * déjà - il vient du registre national, ou de la retouche des statuts. Le convertir
 * n'aurait aucun sens, et le passer par un gabarit non plus.
 *
 * Un document du même titre est remplacé plutôt que doublé : reprendre la retouche
 * doit corriger les statuts à jour, non en accumuler quatre versions dont le greffe
 * recevrait la mauvaise.
 */
export async function deposerPdfProduit(dossierId: number, titre: string, pdf: Buffer) {
  await mkdir(DEPOT, { recursive: true });

  const nom = nomDeStockage(".pdf");
  await writeFile(path.join(DEPOT, nom), pdf);

  const anciens = await prisma.documents.findMany({
    where: { formalite_id: dossierId, name: titre, uploaded_by: "system" },
  });

  const document = await prisma.$transaction(async (tx) => {
    if (anciens.length > 0) {
      await tx.documents.deleteMany({ where: { id: { in: anciens.map((d) => d.id) } } });
    }
    return tx.documents.create({
      data: {
        formalite_id: dossierId,
        name: titre,
        type: "pdf",
        file_path: nom,
        uploaded_by: "system",
        status: "generated",
      },
    });
  });

  for (const ancien of anciens) {
    if (!ancien.file_path) continue;
    try {
      await rm(path.join(DEPOT, ancien.file_path), { force: true });
    } catch (e) {
      journal.warn({ err: e, fichier: ancien.file_path }, "Ancien document non supprimé");
    }
  }

  return { id: document.id, titre: document.name };
}

/** Le contenu d'un document produit, pour le relire et le retoucher. */
export async function lireDocumentProduit(dossierId: number, titre: string): Promise<Buffer | null> {
  const document = await prisma.documents.findFirst({
    where: { formalite_id: dossierId, name: titre },
    orderBy: { created_at: "desc" },
  });
  if (!document?.file_path) return null;

  const { readFile } = await import("node:fs/promises");
  try {
    return await readFile(path.join(DEPOT, document.file_path));
  } catch (e) {
    journal.error({ err: e, document: document.id }, "Document introuvable sur le disque");
    return null;
  }
}
