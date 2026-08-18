import { createRequire } from "node:module";
import { typographier } from "@/domain/document/typographie";

/* Comme pour la renumérotation : pizzip est un module CommonJS. */
const requerir = createRequire(import.meta.url);

/**
 * La typographie appliquée au document rendu.
 *
 * Une partie des règles ne peut pas s'appliquer au gabarit : « {{PRIX_CESSION}} euros »
 * n'a pas de chiffre avant l'unité, et c'est seulement une fois la valeur substituée
 * qu'on sait qu'il faut lier « 2 000 » à « euros ». Sans cette passe, un montant se
 * coupe en fin de ligne et un acte signé porte « 2 000 » d'un côté, « euros » de
 * l'autre.
 *
 * Seul le texte est touché, jamais le balisage : on ne transforme que le contenu des
 * nœuds w:t, ce qui laisse intactes les propriétés de style et les références.
 */
export function typographierLeDocument(docx: Buffer): Buffer {
  const PizZip = requerir("pizzip") as typeof import("pizzip");
  const archive = new PizZip(docx);
  const fichier = archive.file("word/document.xml");
  if (!fichier) return docx;

  const xml = fichier.asText();
  const rendu = xml.replace(
    /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
    (_tout, ouverture: string, contenu: string, fermeture: string) =>
      ouverture + echapper(typographier(desechapper(contenu))) + fermeture
  );

  archive.file("word/document.xml", rendu);
  return archive.generate({ type: "nodebuffer" });
}

/*
 * Le texte d'un nœud est échappé : « L'associé &amp; le gérant ». Les règles portent sur
 * le texte lu, non sur son échappement - sans quoi « &amp;quot; » recevrait une espace
 * fine au milieu de son entité.
 */
function desechapper(texte: string): string {
  return texte
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
