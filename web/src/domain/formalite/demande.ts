import { definitions } from "@/domain/modification/types";

/**
 * Ce que le client demande, dit en quelques mots.
 *
 * L'espace avocat annonçait « SAS · Modification » et rien d'autre : deux dossiers de
 * la même forme et du même type y sont indiscernables, alors qu'un transfert de siège
 * et une augmentation de capital ne demandent ni le même travail, ni le même temps.
 * L'avocat qui décide d'en prendre un a d'abord besoin de savoir de quoi il s'agit.
 *
 * Le tout vient du brouillon du client - c'est là que sont les changements décidés -
 * et un brouillon illisible ne rend rien plutôt que d'empêcher l'écran de s'afficher.
 */
export function objetDuDossier(type: string, donnees: unknown): string[] {
  if (!donnees || typeof donnees !== "object") return [];
  const brouillon = donnees as Record<string, unknown>;

  if (type === "modification") {
    const codes = Array.isArray(brouillon.codes)
      ? brouillon.codes.filter((c): c is string => typeof c === "string")
      : [];
    return definitions(codes).map((d) => d.libelle);
  }

  if (type === "creation") {
    /*
     * Une création se résume par son activité, non par sa forme.
     *
     * La forme est déjà dite à côté du nom de la société ; l'activité, elle, dit ce que
     * l'entreprise fera - et c'est elle qui décide de l'objet social à rédiger.
     */
    const activite = typeof brouillon.activite === "string" ? brouillon.activite.trim() : "";
    return activite ? [activite] : [];
  }

  return [];
}

/** Le brouillon d'un dossier, quand il est lisible. */
export function brouillonLisible(dataJson: string | null): Record<string, unknown> {
  if (!dataJson) return {};
  try {
    const lu: unknown = JSON.parse(dataJson);
    return lu && typeof lu === "object" ? (lu as Record<string, unknown>) : {};
  } catch {
    // Un brouillon illisible ne doit pas vider la liste du cabinet.
    return {};
  }
}
