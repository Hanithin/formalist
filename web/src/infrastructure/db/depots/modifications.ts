import { prisma } from "../client";
import { listerDossiers, exigerDossierModifiable } from "./dossiers";
import { definitionModification } from "@/domain/formalite/modifications";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Modifications de société.
 *
 * Une modification est une formalité comme une autre, rattachée à la société
 * qu'elle modifie : elle hérite donc des mêmes règles d'accès.
 */

export interface BrouillonModification {
  typeModification?: string;
  societeSource?: number;
  valeurs?: Record<string, string | number>;
}

/** Les sociétés qu'on peut modifier : celles dont le dossier est abouti. */
export async function societesModifiables(utilisateur: UtilisateurConnecte) {
  const dossiers = await listerDossiers(utilisateur);
  return dossiers
    .filter((d) => d.type?.startsWith("Création") || d.type === "creation")
    .filter((d) => d.societe)
    .map((d) => ({ id: d.id, societe: d.societe, forme: d.forme, status: d.status }));
}

export async function commencerModification(
  utilisateur: UtilisateurConnecte,
  societeId: number,
  typeModification: string
) {
  // La société doit être accessible : sans ce contrôle, on modifierait celle
  // d'un autre en passant son identifiant.
  const source = await exigerDossierModifiable(utilisateur, societeId);

  const definition = definitionModification(typeModification);
  if (!definition) throw Object.assign(new Error("Type de modification inconnu"), { statut: 400 });

  const equipe = await prisma.team_members.findFirst({
    where: { user_id: utilisateur.id },
    select: { team_id: true },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: utilisateur.id,
      team_id: equipe?.team_id ?? null,
      type: "modification",
      forme: source.forme,
      societe: source.societe,
      status: "en_cours",
      phase: 1,
      data_json: JSON.stringify({
        typeModification,
        societeSource: source.id,
        forme: source.forme,
        denomination: source.societe,
        valeurs: {},
      }),
    },
  });

  return dossier.id;
}

export async function ouvrirModification(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);

  let brouillon: BrouillonModification & { forme?: string; denomination?: string } = {};
  try {
    brouillon = JSON.parse(dossier.data_json ?? "{}");
  } catch {
    brouillon = {};
  }

  return { dossier, brouillon };
}

export async function enregistrerModification(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  valeurs: Record<string, string | number>
) {
  const { dossier, brouillon } = await ouvrirModification(utilisateur, dossierId);

  const fusionne = { ...brouillon, valeurs: { ...(brouillon.valeurs ?? {}), ...valeurs } };

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: { data_json: JSON.stringify(fusionne), updated_at: new Date() },
  });

  return fusionne;
}
