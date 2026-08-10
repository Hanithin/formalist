import { prisma } from "../client";
import { exigerDossierModifiable } from "./dossiers";
import { premiereEtapeIncomplete, type Declaration } from "@/domain/auto-entrepreneur/declaration";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Déclaration d'auto-entreprise.
 *
 * Elle est stockée comme une formalité, du type « auto-entrepreneur » : elle
 * hérite ainsi des règles d'accès, de la messagerie et du dépôt de pièces, sans
 * qu'on ait à les redéfinir.
 */

function lire(dataJson: string | null): Declaration {
  if (!dataJson) return {};
  try {
    const analyse: unknown = JSON.parse(dataJson);
    return analyse && typeof analyse === "object" ? (analyse as Declaration) : {};
  } catch {
    return {};
  }
}

export async function commencerDeclaration(utilisateur: UtilisateurConnecte) {
  const equipe = await prisma.team_members.findFirst({
    where: { user_id: utilisateur.id },
    select: { team_id: true },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: utilisateur.id,
      team_id: equipe?.team_id ?? null,
      type: "auto-entrepreneur",
      forme: "AE",
      societe: "",
      status: "en_cours",
      phase: 1,
      data_json: "{}",
    },
  });

  return dossier.id;
}

export async function ouvrirDeclaration(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);
  return { dossier, declaration: lire(dossier.data_json) };
}

export async function enregistrerDeclaration(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  modifications: Partial<Declaration>
) {
  const { dossier, declaration } = await ouvrirDeclaration(utilisateur, dossierId);
  const fusionnee = { ...declaration, ...modifications };

  // Le nom affiché dans les listes est celui de la personne : une auto-entreprise
  // n'a pas de dénomination distincte.
  const nom = [fusionnee.prenoms, fusionnee.nomUsage || fusionnee.nomNaissance]
    .filter(Boolean)
    .join(" ")
    .trim();

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify(fusionnee),
      societe: nom || dossier.societe,
      phase: premiereEtapeIncomplete(fusionnee) ?? 7,
      updated_at: new Date(),
    },
  });

  return fusionnee;
}
