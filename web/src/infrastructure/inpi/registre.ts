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
  httpsBuffer: (chemin: string, entetes: Record<string, string>) => Promise<Buffer>;
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

  const racine = donnees as Record<string, unknown>;
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
