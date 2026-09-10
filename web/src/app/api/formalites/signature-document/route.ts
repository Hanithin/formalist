import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { exigerDossier } from "@/infrastructure/db/depots/dossiers";
import { visibleParLeClient } from "@/domain/document/publication";
import { convertirEnPdf, ConversionImpossible } from "@/infrastructure/documents/conversion";
import { apposerSignature } from "@/infrastructure/documents/generation";
import { apposerLesParaphes } from "@/infrastructure/documents/paraphes";
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

  const recueillies = await prisma.signature_requests.findMany({
    where: { formalite_id: dossier, signed_at: { not: null } },
    orderBy: [{ associe_index: "asc" }, { signed_at: "asc" }],
  });

  /*
   * Une signature par personne, la dernière en date.
   *
   * Relancer le circuit n'efface que les demandes non signées : celles qui l'ont été
   * restent, et c'est voulu - on ne détruit pas la trace d'une signature recueillie.
   * Mais le document, lui, n'a pas à porter deux fois la même personne : un acte
   * relancé après une première signature sortait avec le paraphe de son signataire
   * apposé deux fois au bas de chaque page.
   *
   * La plus récente l'emporte : c'est celle qui porte sur la version qu'on lit.
   */
  const parSignataire = new Map<number, (typeof recueillies)[number]>();
  for (const s of recueillies) parSignataire.set(s.associe_index, s);
  const signatures = [...parSignataire.values()];

  if (signatures.length === 0) {
    return NextResponse.json({ error: "Aucune signature recueillie" }, { status: 400 });
  }

  // La signature s'appose sur le Word : apposerSignature travaille sur le zip du
  // document. Un acte est livré en PDF et garde son Word en source ; les actes
  // produits avant ce changement n'ont que leur .docx dans file_path.
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

  /*
   * Le paraphe suit la signature, document par document.
   *
   * Tous les paraphes descendaient au bas de chaque page de n'importe quel document
   * demandé. Or un acte ne porte que les signatures qu'il appelle : une attestation
   * de domiciliation que le cabinet signe seul n'a pas d'emplacement pour les associés,
   * et n'a donc pas à porter leurs initiales. On ne retient que ceux dont la signature
   * a effectivement trouvé sa place.
   */
  const paraphesAApposer: string[] = [];

  signatures.forEach((s, index) => {
    if (!s.signature_data) return;
    const resultat = apposerSignature(contenu, s.signature_data, s.associe_name, index);
    contenu = resultat.docx;
    if (resultat.apposee && s.paraphe_data) paraphesAApposer.push(s.paraphe_data);
  });

  try {
    const pdf = await convertirEnPdf(contenu);

    /*
     * Les paraphes s'apposent sur le PDF, non sur le Word.
     *
     * Un document Word n'a pas de pages : sa pagination est décidée par le logiciel qui
     * l'ouvre. « En bas de chaque page » ne veut donc rien dire avant la conversion.
     */
    const paraphes = await apposerLesParaphes(pdf, paraphesAApposer);

    return new NextResponse(new Uint8Array(paraphes), {
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
