import { prisma } from "../client";
import { exigerDossierModifiable } from "./dossiers";
import { premiereEtapeIncomplete, type Brouillon } from "@/domain/formalite/parcours";
import { monteeEnOffrePermise } from "@/domain/formalite/transitions";
import { Interdit } from "../utilisateur-courant";
import { regle } from "@/domain/formalite/formes";
import { journal } from "@/lib/journal";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Le brouillon d'une formalité.
 *
 * Il est stocké dans data_json du dossier, comme le fait déjà le serveur
 * d'origine - mais côté serveur cette fois, et non dans le navigateur. Le travail
 * ne se perd plus en changeant d'appareil, et les pièces déposées ont enfin un
 * propriétaire connu du serveur.
 */

function lireBrouillon(dataJson: string | null): Brouillon {
  if (!dataJson) return {};
  try {
    const analyse: unknown = JSON.parse(dataJson);
    return analyse && typeof analyse === "object" ? (analyse as Brouillon) : {};
  } catch (e) {
    // Un brouillon illisible ne doit pas empêcher d'ouvrir le dossier : on repart
    // d'un brouillon vide et on garde la trace.
    journal.error({ err: e }, "Brouillon illisible");
    return {};
  }
}

export async function ouvrirBrouillon(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);
  return { dossier, brouillon: lireBrouillon(dossier.data_json) };
}

/** Crée un dossier vide et rend son identifiant. */
export async function commencerFormalite(utilisateur: UtilisateurConnecte, type = "creation") {
  const equipe = await prisma.team_members.findFirst({
    where: { user_id: utilisateur.id },
    select: { team_id: true },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: utilisateur.id,
      team_id: equipe?.team_id ?? null,
      type,
      forme: "",
      societe: "",
      status: "en_cours",
      phase: 1,
      data_json: "{}",
    },
  });

  return dossier.id;
}

/**
 * Enregistre les champs modifiés.
 *
 * On fusionne au lieu de remplacer : chaque étape n'envoie que ses champs, et un
 * remplacement effacerait les précédentes.
 */
export async function enregistrerBrouillon(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  modifications: Partial<Brouillon>
) {
  const { dossier, brouillon } = await ouvrirBrouillon(utilisateur, dossierId);
  const fusionne: Brouillon = { ...brouillon, ...modifications };

  // La dénomination et la forme sont recopiées dans leurs colonnes : les listes
  // et l'espace avocat les lisent là, sans avoir à ouvrir le brouillon.
  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify(fusionne),
      societe: fusionne.denomination ?? dossier.societe,
      forme: regle(fusionne.forme) ? fusionne.forme! : dossier.forme,
      offer: fusionne.offre ?? dossier.offer,
      phase: premiereEtapeIncomplete(fusionne) ?? 6,
      updated_at: new Date(),
    },
  });

  return fusionne;
}

/**
 * Montée en offre.
 *
 * Réservée au propriétaire du dossier : c'est lui qui paie. On ne redescend pas,
 * le travail déjà fait au titre d'une offre supérieure n'étant pas défait.
 */
export async function changerDOffre(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  offre: string
) {
  const dossier = await prisma.formalites.findUnique({ where: { id: dossierId } });
  if (!dossier || dossier.user_id !== utilisateur.id) {
    throw new Interdit("Ce dossier n'existe pas ou ne vous est pas accessible");
  }

  if (!monteeEnOffrePermise(dossier.offer, offre)) {
    throw new Interdit("Cette offre n'est pas une montée depuis la vôtre");
  }

  await prisma.formalites.update({
    where: { id: dossierId },
    data: { offer: offre, updated_at: new Date() },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: "user",
      action: "offre_modifiee",
      before_value: dossier.offer,
      after_value: offre,
    },
  });

  return { offre };
}
