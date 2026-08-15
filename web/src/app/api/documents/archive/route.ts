import { readFile } from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { listerDocuments } from "@/infrastructure/db/depots/documents";
import { titreDeSociete, type DocumentRange } from "@/domain/document/bibliotheque";
import { journal } from "@/lib/journal";
import { route } from "@/lib/reponses";

/**
 * Tous les documents d'une société, en une archive.
 *
 * Cinq actes se téléchargent un par un en cinq clics et cinq allers-retours vers le
 * dossier des téléchargements, où ils arrivent sous leur nom de stockage. L'archive
 * les rend d'un coup, nommés, dans un dossier qui porte celui de la société.
 *
 * Le dossier de dépôt reste celui du serveur d'origine tant que les deux cohabitent.
 */
const DEPOT = path.join(process.cwd(), "..", "uploads");

/**
 * Un nom de fichier acceptable partout.
 *
 * Les caractères interdits par Windows - deux-points, barres, guillemets - empêchent
 * l'extraction de toute l'archive, pas seulement du fichier fautif.
 */
function nomAcceptable(nom: string, extension: string): string {
  const propre = nom
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return (propre || "document") + extension;
}

/** Deux actes du même nom ne s'écrasent pas dans l'archive. */
function sansDoublon(pris: Set<string>, nom: string): string {
  if (!pris.has(nom)) {
    pris.add(nom);
    return nom;
  }

  const point = nom.lastIndexOf(".");
  const base = point > 0 ? nom.slice(0, point) : nom;
  const extension = point > 0 ? nom.slice(point) : "";

  let n = 2;
  while (pris.has(base + " (" + n + ")" + extension)) n++;

  const unique = base + " (" + n + ")" + extension;
  pris.add(unique);
  return unique;
}

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const parametres = new URL(requete.url).searchParams;

  const demande = Number(parametres.get("dossier"));
  const dossierId = Number.isInteger(demande) && demande > 0 ? demande : null;

  // La liste est celle que la bibliothèque affiche : les droits sont donc les mêmes,
  // et un identifiant de dossier qui n'est pas le sien ne rend rien.
  const tous = await listerDocuments(utilisateur);
  const retenus = tous.filter(
    (d: DocumentRange) => d.fichier && (dossierId === null || d.societeId === dossierId)
  );

  if (retenus.length === 0) {
    return NextResponse.json({ error: "Aucun document à archiver" }, { status: 404 });
  }

  const zip = new PizZip();
  const pris = new Set<string>();
  let ajoutes = 0;

  for (const document of retenus) {
    try {
      const contenu = await readFile(path.join(DEPOT, path.basename(document.fichier!)));
      const extension = path.extname(document.fichier!).toLowerCase();
      zip.file(sansDoublon(pris, nomAcceptable(document.nom, extension)), contenu);
      ajoutes++;
    } catch {
      // Un fichier manquant sur le disque ne doit pas faire échouer l'archive
      // entière : les autres partent, et la trace dit lequel manquait.
      journal.warn({ document: document.id }, "Document absent du dépôt, écarté de l'archive");
    }
  }

  if (ajoutes === 0) {
    return NextResponse.json({ error: "Aucun document à archiver" }, { status: 404 });
  }

  const societe = retenus.find((d) => d.societeId === dossierId);
  const titre =
    dossierId === null
      ? "Mes documents"
      : titreDeSociete(societe?.societe ?? null, societe?.forme ?? null);

  const archive = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition":
        'attachment; filename="' + nomAcceptable(titre + " - documents", ".zip") + '"',
      "Cache-Control": "private, no-store",
    },
  });
});
