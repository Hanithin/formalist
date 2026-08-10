import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { exigerDossier } from "@/infrastructure/db/depots/dossiers";
import { convertirEnPdf, ConversionImpossible } from "@/infrastructure/documents/conversion";
import { apposerSignature } from "@/infrastructure/documents/generation";
import { validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Document signé.
 *
 * Reprend le document Word du dossier, y appose les signatures recueillies, et
 * rend un PDF. L'injection est faite par docx.cjs, repris du serveur d'origine :
 * elle place l'image près du nom du signataire, avec des ajustements accumulés
 * sur des documents réels.
 */
const DEPOT = path.join(process.cwd(), "..", "uploads");

const SCHEMA = z.object({ dossier: schemas.identifiant, document: schemas.identifiant });

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier, document } = validerParametres(SCHEMA, new URL(requete.url));

  await exigerDossier(utilisateur, dossier);

  const piece = await prisma.documents.findUnique({ where: { id: document } });
  if (!piece || piece.formalite_id !== dossier || !piece.file_path) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  const signatures = await prisma.signature_requests.findMany({
    where: { formalite_id: dossier, signed_at: { not: null } },
    orderBy: { associe_index: "asc" },
  });

  if (signatures.length === 0) {
    return NextResponse.json({ error: "Aucune signature recueillie" }, { status: 400 });
  }

  let contenu: Buffer;
  try {
    contenu = await readFile(path.join(DEPOT, path.basename(piece.file_path)));
  } catch {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  signatures.forEach((s, index) => {
    if (s.signature_data) {
      contenu = apposerSignature(contenu, s.signature_data, s.associe_name, index);
    }
  });

  try {
    const pdf = await convertirEnPdf(contenu);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="document-signe.pdf"',
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
