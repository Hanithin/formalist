import { journal } from "@/lib/journal";

/**
 * L'échec d'une rédaction assistée, quel qu'en soit le fournisseur.
 *
 * Elle vit à part depuis qu'il y en a deux : la route la reconnaît pour rendre un 503,
 * et l'écran n'a pas à savoir qui a refusé.
 *
 * Elle porte cependant de quoi le diagnostiquer. Le message affiché ne change pas - un
 * client qui crée sa société n'a que faire d'un code HTTP - mais la réponse en transporte
 * le détail. Sans lui, une panne en production se réduit à « momentanément
 * indisponible », et il faut deviner lequel des deux services a répondu quoi ; c'est
 * exactement ce qu'on a passé un quart d'heure à faire.
 *
 * La cause complète reste dans le journal, jamais dans la réponse : le corps d'une
 * erreur peut renvoyer la clé en écho.
 */
export interface OrigineDeLEchec {
  /** « gemini » ou « claude » : lequel a été appelé. */
  fournisseur?: string;
  /** Le statut HTTP qu'il a rendu, quand il en a rendu un. */
  statutFournisseur?: number;
}

export class RedactionIndisponible extends Error {
  readonly statut = 503;
  readonly fournisseur?: string;
  readonly statutFournisseur?: number;

  constructor(
    message = "La rédaction assistée est momentanément indisponible",
    cause?: unknown,
    origine: OrigineDeLEchec = {}
  ) {
    super(message);
    this.name = "RedactionIndisponible";
    this.fournisseur = origine.fournisseur;
    this.statutFournisseur = origine.statutFournisseur;
    if (cause) journal.error({ err: cause, ...origine }, "Rédaction assistée interrompue");
  }
}
