import { createRequire } from "node:module";
import { journal } from "@/lib/journal";
import { RegistreIndisponible, sirenValide } from "./registre";

/**
 * Les actes déposés au registre national des entreprises.
 *
 * L'INPI diffuse les actes publics d'une société : statuts constitutifs, statuts mis
 * à jour, procès-verbaux. C'est de là que viennent les statuts d'une société qu'on
 * s'apprête à modifier, plutôt que de demander au client de retrouver un fichier
 * vieux de six ans.
 *
 * L'INSEE n'a rien à voir là-dedans : Sirene ne diffuse que des données
 * administratives, jamais un document. La confusion est courante et coûte une
 * demi-journée à qui la fait.
 *
 * Deux points d'accès, sur l'hôte et le jeton que registre.ts emploie déjà :
 *
 *   GET /api/companies/{siren}/attachments  -> { actes: [...], bilans: [...] }
 *   GET /api/actes/{id}/download            -> le PDF
 *
 * Seuls les actes publics sont diffusés. Une société peut donc n'en avoir aucun, et
 * ce n'est pas une panne : c'est une réponse, que l'appelant doit savoir dire.
 */
const requerir = createRequire(import.meta.url);

interface ModuleInpi {
  inpiJson: (chemin: string) => Promise<unknown>;
  httpsBuffer: (chemin: string, entetes: Record<string, string>) => Promise<Buffer>;
  getToken: (force?: boolean) => Promise<string>;
}

let module_: ModuleInpi | null = null;

function charger(): ModuleInpi {
  if (!module_) module_ = requerir("./inpi.cjs") as ModuleInpi;
  return module_;
}

export interface Acte {
  id: string;
  /** Date de dépôt au registre, en ISO. */
  deposeLe: string | null;
  /** Le type tel que le registre le nomme : « Statuts mis à jour », « Statuts »… */
  nature: string;
  /** Vrai quand la nature désigne des statuts, et non un procès-verbal. */
  statuts: boolean;
}

/**
 * Reconnaît des statuts parmi les natures d'actes.
 *
 * Le registre n'emploie pas un libellé unique : « Statuts constitutifs », « Statuts
 * mis à jour », « Statuts à jour », parfois « Statuts » seul. On cherche donc le mot,
 * en écartant ce qui n'en est visiblement pas - un projet de statuts n'est pas un
 * acte déposé.
 */
export function estDesStatuts(nature: string): boolean {
  const n = nature.toLowerCase();
  if (!n.includes("statut")) return false;
  return !n.includes("projet");
}

function texteDe(valeur: unknown): string {
  return typeof valeur === "string" ? valeur.trim() : "";
}

/** Les natures d'un acte, le registre en listant parfois plusieurs par dépôt. */
function naturesDe(acte: Record<string, unknown>): string {
  const rdd = acte.typeRdd;
  if (Array.isArray(rdd)) {
    const dits = rdd
      .map((r) => (r && typeof r === "object" ? texteDe((r as Record<string, unknown>).typeActe) : ""))
      .filter(Boolean);
    if (dits.length) return dits.join(", ");
  }
  return texteDe(acte.nomDocument) || texteDe(acte.typeActe) || "Acte";
}

function dateDe(acte: Record<string, unknown>): string | null {
  const brute = texteDe(acte.dateDepot);
  if (!brute) return null;
  const lue = new Date(brute);
  return Number.isNaN(lue.getTime()) ? null : lue.toISOString();
}

/**
 * Les actes d'une société, du plus récent au plus ancien.
 *
 * @throws RegistreIndisponible quand le registre ne répond pas ou n'est pas configuré.
 */
export async function actesDe(sirenBrut: string): Promise<Acte[]> {
  const siren = sirenBrut.replace(/\s/g, "");
  if (!sirenValide(siren)) {
    throw new RegistreIndisponible("Numéro SIREN invalide : neuf chiffres attendus", 400);
  }

  let donnees: unknown;
  try {
    donnees = await charger().inpiJson("/api/companies/" + siren + "/attachments");
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("INPI_CREDENTIALS_MISSING")) {
      journal.warn("Identifiants INPI absents : actes du registre inaccessibles");
      throw new RegistreIndisponible("La consultation du registre n'est pas configurée");
    }
    journal.error({ err: e, siren }, "Actes du registre interrogés sans succès");
    throw new RegistreIndisponible("Le registre national ne répond pas");
  }

  const racine = (donnees ?? {}) as Record<string, unknown>;
  const bruts = Array.isArray(racine.actes) ? racine.actes : [];

  const actes = bruts
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => {
      const nature = naturesDe(a);
      return {
        id: texteDe(a.id),
        deposeLe: dateDe(a),
        nature,
        statuts: estDesStatuts(nature),
      };
    })
    .filter((a) => a.id);

  // Du plus récent au plus ancien : c'est le dernier dépôt qui nous intéresse. Un
  // acte sans date passe en fin de liste plutôt que d'être pris pour le plus récent.
  return actes.sort((a, b) => {
    if (!a.deposeLe) return 1;
    if (!b.deposeLe) return -1;
    return b.deposeLe.localeCompare(a.deposeLe);
  });
}

/** Le dernier dépôt de statuts, s'il en existe un de public. */
export function dernierDepotDeStatuts(actes: Acte[]): Acte | null {
  return actes.find((a) => a.statuts) ?? null;
}

/**
 * Le PDF d'un acte.
 *
 * L'identifiant vient de la liste : on ne le construit pas, et on ne l'accepte pas
 * d'ailleurs que d'un appel à actesDe - un identifiant libre ferait de cette
 * fonction un relais vers n'importe quel document du registre.
 */
export async function telechargerActe(id: string): Promise<Buffer> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new RegistreIndisponible("Identifiant d'acte invalide", 400);
  }

  const inpi = charger();
  try {
    const jeton = await inpi.getToken();
    return await inpi.httpsBuffer("/api/actes/" + id + "/download", {
      Authorization: "Bearer " + jeton,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.includes("INPI_CREDENTIALS_MISSING")) {
      throw new RegistreIndisponible("La consultation du registre n'est pas configurée");
    }
    journal.error({ err: e, acte: id }, "Téléchargement d'un acte interrompu");
    throw new RegistreIndisponible("L'acte n'a pas pu être téléchargé");
  }
}
