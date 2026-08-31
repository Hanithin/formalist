import { createRequire } from "node:module";
import { INSECABLE, typographier } from "@/domain/document/typographie";

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

  archive.file("word/document.xml", lierAuTravers(rendu));
  return archive.generate({ type: "nodebuffer" });
}

/**
 * Le nombre d'un nœud et l'unité du suivant.
 *
 * Les règles portent sur le contenu d'un nœud, et le montant se substitue dans le sien :
 * l'en-tête des statuts se compose de « au capital de », « 20 000 », « euros » en trois
 * nœuds voisins, si bien que la règle qui lie un nombre à son unité ne voyait jamais les
 * deux ensemble. Le capital d'une société pouvait donc se couper en fin de ligne dans le
 * document que le greffe conserve - exactement ce que cette passe devait empêcher.
 *
 * On ne franchit pas la fin du paragraphe : deux paragraphes qui se suivent ne forment
 * pas une phrase, et lier leur dernier chiffre au premier mot du suivant serait faux.
 */
function lierAuTravers(xml: string): string {
  return xml.replace(
    /(\d)(<\/w:t>(?:(?!<w:t[ >])(?!<\/w:p>)[\s\S])*?<w:t[^>]*>)[\u0020](?=(?:euros?|ans?|années?|parts?|actions?)\b|[€%])/g,
    (_tout, chiffre: string, entreDeux: string) => chiffre + entreDeux + INSECABLE
  );
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
