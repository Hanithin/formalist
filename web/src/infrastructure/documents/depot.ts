import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/infrastructure/db/client";
import { exigerDossierModifiable, lireDossier } from "@/infrastructure/db/depots/dossiers";
import { verifierDepot, nomDeStockage } from "@/lib/fichiers";
import { convertirEnPdf, ConversionImpossible } from "./conversion";
import { A_RELIRE } from "@/domain/document/publication";
import {
  TITRE_STATUTS_EN_VIGUEUR,
  TITRE_STATUTS_A_JOUR,
} from "@/domain/modification/formalites";
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

  /*
   * Redéposer une pièce la remplace, au lieu de l'empiler.
   *
   * Rien n'écartait le dépôt précédent : un client qui s'était trompé de fichier, ou
   * qui répondait à un refus, laissait deux « Justificatif de jouissance du nouveau
   * local » côte à côte. L'avocat devait alors deviner lequel faisait foi, et statuer
   * deux fois sur la même pièce.
   *
   * Une pièce déjà vérifiée ou signée n'est pas touchée : elle est figée, comme les
   * actes que remplacerDocumentsProduits conserve. Le nouveau dépôt s'ajoute à côté, et
   * c'est à l'avocat de trancher - nous ne détruisons pas une pièce qu'il a validée.
   */
  const remplaces = await prisma.documents.findMany({
    where: {
      formalite_id: dossier.id,
      type: piece.identifiant,
      status: "uploaded",
    },
  });

  if (remplaces.length > 0) {
    await prisma.documents.deleteMany({
      where: { id: { in: remplaces.map((d) => d.id) } },
    });

    for (const ancien of remplaces) {
      if (!ancien.file_path) continue;
      try {
        await rm(path.join(DEPOT, ancien.file_path), { force: true });
      } catch (e) {
        // Un fichier qui résiste ne doit pas faire échouer un dépôt réussi.
        journal.warn({ err: e, fichier: ancien.file_path }, "Pièce remplacée non supprimée");
      }
    }
  }

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
  actes: { titre: string; contenu: Buffer }[],
  options: { aRelire?: boolean; par?: number } = {}
) {
  const existants = await prisma.documents.findMany({
    where: { formalite_id: dossierId, uploaded_by: "system" },
  });

  /*
   * Un acte relu ou signé ne se régénère pas : il est figé.
   *
   * Les autres - projets en attente de relecture, ou déjà mis à disposition - se
   * remplacent quand on reproduit le jeu.
   */
  const remplacables = new Set([A_RELIRE, "generated"]);

  /*
   * Les statuts ne sont pas des actes du jeu : ils y échappent.
   *
   * Ils sont enregistrés comme documents du dossier - la retouche relit les statuts en
   * vigueur page par page, et y écrit les statuts à jour - avec le même déposant que
   * les actes. Le balayage les emportait donc en régénérant le procès-verbal : le
   * fichier repris au registre disparaissait, et l'étape des retouches n'avait plus
   * rien à ouvrir.
   */
  const horsDuJeu = new Set([TITRE_STATUTS_EN_VIGUEUR, TITRE_STATUTS_A_JOUR]);
  const duJeu = existants.filter((d) => !horsDuJeu.has(d.name));

  const conserves = duJeu.filter((d) => !remplacables.has(d.status));
  const figes = new Set(conserves.map((d) => d.name));
  const remplaces = duJeu.filter((d) => remplacables.has(d.status));

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
      /*
       * Ce qui est remplacé est archivé, non effacé.
       *
       * Reproduire un acte le détruisait : la ligne partait, le fichier avec, et
       * l'avocat qui corrigeait une coquille perdait la version d'origine sans pouvoir
       * y revenir.
       */
      await tx.document_versions.createMany({
        data: remplaces.map((d) => ({
          formalite_id: dossierId,
          name: d.name,
          file_path: d.file_path,
          source_path: d.source_path,
          produite_le: d.created_at,
          archivee_par: options.par ?? null,
        })),
      });
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
            /*
             * Un projet quand c'est le cabinet qui produit, un document quand c'est le
             * client.
             *
             * Sur une modification, l'acte sortait du gabarit et se retrouvait aussitôt
             * dans la bibliothèque du client, qui pouvait le signer ou l'envoyer à sa
             * banque avant que l'avocat l'ait lu. Sur une création en revanche, c'est le
             * client lui-même qui produit ses actes - les retenir n'aurait aucun sens,
             * il n'y a personne d'autre pour les relire.
             */
            status: options.aRelire ? A_RELIRE : "generated",
          },
        })
      );
    }
    return lignes;
  });

  /*
   * Les fichiers du jeu précédent restent sur le disque.
   *
   * Ils étaient effacés avec la ligne : la version d'origine était perdue, et « revenir
   * dessus » n'aurait rien eu à ouvrir. Ils appartiennent désormais aux versions
   * archivées, et ne partent qu'avec le dossier.
   */

  return {
    produits: produits.map((d) => ({ id: d.id, titre: d.name })),
    conserves: conserves.map((d) => ({ id: d.id, titre: d.name })),
  };
}

