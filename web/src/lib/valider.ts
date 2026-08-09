import { z } from "zod";

/**
 * Validation des entrées à la frontière.
 *
 * Aucun corps de requête n'est lu sans passer par ici. La règle vaut aussi pour les
 * paramètres d'URL : ce qui vient du réseau n'est pas de la donnée, c'est une
 * proposition de donnée.
 */

export class EntreeInvalide extends Error {
  readonly statut = 400;
  readonly details: Record<string, string[]>;

  constructor(details: Record<string, string[]>) {
    super("Entrée invalide");
    this.name = "EntreeInvalide";
    this.details = details;
  }
}

/** Valide une valeur déjà en mémoire. Lève EntreeInvalide si elle ne convient pas. */
export function valider<T>(schema: z.ZodType<T>, valeur: unknown): T {
  const resultat = schema.safeParse(valeur);
  if (resultat.success) return resultat.data;

  const details: Record<string, string[]> = {};
  for (const probleme of resultat.error.issues) {
    const champ = probleme.path.join(".") || "_";
    (details[champ] ??= []).push(probleme.message);
  }
  throw new EntreeInvalide(details);
}

/** Valide le corps JSON d'une requête. Un corps illisible est une entrée invalide. */
export async function validerCorps<T>(schema: z.ZodType<T>, requete: Request): Promise<T> {
  let brut: unknown;
  try {
    brut = await requete.json();
  } catch {
    throw new EntreeInvalide({ _: ["Corps de requête illisible"] });
  }
  return valider(schema, brut);
}

/** Valide les paramètres d'URL. */
export function validerParametres<T>(schema: z.ZodType<T>, url: URL): T {
  return valider(schema, Object.fromEntries(url.searchParams));
}

/* Schémas réutilisés partout : une seule définition, un seul message. */
export const schemas = {
  email: z.string().trim().toLowerCase().email("Adresse email invalide"),
  motDePasse: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
  identifiant: z.coerce.number().int().positive("Identifiant invalide"),
  nom: z.string().trim().min(1, "Ce champ est requis").max(60, "Ce champ est trop long"),
};
