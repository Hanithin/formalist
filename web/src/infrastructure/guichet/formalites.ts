import { demander } from "./transport";

/**
 * Ce que le guichet unique tient des dépôts du cabinet.
 *
 * Lecture seule : ce module ne dépose rien. Il sert à savoir où en sont les formalités
 * déjà transmises, et à les rattacher à nos dossiers.
 *
 * Le rattachement passe par une référence libre que l'on pose à l'envoi. Attention au
 * piège du contrat : le champ s'appelle `referenceMandataire` quand on dépose, et le
 * filtre de lecture `referenceClientMandataire`. Deux noms pour la même chose, dans le
 * même document - d'où les deux constantes ci-dessous plutôt qu'une chaîne recopiée.
 */
export const CHAMP_REFERENCE = "referenceMandataire";
export const FILTRE_REFERENCE = "referenceClientMandataire";

/** Notre numéro de dossier, sous la forme que le guichet nous rendra. */
export function referenceDuDossier(dossierId: number): string {
  return "FORMALIST-" + dossierId;
}

/** Le dossier que porte une référence, ou rien si elle vient d'ailleurs. */
export function dossierDeLaReference(reference: string | null | undefined): number | null {
  const trouve = /^FORMALIST-(\d+)$/.exec((reference ?? "").trim());
  return trouve ? Number(trouve[1]) : null;
}

export interface DepotAuGuichet {
  id: number;
  reference: string | null;
  nomDossier: string | null;
  companyName: string | null;
  siren: string | null;
  typeFormalite: string | null;
  statut: string | null;
  statutLe: string | null;
  numNat: string | null;
}

function texte(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
}

function unDepot(brut: unknown): DepotAuGuichet | null {
  if (typeof brut !== "object" || brut === null) return null;
  const o = brut as Record<string, unknown>;
  const id = typeof o.id === "number" ? o.id : Number(o.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    reference: texte(o[CHAMP_REFERENCE]),
    nomDossier: texte(o.nomDossier),
    companyName: texte(o.companyName),
    siren: texte(o.siren),
    typeFormalite: texte(o.typeFormalite),
    statut: texte(o.status),
    statutLe: texte(o.statusDate),
    numNat: texte(o.numNat),
  };
}

/**
 * Une liste, qu'elle soit rendue en tableau nu ou en collection Hydra.
 *
 * Le guichet est bâti sur API Platform : selon l'en-tête `Accept` négocié, il rend
 * `[...]` ou `{ "hydra:member": [...] }`. Accepter les deux évite qu'un changement de
 * négociation vide silencieusement la liste - c'est exactement le défaut qui a fait
 * croire, côté registre, que l'INPI ne publiait aucun acte.
 */
export function depotsDeLaReponse(corps: unknown): DepotAuGuichet[] {
  const tableau = Array.isArray(corps)
    ? corps
    : typeof corps === "object" && corps !== null
      ? ((corps as Record<string, unknown>)["hydra:member"] ??
        (corps as Record<string, unknown>).member)
      : null;
  if (!Array.isArray(tableau)) return [];
  return tableau.map(unDepot).filter((d): d is DepotAuGuichet => d !== null);
}

export interface FiltresDesDepots {
  statuts?: string[];
  typeFormalite?: "C" | "M" | "R";
  reference?: string;
  page?: number;
  parPage?: number;
}

function requete(filtres: FiltresDesDepots): string {
  const p = new URLSearchParams();
  for (const statut of filtres.statuts ?? []) p.append("status[]", statut);
  if (filtres.typeFormalite) p.set("typeFormalite", filtres.typeFormalite);
  if (filtres.reference) p.set(FILTRE_REFERENCE, filtres.reference);
  p.set("page", String(filtres.page ?? 1));
  p.set("itemsPerPage", String(filtres.parPage ?? 20));
  /* Le plus récent d'abord : c'est l'ordre dans lequel on relit un suivi. */
  p.set("order[statusDate]", "desc");
  return p.toString();
}

/**
 * Les dépôts du compte, filtrés.
 *
 * Une liste vide est une réponse, non une panne : un compte de démonstration neuf n'a
 * rien déposé. L'appelant doit pouvoir dire « rien » sans dire « en panne ».
 */
export async function listerLesDepots(
  filtres: FiltresDesDepots = {}
): Promise<DepotAuGuichet[]> {
  return depotsDeLaReponse(await demander("/api/formalities?" + requete(filtres)));
}

/** Le dépôt d'un de nos dossiers, s'il en existe un. */
export async function depotDuDossier(dossierId: number): Promise<DepotAuGuichet | null> {
  const trouves = await listerLesDepots({ reference: referenceDuDossier(dossierId), parPage: 1 });
  return trouves[0] ?? null;
}

/** Le détail d'un dépôt, tel que le guichet le tient. */
export async function detailDuDepot(id: number): Promise<DepotAuGuichet | null> {
  return unDepot(await demander("/api/formalities/" + id));
}

/**
 * Qui parle, et depuis quel compte.
 *
 * Sert de contrôle : la réponse dit que le compte existe, que les conditions
 * particulières d'utilisation sont validées, et sur quel environnement on se trouve.
 */
export interface CompteDuGuichet {
  nom: string | null;
  prenom: string | null;
  societe: string | null;
  roles: string[];
}

export function compteDeLaReponse(corps: unknown): CompteDuGuichet {
  const o = (typeof corps === "object" && corps !== null ? corps : {}) as Record<string, unknown>;
  return {
    nom: texte(o.name),
    prenom: texte(o.firstname),
    societe: texte(o.companyName),
    roles: Array.isArray(o.roles) ? o.roles.filter((r): r is string => typeof r === "string") : [],
  };
}
