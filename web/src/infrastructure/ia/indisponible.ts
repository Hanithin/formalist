import { journal } from "@/lib/journal";

/**
 * L'échec d'une rédaction assistée, quel qu'en soit le fournisseur.
 *
 * Elle vit à part depuis qu'il y en a deux : la route la reconnaît pour rendre un 503,
 * et l'écran n'a pas à savoir qui a refusé. La cause reste dans le journal, jamais dans
 * la réponse - le corps d'une erreur peut renvoyer la clé en écho.
 */
export class RedactionIndisponible extends Error {
  readonly statut = 503;
  constructor(message = "La rédaction assistée est momentanément indisponible", cause?: unknown) {
    super(message);
    this.name = "RedactionIndisponible";
    if (cause) journal.error({ err: cause }, "Rédaction assistée interrompue");
  }
}