/**
 * L'avocat remplace un projet d'acte par sa version corrigée.
 *
 * Le cabinet produit le procès-verbal en Word puis le fige en PDF ; l'avocat n'avait
 * accès qu'au PDF, qu'on ne corrige pas. Il télécharge donc le Word, le reprend dans
 * son traitement de texte, et redépose le fichier ici : le PDF remis au client est
 * refait à partir de sa version, et le Word corrigé devient la nouvelle source.
 *
 * Seul un projet encore en relecture se remplace. Un acte relu, signé ou déposé est
 * figé - le remplacer en silence détruirait une signature, ou changerait un document
 * que le greffe a déjà reçu.
 */
export async function remplacerLeProjetDActe(
  utilisateur: UtilisateurConnecte,
  documentId: number,
  fichier: File
) {
  const document = await prisma.documents.findUnique({ where: { id: documentId } });
  if (!document) throw new ActeIntrouvable();

  await exigerDossierModifiable(utilisateur, document.formalite_id);

  if (document.uploaded_by !== "system" || document.status !== A_RELIRE) {
    throw new ActeFige();
  }

  const contenu = new Uint8Array(await fichier.arrayBuffer());
  verifierDepot(fichier.name, contenu, [".docx", ".pdf"]);

  await mkdir(DEPOT, { recursive: true });
  const extension = path.extname(fichier.name).toLowerCase();

  /*
   * Un Word est refait en PDF ; un PDF est pris tel quel.
   *
   * Sans conversion, le client recevrait un .docx là où tout le reste du dossier est
   * en PDF - et l'aperçu de sa bibliothèque ne saurait pas l'afficher.
   */
  let livre: string;
  let source: string | null = null;

  if (extension === ".docx") {
    source = nomDeStockage(".docx");
    await writeFile(path.join(DEPOT, source), contenu);

    try {
      const pdf = await convertirEnPdf(Buffer.from(contenu));
      livre = nomDeStockage(".pdf");
      await writeFile(path.join(DEPOT, livre), pdf);
    } catch (e) {
      if (!(e instanceof ConversionImpossible)) throw e;
      // LibreOffice indisponible : mieux vaut le Word au dossier qu'un remplacement
      // refusé, la remise le convertira à la demande.
      journal.warn({ acte: document.name }, "Acte remplacé en Word, conversion PDF indisponible");
      livre = source;
      source = null;
    }
  } else {
    livre = nomDeStockage(".pdf");
    await writeFile(path.join(DEPOT, livre), contenu);
  }

  const misAJour = await prisma.documents.update({
    where: { id: documentId },
    data: { file_path: livre, source_path: source, rejection_reason: null, rejected_at: null },
  });

  // Les fichiers d'avant, une fois la base à jour : une ligne qui désigne un fichier
  // absent casse l'aperçu, un fichier sans ligne n'est qu'un octet perdu.
  for (const ancien of [document.file_path, document.source_path]) {
    if (!ancien || ancien === livre || ancien === source) continue;
    try {
      await rm(path.join(DEPOT, ancien), { force: true });
    } catch (e) {
      journal.warn({ err: e, fichier: ancien }, "Version remplacée non supprimée");
    }
  }

  await prisma.audit_log.create({
    data: {
      formalite_id: document.formalite_id,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: "acte_corrige",
      before_value: document.file_path,
      after_value: livre,
    },
  });

  return { id: misAJour.id, titre: misAJour.name, fichier: livre };
}

