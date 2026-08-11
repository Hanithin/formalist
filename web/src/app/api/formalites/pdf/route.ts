import { z } from "zod";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { fichierLisible } from "@/infrastructure/db/depots/fichiers";
import { convertirEnPdf, ConversionImpossible } from "@/infrastructure/documents/conversion";
import { validerParametres } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Conversion d'un document déposé en PDF, à la demande.
 *
 * Le contrôle d'accès est celui du fichier : on ne convertit que ce qu'on a le
 * droit de lire. Sans quoi la conversion deviendrait un moyen détourné de lire
 * les documents des autres.
 */
const DEPOT = path.join(process.cwd(), "..", "uploads");

const SCHEMA = z.object({ nom: z.string().min(1).max(200) });

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { nom } = validerParametres(SCHEMA, new URL(requete.url));

  const autorise = await fichierLisible(utilisateur, nom);
  if (!autorise) {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }

  if (path.extname(autorise).toLowerCase() !== ".docx") {
    return NextResponse.json(
      { error: "Seuls les documents Word se convertissent en PDF" },
      { status: 400 }
    );
  }

  let docx: Buffer;
  try {
    docx = await readFile(path.join(DEPOT, autorise));
  } catch {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }

  try {
    // La conversion cache sur l'empreinte du contenu : rouvrir un aperçu ne
    // relance pas LibreOffice.
    const pdf = await convertirEnPdf(docx);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="' + autorise.replace(/\.docx$/i, ".pdf") + '"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ConversionImpossible) {
      return NextResponse.json({ error: e.message }, { status: e.statut });
    }
    throw e;
  }
});
