import { prisma } from "../client";
import { exigerDossierModifiable } from "./dossiers";
import { proposerAuxAvocats } from "./avocat";
import { relirePaiement } from "@/infrastructure/paiement/stripe";
import { SOCIETE_A_IDENTIFIER } from "@/domain/formalite/liste";
import type { Nature } from "@/domain/cessation/regles";
import type { EntrepriseCessee } from "@/domain/cessation/gabarit";
import { journal } from "@/lib/journal";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Les dossiers de cessation d'auto-entreprise.
 *
 * Le plus léger des parcours : une entreprise, une date, quatre réponses. Il n'a ni
 * phases ni actes à produire au fil de l'eau - ce qui explique qu'il tienne en un
 * dixième du dépôt d'une fermeture de société.
 */

export interface Cessation {
  nature: Nature;
  entreprise: EntrepriseCessee;
  entrepreneur: { civilite?: string; prenom?: string; nom?: string; adresse?: string };
  valeurs: Record<string, string | number | undefined>;
  paiementRef?: string;
  paye?: boolean;
}

const VIDE: Cessation = {
  nature: "definitive",
  entreprise: {},
  entrepreneur: {},
  valeurs: {},
};

export function lireCessation(dataJson: string | null): Cessation {
  if (!dataJson) return structuredClone(VIDE);
  try {
    const lu = JSON.parse(dataJson) as Partial<Cessation>;
    return {
      ...structuredClone(VIDE),
      ...lu,
      entreprise: lu.entreprise ?? {},
      entrepreneur: lu.entrepreneur ?? {},
      valeurs: lu.valeurs ?? {},
    };
  } catch {
    return structuredClone(VIDE);
  }
}

/** Le libellé dans la liste : le nom, et ce qu'on lui fait. */
function libelleDu(cessation: Cessation): string {
  const nom = cessation.entreprise.denomination?.trim();
  if (!nom) return SOCIETE_A_IDENTIFIER;
  return nom + (cessation.nature === "temporaire" ? " - suspension" : " - cessation");
}

export async function commencerCessation(utilisateur: UtilisateurConnecte) {
  const enAttente = await prisma.formalites.findFirst({
    where: {
      user_id: utilisateur.id,
      type: "cessation",
      status: "en_cours",
      societe: SOCIETE_A_IDENTIFIER,
    },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  if (enAttente) return enAttente.id;

  const equipe = await prisma.team_members.findFirst({
    where: { user_id: utilisateur.id },
    select: { team_id: true },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: utilisateur.id,
      team_id: equipe?.team_id ?? null,
      type: "cessation",
      forme: "AE",
      societe: SOCIETE_A_IDENTIFIER,
      status: "en_cours",
      phase: 1,
      data_json: JSON.stringify(VIDE),
    },
  });

  return dossier.id;
}

export async function ouvrirCessation(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);
  return { dossier, cessation: lireCessation(dossier.data_json) };
}

export async function enregistrerCessation(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  cessation: Cessation
) {
  await exigerDossierModifiable(utilisateur, dossierId);

  await prisma.formalites.update({
    where: { id: dossierId },
    data: {
      data_json: JSON.stringify(cessation),
      societe: libelleDu(cessation),
      updated_at: new Date(),
    },
  });

  return cessation;
}

export async function completerCessation(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  changement: Partial<Cessation>
) {
  const { cessation } = await ouvrirCessation(utilisateur, dossierId);

  return enregistrerCessation(utilisateur, dossierId, {
    ...cessation,
    ...changement,
    entreprise: { ...cessation.entreprise, ...(changement.entreprise ?? {}) },
    entrepreneur: { ...cessation.entrepreneur, ...(changement.entrepreneur ?? {}) },
    valeurs: { ...cessation.valeurs, ...(changement.valeurs ?? {}) },
  });
}

/* ------------------------------------------------------------- Règlement */

export async function ouvrirLeReglementDeLaCessation(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  reference: string
) {
  await completerCessation(utilisateur, dossierId, { paiementRef: reference });
}

export async function confirmerLeReglementDeLaCessation(
  reference: string,
  dossierId: number | null
) {
  const dossier = await prisma.formalites.findFirst({
    where: dossierId ? { id: dossierId } : { data_json: { contains: reference } },
  });

  if (!dossier) {
    journal.warn({ session: reference }, "Encaissement sans dossier de cessation");
    return { dossierId: null, paye: false };
  }

  const cessation = lireCessation(dossier.data_json);
  if (cessation.paye) return { dossierId: dossier.id, paye: true };

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify({ ...cessation, paiementRef: reference, paye: true }),
      status: "en_attente_validation",
      phase: 5,
      updated_at: new Date(),
    },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossier.id,
      actor_id: dossier.user_id,
      actor_role: "user",
      action: "cessation_payee",
      after_value: reference,
    },
  });

  const { proposes } = await proposerAuxAvocats(dossier.id);
  return { dossierId: dossier.id, paye: true, proposes };
}

export async function confirmerCessationAuRetour(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  session: string
): Promise<{ paye: boolean }> {
  await exigerDossierModifiable(utilisateur, dossierId);

  const encaisse = await relirePaiement(session);
  if (!encaisse) return { paye: false };

  const { paye } = await confirmerLeReglementDeLaCessation(session, dossierId);
  return { paye };
}
