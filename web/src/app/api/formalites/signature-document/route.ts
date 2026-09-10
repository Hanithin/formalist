import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { exigerDossier } from "@/infrastructure/db/depots/dossiers";
import { visibleParLeClient } from "@/domain/document/publication";
import { ConversionImpossible } from "@/infrastructure/documents/conversion";
import { acteSigneEnPdf, signaturesDuDossier } from "@/infrastructure/documents/acte-signe";
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

  /*
   * Un acte que l'avocat n'a pas relu ne sort pas d'ici non plus.
   *
   * Le contrôle s'arrêtait au dossier : un client qui a accès au sien pouvait donc
   * demander n'importe lequel de ses documents par son identifiant - et ces
   * identifiants se suivent. Ce point d'entrée rendait ainsi la version signée d'un
   * projet encore en relecture, que la bibliothèque et le dossier prennent tous deux
   * soin de retenir. La règle de publication est la même partout.
   *
   * Même réponse que pour un document inexistant : elle ne doit pas apprendre qu'il
   * existe.
   */
  const duCabinet = utilisateur.roles.includes("avocat") || utilisateur.roles.includes("admin");
  if (!duCabinet && !visibleParLeClient(piece)) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  const signatures = await signaturesDuDossier(dossier);

  if (signatures.length === 0) {
    return NextResponse.json({ error: "Aucune signature recueillie" }, { status: 400 });
  }

  // La signature s'appose sur le Word : elle se place près du nom de son signataire, ce
  // que seul le document sait. Un acte est livré en PDF et garde son Word en source ;
  // les actes produits avant ce changement n'ont que leur .docx dans file_path.
  const aSigner = piece.source_path ?? piece.file_path;
  if (path.extname(aSigner).toLowerCase() !== ".docx") {
    return NextResponse.json({ error: "Ce document n'a pas de version signable" }, { status: 400 });
  }

  let contenu: Buffer;
  try {
    contenu = await readFile(path.join(DEPOT, path.basename(aSigner)));
  } catch {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  try {
    /* La composition vit dans `acte-signe` : cette route et « Télécharger » doivent
       servir exactement le même document, et deux copies finiraient par diverger. */
    const signe = await acteSigneEnPdf(dossier, contenu);

    return new NextResponse(new Uint8Array(signe), {
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
