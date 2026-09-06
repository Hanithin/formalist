import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import PizZip from "pizzip";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { fichierLisible } from "@/infrastructure/db/depots/fichiers";
import { convertirEnPdf, ConversionImpossible } from "@/infrastructure/documents/conversion";
import { journal } from "@/lib/journal";
import { route } from "@/lib/reponses";

/**
 * Tous les documents d'un dossier, en une archive.
 *
 * Cinq actes, cinq clics, cinq fichiers à retrouver dans le dossier de
 * téléchargements : c'est le geste qu'on fait le jour où l'on porte le dossier à sa
 * banque, ou qu'on l'envoie à son comptable. Un bouton, un fichier.
 *
 * Le dossier de dépôt reste celui du serveur d'origine tant que les deux cohabitent.
 */
const DEPOT = path.join(process.cwd(), "..", "uploads");

/**
 * Le nom d'un fichier dans l'archive.
 *
 * Le dépôt nomme par une empreinte, pour qu'un nom ne renseigne pas sur son contenu.
 * Dans l'archive, c'est le titre du document qui sert - sans quoi l'on ouvrirait cinq
 * empreintes indistinguables.
 */
function nomPropre(titre: string, extension: string): string {
  const propre = (titre || "")
    .replace(/[^a-zA-Z0-9À-ɏ \-']/g, "")
    .trim()
    .slice(0, 120);
  return (propre || "Document") + extension;
}

/** Deux actes de même titre ne s'écrasent pas dans l'archive. */
function sansDoublon(nom: string, pris: Set<string>): string {
  if (!pris.has(nom)) return nom;

  const extension = path.extname(nom);
  const base = nom.slice(0, nom.length - extension.length);
  let rang = 2;
  while (pris.has(base + " (" + rang + ")" + extension)) rang += 1;
  return base + " (" + rang + ")" + extension;
}

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const dossierId = Number(new URL(requete.url).searchParams.get("dossier"));
  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }

  const dossier = await prisma.formalites.findUnique({
    where: { id: dossierId },
    select: { societe: true },
  });

  /*
   * Les actes produits, dans l'ordre où le dossier les a écrits.
   *
   * On ne demande pas ici qui a le droit de les lire : `fichierLisible` le tranche
   * fichier par fichier, avec la règle déjà éprouvée - un acte en relecture n'est pas
   * remis au client, même s'il en connaît le nom. Un dossier qu'on ne peut pas lire
   * rend donc une archive vide, et l'archive vide se refuse.
   */
  const documents = await prisma.documents.findMany({
    where: { formalite_id: dossierId, uploaded_by: "system" },
    orderBy: { created_at: "asc" },
    select: { name: true, file_path: true },
  });

  const zip = new PizZip();
  const pris = new Set<string>();

  for (const document of documents) {
    if (!document.file_path) continue;

    const nom = await fichierLisible(utilisateur, document.file_path);
    if (!nom) continue;

    let contenu: Buffer;
    try {
      contenu = await readFile(path.join(DEPOT, nom));
    } catch {
      /* Une ligne qui désigne un fichier absent ne fait pas échouer l'archive entière. */
      journal.warn({ dossier: dossierId, document: document.name }, "Fichier absent du dépôt");
      continue;
    }

    let extension = path.extname(nom).toLowerCase();
    if (extension === ".docx") {
      /*
       * L'archive est en PDF, comme le reste de ce qu'on remet.
       *
       * Un acte n'est stocké en Word que si LibreOffice manquait au moment de le
       * produire : on rattrape ici, et l'on remet le Word plutôt que rien si la
       * conversion échoue encore.
       */
      try {
        contenu = await convertirEnPdf(contenu);
        extension = ".pdf";
      } catch (e) {
        if (!(e instanceof ConversionImpossible)) throw e;
        journal.warn({ document: document.name }, "Acte laissé en Word dans l'archive");
      }
    }

    const dansLArchive = sansDoublon(nomPropre(document.name, extension), pris);
    pris.add(dansLArchive);
    zip.file(dansLArchive, contenu);
  }

  if (pris.size === 0) {
    /* Ni « vide » ni « refusé » : la réponse ne dit pas ce que le dossier contient. */
    return NextResponse.json({ error: "Aucun document à télécharger" }, { status: 404 });
  }

  const archive = zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  const nomDeLArchive = nomPropre((dossier?.societe || "Dossier") + " - documents", ".zip");

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition":
        'attachment; filename="' +
        nomDeLArchive.replace(/"/g, "") +
        '"; filename*=UTF-8\'\'' +
        encodeURIComponent(nomDeLArchive),
      /* Une archive se recompose à chaque demande : un acte corrigé doit y figurer. */
      "Cache-Control": "no-store",
    },
  });
});
