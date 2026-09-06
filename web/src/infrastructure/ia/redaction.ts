import { journal } from "@/lib/journal";
import { invite, nettoyerProposition } from "@/domain/formalite/objet-social";
import { texteDeLaReponse } from "./reponse";

/**
 * Rédaction assistée.
 *
 * Un service extérieur : il tombe, il change de format, il refuse parfois de
 * répondre. Ce module traduit ses aléas en une erreur claire, et ne laisse jamais
 * remonter sa réponse brute - elle vient d'ailleurs.
 */
/*
 * L'alias, non une version figée.
 *
 * « gemini-2.0-flash » a été retiré par Google, et le service a répondu 404 : la
 * rédaction assistée annonçait « momentanément indisponible » à chaque essai, sur une
 * panne qui ne passerait jamais. Une version épinglée se périme sans prévenir, et rien
 * ici ne le verrait avant qu'un client ne bute dessus.
 *
 * L'alias suit le modèle courant de la famille. Il peut changer de comportement d'un
 * jour à l'autre - c'est le prix - mais l'objet social est relu et corrigé par l'avocat
 * avant de figurer dans un acte, et la proposition est annoncée comme telle à l'écran.
 */
const MODELE = "gemini-flash-latest";
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

  const texte = texteDeLaReponse(donnees);

  if (!texte.trim()) {
    throw new RedactionIndisponible("Aucune proposition n'a pu être rédigée");
  }

  return nettoyerProposition(texte);
}
