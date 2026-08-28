import { prisma } from "../client";
import { mesDossiers } from "./dossiers";
import { listerDocuments } from "./documents";
import {
  etatDeLaSociete,
  nomDeLaSociete,
  regrouperEnSocietes,
  type DossierDeSociete,
  type Societe,
} from "@/domain/societe/portefeuille";
import { nomAffichable } from "@/domain/formalite/liste";
import { dateLimiteApprobation, dateLimiteDepot } from "@/domain/comptes/regles";
import { termeDuMandat } from "@/domain/fermeture/delais";
import { premiereEtapeIncomplete, type Brouillon } from "@/domain/formalite/parcours";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Le portefeuille de sociétés.
 *
 * Il n'existe pas en base : on le reconstitue à partir des dossiers. Ce module fait le
 * travail d'extraction - retrouver le SIREN, la forme, les dates d'échéance dans le
 * `data_json` de chaque parcours, qui ne les range pas au même endroit - et laisse le
 * regroupement au domaine.
 */

/** Ce que chaque parcours appelle « la société », et où il la range. */
function societeDuDossier(dataJson: string | null): {
  siren: string | null;
  forme: string | null;
  denomination: string | null;
  valeurs: Record<string, unknown>;
} {
  const vide = { siren: null, forme: null, denomination: null, valeurs: {} };
  if (!dataJson) return vide;

  try {
    const lu: unknown = JSON.parse(dataJson);
    if (!lu || typeof lu !== "object") return vide;

    const objet = lu as {
      societe?: { siren?: string; forme?: string; denomination?: string };
      entreprise?: { siren?: string; denomination?: string };
      valeurs?: Record<string, unknown>;
      siren?: string;
    };

    /*
     * Trois emplacements, selon le parcours.
     *
     * La création garde le SIREN à la racine une fois immatriculée ; la modification,
     * le dépôt des comptes et la fermeture le rangent sous `societe` ; la cessation
     * d'auto-entreprise sous `entreprise`, parce qu'une auto-entreprise n'est pas une
     * société. Les unifier ici évite d'avoir à s'en souvenir partout ailleurs.
     */
    const source = objet.societe ?? objet.entreprise ?? {};
    return {
      siren: (source.siren ?? objet.siren ?? null) || null,
      forme: (objet.societe?.forme ?? null) || null,
      denomination: (source.denomination ?? null) || null,
      valeurs: objet.valeurs && typeof objet.valeurs === "object" ? objet.valeurs : {},
    };
  } catch {
    return vide;
  }
}

/** Les deux dates que les dossiers portent réellement, chacune dans son parcours. */
function echeancesDu(
  type: string | null,
  forme: string | null,
  valeurs: Record<string, unknown>
): { limiteDepot: string | null; termeDuMandat: string | null } {
  const texte = (cle: string) => (typeof valeurs[cle] === "string" ? (valeurs[cle] as string) : null);

  if (type === "comptes") {
    const approbation = dateLimiteApprobation(forme, texte("dateCloture"));
    return { limiteDepot: dateLimiteDepot(approbation), termeDuMandat: null };
  }
  if (type === "fermeture") {
    return { limiteDepot: null, termeDuMandat: termeDuMandat(texte("dateDissolution")) };
  }
  return { limiteDepot: null, termeDuMandat: null };
}

function lireBrouillon(dataJson: string | null): Brouillon {
  try {
    return dataJson ? (JSON.parse(dataJson) as Brouillon) : ({} as Brouillon);
  } catch {
    return {} as Brouillon;
  }
}

export async function mesSocietes(utilisateur: UtilisateurConnecte): Promise<Societe[]> {
  const dossiers = await mesDossiers(utilisateur);

  const lignes: DossierDeSociete[] = dossiers
    /*
     * Un dossier sans société n'entre pas au portefeuille.
     *
     * Tant que la société n'est pas choisie, il n'y a rien à regrouper : le marqueur
     * « Société à identifier » créerait une entrée fantôme rassemblant tous les
     * dossiers vides du compte sous un nom qui n'est celui de personne.
     */
    .filter((d) => nomAffichable(d.societe))
    .map((d) => {
      const { siren, forme, denomination, valeurs } = societeDuDossier(d.data_json);
      const formeRetenue = d.forme?.trim() || forme;

      return {
        id: d.id,
        type: d.type,
        societe: denomination?.trim() || d.societe || "",
        forme: formeRetenue,
        siren,
        status: d.status,
        sousPhase: d.business_sub_phase,
        offre: d.offer,
        etapeAffichee: Math.max(
          d.phase ?? 1,
          (premiereEtapeIncomplete(lireBrouillon(d.data_json)) ?? 9) > 3 ? 2 : 1
        ),
        majLe: d.updated_at ?? new Date(),
        ...echeancesDu(d.type, formeRetenue, valeurs),
      };
    });

  return regrouperEnSocietes(lignes);
}

/**
 * Une société et tout ce qui s'y rattache.
 *
 * Les documents et le journal sont filtrés sur ses seuls dossiers : la fiche montre
 * l'entreprise, non le compte. C'est ce qui la distingue de la bibliothèque, qui
 * mélange tout et se cherche par recherche.
 */
export async function ouvrirSociete(utilisateur: UtilisateurConnecte, cle: string) {
  const societes = await mesSocietes(utilisateur);
  const societe = societes.find((s) => s.cle === cle);
  if (!societe) return null;

  const identifiants = new Set(societe.dossiers.map((d) => d.id));

  const [documents, journal] = await Promise.all([
    listerDocuments(utilisateur).then((tout) =>
      tout.filter((d) => d.societeId !== null && identifiants.has(d.societeId))
    ),
    prisma.audit_log.findMany({
      where: { formalite_id: { in: [...identifiants] } },
      orderBy: { created_at: "desc" },
      take: 12,
      include: { users: { select: { name: true } } },
    }),
  ]);

  return {
    societe,
    etat: etatDeLaSociete(societe),
    documents,
    journal: journal.map((e) => ({
      dossierId: e.formalite_id as number,
      societe: nomDeLaSociete(societe.denomination),
      action: e.action,
      auteurRole: e.actor_role,
      auteur: e.users?.name ?? null,
      champ: e.target_field,
      valeur: e.after_value,
      commentaire: e.comment,
      quand: e.created_at,
    })),
  };
}
