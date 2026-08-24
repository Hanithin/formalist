import { createRequire } from "node:module";
import { journal } from "@/lib/journal";

/**
 * Registre national des entreprises.
 *
 * inpi.cjs est repris du serveur d'origine sans réécriture : extraction du
 * capital et des représentants, validation d'adresse, lecture assistée en
 * secours. Des heuristiques accumulées sur des documents réels, qu'on ne
 * retrouverait pas en repartant de zéro.
 */
const requerir = createRequire(import.meta.url);

interface ModuleInpi {
  inpiJson: (chemin: string) => Promise<unknown>;
  /*
   * Le transport rend une enveloppe, non le fichier : `{ status, contentType, buffer }`.
   * La déclarer telle qu'elle est évite de relire le .cjs pour s'en souvenir.
   */
  httpsBuffer: (
    chemin: string,
    entetes: Record<string, string>
  ) => Promise<{ status: number; contentType: string; buffer: Buffer }>;
  getToken: (force?: boolean) => Promise<string>;
  findCapital: (objet: unknown, profondeur: number) => number | null;
  extractRepresentants: (racine: unknown) => unknown[];
}

let module_: ModuleInpi | null = null;

function charger(): ModuleInpi {
  if (module_) return module_;
  module_ = requerir("./inpi.cjs") as ModuleInpi;
  return module_;
}

/**
 * Le contenu d'une réponse du registre, sans son enveloppe.
 *
 * `inpiJson` rend ce que renvoie le transport : `{ status, json }`. Les lectures qui
 * cherchaient `racine.actes` ou `racine.formality` tombaient donc sur `undefined`, et
 * concluaient à un registre muet : « le registre ne publie aucun acte de statuts pour
 * ce SIREN » s'affichait pour toutes les sociétés, y compris celles qui en publient
 * une dizaine. La fiche société perdait de même sa dénomination et sa forme - seul le
 * capital survivait, parce qu'il est cherché en profondeur.
 *
 * On déballe donc une fois, ici, plutôt que dans chaque lecture.
 */
export function contenuDuRegistre(reponse: unknown): Record<string, unknown> {
  if (!reponse || typeof reponse !== "object") return {};
  const enveloppe = reponse as Record<string, unknown>;
  const dedans = enveloppe.json;
  if (dedans && typeof dedans === "object") return dedans as Record<string, unknown>;
  return enveloppe;
}

export class RegistreIndisponible extends Error {
  readonly statut: number;
  constructor(message: string, statut = 503) {
    super(message);
    this.name = "RegistreIndisponible";
    this.statut = statut;
  }
}

const SIREN = /^\d{9}$/;

export function sirenValide(valeur: string): boolean {
  return SIREN.test(valeur.replace(/\s/g, ""));
}

export interface Societe {
  siren: string;
  denomination: string | null;
  forme: string | null;
  capital: number | null;
  representants: unknown[];
}

/**
 * Fiche d'une société.
 *
 * @throws RegistreIndisponible quand les identifiants manquent ou que le
 * registre ne répond pas - c'est un service extérieur, il tombe.
 */
export async function societe(sirenBrut: string): Promise<Societe | null> {
  const siren = sirenBrut.replace(/\s/g, "");
  if (!sirenValide(siren)) {
    throw new RegistreIndisponible("Numéro SIREN invalide : neuf chiffres attendus", 400);
  }

  const inpi = charger();

  let donnees: unknown;
  try {
    donnees = await inpi.inpiJson("/api/companies/" + siren);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("INPI_CREDENTIALS_MISSING")) {
      journal.warn("Identifiants INPI absents : consultation du registre impossible");
      throw new RegistreIndisponible("La consultation du registre n'est pas configurée");
    }
    journal.error({ err: e, siren }, "Registre national interrogé sans succès");
    throw new RegistreIndisponible("Le registre national ne répond pas");
  }

  if (!donnees) return null;

  const racine = contenuDuRegistre(donnees);
  const personne = (racine.formality as Record<string, unknown> | undefined)?.content as
    | Record<string, unknown>
    | undefined;
  const identite = (personne?.personneMorale as Record<string, unknown> | undefined)?.identite as
    | Record<string, unknown>
    | undefined;
  const entreprise = identite?.entreprise as Record<string, unknown> | undefined;

  return {
    siren,
    denomination: (entreprise?.denomination as string) ?? null,
    forme: (entreprise?.formeJuridique as string) ?? null,
    capital: inpi.findCapital(donnees, 0),
    representants: inpi.extractRepresentants(donnees),
  };
}
