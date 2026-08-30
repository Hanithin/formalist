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
/**
 * Le nom de la société, tel qu'on l'écrit au client.
 *
 * La colonne `societe` porte le libellé de travail du cabinet, et une fermeture y
 * ajoute sa phase : « ATELIER MARCHAND - dissolution », pour distinguer dans la liste
 * un dossier qui dure des mois. Ce suffixe partait ensuite dans tout ce qu'on écrivait
 * au client - « La fermeture de ATELIER MARCHAND - dissolution est enregistrée » - et
 * dans l'objet de ses courriels.
 *
 * Le dossier porte la dénomination réelle : chaque parcours la range à sa façon, et
 * c'est elle qu'on lui adresse.
 */
export function nomDeLaSociete(dossier: {
  societe: string | null;
  data_json: string | null;
}): string {
  const donnees = brouillonLisible(dossier.data_json);
  const sous = (cle: string) =>
    (donnees[cle] as { denomination?: unknown } | undefined)?.denomination;

  const nom = [donnees.denomination, sous("societe"), sous("entreprise")].find(
    (v) => typeof v === "string" && v.trim()
  );

  if (typeof nom === "string") return nom.trim();
  return dossier.societe?.trim() || "";
}

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