export class ActeIntrouvable extends Error {
  readonly statut = 404;
  constructor() {
    super("Cet acte n'existe pas");
    this.name = "ActeIntrouvable";
  }
}

export class ActeFige extends Error {
  readonly statut = 400;
  constructor() {
    super("Cet acte n'est plus un projet : il ne se remplace pas");
    this.name = "ActeFige";
  }
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
export async function deposerPdfProduit(
  dossierId: number,
  titre: string,
  pdf: Buffer,
  options: {
    /**
     * Le document attend la relecture de l'avocat.
     *
     * Les statuts à jour sortent de la retouche : ils ne sont pas remis au client
     * avant que l'avocat les ait relus, comme le procès-verbal. Sans cela, un document
     * que le cabinet doit encore corriger se téléchargeait aussitôt.
     */
    aRelire?: boolean;
    /**
     * La date du document, quand ce n'est pas celle de son enregistrement.
     *
     * Les statuts repris au registre datent de leur dépôt - deux mille vingt-deux, par
     * exemple - et non du jour où nous sommes allés les chercher. « Généré le 24 août
     * 2026 » leur donnait notre date et notre paternité.
     */
    date?: Date | null;
    /** Qui provoque le remplacement : la version archivée en garde la trace. */
    par?: number;
  } = {}
) {
  await mkdir(DEPOT, { recursive: true });

  const nom = nomDeStockage(".pdf");
  await writeFile(path.join(DEPOT, nom), pdf);

  const anciens = await prisma.documents.findMany({
    where: { formalite_id: dossierId, name: titre, uploaded_by: "system" },
  });

  const document = await prisma.$transaction(async (tx) => {
    if (anciens.length > 0) {
      /* Ce qui est remplacé est archivé : la version d'origine reste atteignable. */
      await tx.document_versions.createMany({
        data: anciens.map((d) => ({
          formalite_id: dossierId,
          name: d.name,
          file_path: d.file_path,
          source_path: d.source_path,
          produite_le: d.created_at,
          archivee_par: options.par ?? null,
        })),
      });
      await tx.documents.deleteMany({ where: { id: { in: anciens.map((d) => d.id) } } });
    }
    return tx.documents.create({
      data: {
        formalite_id: dossierId,
        name: titre,
        type: "pdf",
        file_path: nom,
        uploaded_by: "system",
        status: options.aRelire ? A_RELIRE : "generated",
        ...(options.date ? { created_at: options.date } : {}),
      },
    });
  });

  /* Les fichiers restent : ils appartiennent désormais aux versions archivées. */

  return { id: document.id, titre: document.name };
}

/**
 * Efface des pièces du disque, sans toucher à la base.
 *
 * La suppression d'un brouillon retire d'abord ses lignes, en une transaction, puis
 * appelle ceci : le disque est le seul endroit d'où l'on ne peut pas revenir en
 * arrière, et il passe donc en dernier. Un fichier qui résiste est inscrit au journal
 * plutôt que remonté - le dossier a déjà disparu de la base, échouer ici laisserait
 * l'appelant croire que rien n'a été fait.
 *
 * Les noms viennent du registre, jamais d'une saisie : `path.basename` écarte malgré
 * tout un « ../ » qui s'y serait glissé, car ce module écrit et efface dans un dossier
 * qui contient les pièces de tous les clients.
 */
export async function effacerPieces(noms: (string | null)[]): Promise<void> {
  for (const nom of noms) {
    const propre = nom ? path.basename(nom.trim()) : "";
    if (!propre || propre === "." || propre === "..") continue;
    try {
      await rm(path.join(DEPOT, propre), { force: true });
    } catch (e) {
      journal.warn({ err: e, fichier: propre }, "Pièce non effacée");
    }
  }
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
