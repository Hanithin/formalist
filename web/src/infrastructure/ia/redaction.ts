import { journal } from "@/lib/journal";
import { invite, nettoyerProposition } from "@/domain/formalite/objet-social";

/**
 * Rédaction assistée.
 *
 * Un service extérieur : il tombe, il change de format, il refuse parfois de
 * répondre. Ce module traduit ses aléas en une erreur claire, et ne laisse jamais
 * remonter sa réponse brute - elle vient d'ailleurs.
 */
const MODELE = "gemini-2.0-flash";
const DELAI_MS = 20_000;

export class RedactionIndisponible extends Error {
  readonly statut = 503;
  constructor(message = "La rédaction assistée est momentanément indisponible", cause?: unknown) {
    super(message);
    this.name = "RedactionIndisponible";
    if (cause) journal.error({ err: cause }, "Rédaction assistée interrompue");
  }
}

export async function redigerObjetSocial(description: string): Promise<string> {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) {
    journal.warn("Clé de rédaction assistée absente");
    throw new RedactionIndisponible("La rédaction assistée n'est pas configurée");
  }

  const abandon = AbortSignal.timeout(DELAI_MS);

  let reponse: Response;
  try {
    reponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        MODELE +
        ":generateContent?key=" +
        encodeURIComponent(cle),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: invite(description) }] }] }),
        signal: abandon,
      }
    );
  } catch (e) {
    throw new RedactionIndisponible(undefined, e);
  }

  if (!reponse.ok) {
    // Le corps peut contenir la clé en écho : on n'en garde que le statut.
    throw new RedactionIndisponible(undefined, new Error("statut " + reponse.status));
  }

  let donnees: unknown;
  try {
    donnees = await reponse.json();
  } catch (e) {
    throw new RedactionIndisponible(undefined, e);
  }

  const texte = (
    donnees as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  )?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof texte !== "string" || !texte.trim()) {
    throw new RedactionIndisponible("Aucune proposition n'a pu être rédigée");
  }

  return nettoyerProposition(texte);
}
