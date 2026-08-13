import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { fichierLisible, estActeProduit } from "@/infrastructure/db/depots/fichiers";
import { convertirEnPdf, ConversionImpossible } from "@/infrastructure/documents/conversion";
import { journal } from "@/lib/journal";
import { route } from "@/lib/reponses";

/**
 * Sert un fichier déposé, uniquement à quelqu'un qui a le droit de le lire.
 *
 * Les actes que la plateforme produit sortent en PDF. La page d'origine ne livrait
 * rien d'autre : downloadDoc() comme previewDoc() appelaient /api/generate-pdf et
 * nommaient le résultat en .pdf. Le .docx reste stocké parce que la signature s'y
 * appose avant conversion - apposerSignature travaille sur le zip du Word - mais ce
 * n'est pas ce qu'on remet au client.
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

  let livree = extension;

  if (extension === ".docx" && (await estActeProduit(nom))) {
    try {
      contenu = await convertirEnPdf(contenu);
      livree = ".pdf";
    } catch (e) {
      if (!(e instanceof ConversionImpossible)) throw e;
      // LibreOffice indisponible : on remet le Word plutôt que rien. Un acte qu'on
      // ne peut pas ouvrir serait plus gênant qu'un acte au mauvais format, et
      // c'est ce repli que la fenêtre d'aperçu annonce déjà.
      journal.warn({ fichier: nom }, "Acte remis en Word, conversion PDF indisponible");
    }
  }

  // Le bouton « Télécharger » veut un téléchargement, pas un onglet : un PDF est
  // affichable, donc sans cette demande explicite le navigateur l'ouvrirait.
  const enPieceJointe =
    adresse.searchParams.get("telecharger") === "1" || !AFFICHABLES.includes(livree);

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      "Content-Type": TYPES[livree] ?? "application/octet-stream",
      "Content-Disposition":
        (enPieceJointe ? "attachment" : "inline") +
        '; filename="' +
        // Sans titre, le nom de stockage sert de secours - avec l'extension
        // réellement livrée, sinon un PDF s'appellerait « .docx ».
        nomProposé(
          adresse.searchParams.get("titre"),
          path.basename(nom, extension) + livree,
          livree
        ) +
        '"',
      "Cache-Control": "private, no-store",
    },
  });
});
