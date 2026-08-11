import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { fichierLisible } from "@/infrastructure/db/depots/fichiers";
import { route } from "@/lib/reponses";

/**
 * Sert un fichier déposé, uniquement à quelqu'un qui a le droit de le lire.
 *
 * Le dossier de dépôt reste celui du serveur d'origine tant que les deux
 * cohabitent. Il passera au stockage objet avec le reste de l'infrastructure.
 */
const DEPOT = path.join(process.cwd(), "..", "uploads");

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Seuls les PDF et images s'affichent dans l'onglet : le reste part en téléchargement. */
const AFFICHABLES = [".pdf", ".png", ".jpg", ".jpeg"];

/**
 * Le nom sous lequel le fichier est proposé.
 *
 * Le dépôt nomme les fichiers par une empreinte, pour qu'un nom ne renseigne pas
 * sur son contenu. Mais cinq actes téléchargés qui s'appellent tous par leur
 * empreinte sont indistinguables : le titre du document est donc accepté en
 * paramètre, et nettoyé - lettres, chiffres, espaces, tirets et apostrophes, comme
 * le faisait la page d'origine.
 */
function nomProposé(titre: string | null, defaut: string, extension: string): string {
  const propre = (titre ?? "")
    .replace(/[^a-zA-Z0-9\u00C0-\u024F \-']/g, "")
    .trim()
    .slice(0, 120);
  return propre ? propre + extension : defaut;
}

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const adresse = new URL(requete.url);
  const demande = adresse.searchParams.get("nom") ?? "";

  const nom = await fichierLisible(utilisateur, demande);
  if (!nom) {
    // Même réponse que pour un fichier inexistant : voir fichiers.ts.
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }

  const extension = path.extname(nom).toLowerCase();
  let contenu: Buffer;
  try {
    contenu = await readFile(path.join(DEPOT, nom));
  } catch {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": TYPES[extension] ?? "application/octet-stream",
      "Content-Disposition":
        (AFFICHABLES.includes(extension) ? "inline" : "attachment") +
        '; filename="' +
        nomProposé(adresse.searchParams.get("titre"), nom, extension) +
        '"',
      "Cache-Control": "private, no-store",
    },
  });
});
