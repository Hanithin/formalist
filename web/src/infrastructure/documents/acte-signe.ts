import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/infrastructure/db/client";
import { acteProduit } from "@/infrastructure/db/depots/fichiers";
import { apposerSignature } from "./generation";
import { apposerLesParaphes } from "./paraphes";
import { convertirEnPdf, ConversionImpossible } from "./conversion";
import { journal } from "@/lib/journal";

/** Le dossier de dépôt, celui du serveur d'origine tant que les deux cohabitent. */
const DEPOT = path.join(process.cwd(), "..", "uploads");

/**
 * Un acte tel qu'il se remet une fois signé.
 *
 * Les signatures étaient recueillies, enregistrées, et n'allaient nulle part : la route
 * qui les apposait n'était appelée d'aucun écran, et « Télécharger » servait la version
 * vierge. Le client signait, ses associés signaient, et le document qu'il obtenait ne
 * portait rien.
 *
 * L'apposition se fait à la demande plutôt qu'une fois pour toutes. Écrire la version
 * signée sur le disque au moment où la dernière signature arrive paraît plus simple,
 * mais elle se périme : une signature reprise, un acte reproduit après une correction, et
 * le fichier stocké ment sans que rien ne le dise. Ici, ce qui sort est toujours composé
 * de ce que la base porte à l'instant.
 */

/**
 * Les signatures d'un dossier, une par personne, la plus récente.
 *
 * Relancer le circuit n'efface que les demandes non signées : celles qui l'ont été
 * restent, et c'est voulu - on ne détruit pas la trace d'une signature recueillie. Mais
 * un acte n'a pas à porter deux fois la même personne.
 */
export async function signaturesDuDossier(dossierId: number) {
  const recueillies = await prisma.signature_requests.findMany({
    where: { formalite_id: dossierId, signed_at: { not: null } },
    orderBy: [{ associe_index: "asc" }, { signed_at: "asc" }],
  });

  const parSignataire = new Map<number, (typeof recueillies)[number]>();
  for (const s of recueillies) parSignataire.set(s.associe_index, s);
  return [...parSignataire.values()];
}

/** Ce dossier a-t-il des signatures ? Un comptage, pour ne recomposer que s'il le faut. */
export async function aDesSignatures(dossierId: number): Promise<boolean> {
  const compte = await prisma.signature_requests.count({
    where: { formalite_id: dossierId, signed_at: { not: null } },
  });
  return compte > 0;
}

/**
 * Compose le PDF d'un acte : signatures dans le Word, paraphes sur les pages.
 *
 * L'ordre n'est pas indifférent. La signature s'appose sur le zip du Word, avant la
 * conversion, parce qu'elle se place près du nom de son signataire - ce que seul le
 * document sait. Le paraphe se pose après, parce qu'un document Word n'a pas de pages :
 * sa pagination est décidée par le logiciel qui l'ouvre, et « en bas de chaque page » ne
 * veut rien dire avant le PDF.
 *
 * Les paraphes suivent les signatures document par document : un acte que ces personnes
 * ne signent pas - une attestation que le cabinet signe seul - n'a pas d'emplacement à
 * leur nom, et n'a donc pas à porter leurs initiales.
 */
export async function acteSigneEnPdf(dossierId: number, docx: Buffer): Promise<Buffer> {
  const signatures = await signaturesDuDossier(dossierId);

  let contenu = docx;
  const paraphes: string[] = [];

  signatures.forEach((s, rang) => {
    if (!s.signature_data) return;
    const resultat = apposerSignature(contenu, s.signature_data, s.associe_name, rang);
    contenu = resultat.docx;
    if (resultat.apposee && s.paraphe_data) paraphes.push(s.paraphe_data);
  });

  const pdf = await convertirEnPdf(contenu);
  return apposerLesParaphes(pdf, paraphes);
}

/**
 * L'acte signé à remettre sous ce nom de fichier, ou null s'il n'y a rien à recomposer.
 *
 * C'est le point de passage unique des écrans qui remettent un acte. Ils étaient quatre
 * à lire le dépôt chacun de son côté - l'aperçu, le téléchargement, l'archive d'un
 * dossier, celle d'une société - et la signature n'était apposée par aucun. Une règle
 * qui doit tenir à quatre endroits ne tient nulle part : elle est ici, et chacun
 * l'appelle avant de servir ce qu'il a lu.
 *
 * Rend null plutôt que d'échouer quand la recomposition n'aboutit pas : le fichier
 * stocké reste servi, ce qui vaut mieux qu'un acte introuvable le jour où LibreOffice
 * manque. La trace dit lequel est parti sans ses signatures.
 */
export async function acteSigneAServir(nomFichier: string): Promise<Buffer | null> {
  const acte = await acteProduit(nomFichier);
  /*
   * La recomposition part du Word, jamais du PDF stocké : une signature se place près
   * du nom de son signataire, ce que seul le document sait et qu'un PDF ne sait plus.
   */
  if (!acte?.source) return null;
  if (!(await aDesSignatures(acte.dossierId))) return null;

  try {
    const source = await readFile(path.join(DEPOT, path.basename(acte.source)));
    return await acteSigneEnPdf(acte.dossierId, source);
  } catch (e) {
    if (!(e instanceof ConversionImpossible) && (e as NodeJS.ErrnoException).code !== "ENOENT") {
      throw e;
    }
    journal.warn({ fichier: nomFichier }, "Acte remis sans ses signatures");
    return null;
  }
}
