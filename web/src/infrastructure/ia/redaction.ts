import { redigerAvecGemini } from "./redaction-gemini";
import { redigerAvecClaude } from "./redaction-claude";

export { RedactionIndisponible } from "./indisponible";

/**
 * Qui rédige l'objet social.
 *
 * Deux fournisseurs derrière une seule fonction. Ce n'est pas de l'abstraction pour
 * l'abstraction : ils ne se comparent qu'à invite rigoureusement identique, et le seul
 * moyen d'en être sûr est qu'ils la reçoivent du même endroit.
 *
 * Le choix se lit dans l'environnement, comme l'hôte du guichet : un réglage se change
 * sans déploiement, et le repli n'est pas un hasard - Gemini est ce qui tourne
 * aujourd'hui, et le rester tant que personne n'a décidé autrement.
 */
export type Fournisseur = "gemini" | "claude";

export function fournisseurDeRedaction(): Fournisseur {
  return (process.env.IA_FOURNISSEUR ?? "").trim().toLowerCase() === "claude"
    ? "claude"
    : "gemini";
}

export async function redigerObjetSocial(
  description: string,
  forme?: string | null,
  fournisseur: Fournisseur = fournisseurDeRedaction()
): Promise<string> {
  return fournisseur === "claude"
    ? redigerAvecClaude(description, forme)
    : redigerAvecGemini(description, forme);
}
