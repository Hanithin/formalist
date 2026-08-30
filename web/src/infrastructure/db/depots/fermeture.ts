import { prisma } from "../client";
import { exigerDossierModifiable } from "./dossiers";
import { proposerAuxAvocats } from "./avocat";
import { relirePaiement } from "@/infrastructure/paiement/stripe";
import type { Voie } from "@/domain/fermeture/voie";
import type { SocieteFermee, AssociePresent } from "@/domain/fermeture/gabarit";
import { journal } from "@/lib/journal";
import { produireLesActesDeLaFermeture } from "@/infrastructure/documents/actes-fermeture";
import type { UtilisateurConnecte } from "../sessions";
import { SOCIETE_A_IDENTIFIER } from "@/domain/formalite/liste";

/**
 * Les dossiers de fermeture.
 *
 * Une fermeture n'est pas une formalité qu'on remplit d'une traite. Elle se déroule en
 * deux temps séparés par des mois : la dissolution, puis la clôture de la liquidation.
 * Le dossier reste ouvert entre les deux, et c'est ce qui le distingue de tous les
 * autres parcours de l'application - un dossier réglé y est un dossier fini, alors
 * qu'ici il lui reste la moitié du chemin.
 *
 * Conséquence directe : le règlement ne verrouille pas la saisie. Il transmet la phase
 * de dissolution au cabinet, et laisse la seconde phase ouverte. Un dossier payé dont
 * on ne pourrait plus rien saisir obligerait à en rouvrir un second pour la clôture,
 * avec une société saisie deux fois et deux dossiers à réconcilier.
 */

export type Phase = "dissolution" | "cloture";

export interface Jalons {
  /** L'avis de dissolution a paru. */
  annonceDissolutionPubliee?: boolean;
  /** Le dossier de dissolution est déposé au guichet unique. */
  dissolutionDeposee?: boolean;
  /** Les deux attestations sont au dossier. */
  attestationFiscale?: boolean;
  attestationSociale?: boolean;
}

export interface Fermeture {
  /** Nulle tant que l'orientation n'a pas été faite. */
  voie: Voie | null;
  situation: {
    dettesImpayables: boolean;
    associeUniquePersonneMorale: boolean;
  };
  phase: Phase;
  societe: SocieteFermee;
  associes: AssociePresent[];
  valeurs: Record<string, string | number | undefined>;
  jalons: Jalons;
  paiementRef?: string;
  paye?: boolean;
  /** La clôture a été demandée : le dossier repart chez l'avocat. */
  clotureTransmise?: boolean;
}

const VIDE: Fermeture = {
  voie: null,
  situation: { dettesImpayables: false, associeUniquePersonneMorale: false },
  phase: "dissolution",
  societe: {},
  associes: [],
  valeurs: {},
  jalons: {},
};


export function lireFermeture(dataJson: string | null): Fermeture {
  if (!dataJson) return structuredClone(VIDE);
  try {
    const lu = JSON.parse(dataJson) as Partial<Fermeture>;
    return {
      ...structuredClone(VIDE),
      ...lu,
      situation: { ...VIDE.situation, ...(lu.situation ?? {}) },
      societe: lu.societe ?? {},
      associes: lu.associes ?? [],
      valeurs: lu.valeurs ?? {},
      jalons: lu.jalons ?? {},
    };
  } catch {
    return structuredClone(VIDE);
  }
}

/**
 * Le libellé du dossier dans la liste.
 *
 * La phase y figure : une fermeture reste en cours des mois, et « ATELIER MARCHAND »
 * seul ne dit pas si le client attend son avis de dissolution ou sa radiation.
 */
function libelleDu(fermeture: Fermeture): string {
  const nom = fermeture.societe.denomination?.trim();
  if (!nom) return SOCIETE_A_IDENTIFIER;
  if (fermeture.voie === "tup") return nom + " - dissolution sans liquidation";
  return nom + (fermeture.phase === "cloture" ? " - clôture" : " - dissolution");
}

export async function commencerFermeture(utilisateur: UtilisateurConnecte) {
  const enAttente = await prisma.formalites.findFirst({
    where: {
      user_id: utilisateur.id,
      type: "fermeture",
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
      type: "fermeture",
      forme: "",
      societe: SOCIETE_A_IDENTIFIER,
      status: "en_cours",
      phase: 1,
      data_json: JSON.stringify(VIDE),
    },
  });

  return dossier.id;
}

export async function ouvrirFermeture(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);
  return { dossier, fermeture: lireFermeture(dossier.data_json) };
}

export async function enregistrerFermeture(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  fermeture: Fermeture
) {
  await exigerDossierModifiable(utilisateur, dossierId);

  await prisma.formalites.update({
    where: { id: dossierId },
    data: {
      data_json: JSON.stringify(fermeture),
      societe: libelleDu(fermeture),
      forme: fermeture.societe.forme?.trim() || "",
      updated_at: new Date(),
    },
  });

  return fermeture;
}

/** Modifie une partie du dossier sans écraser le reste. */
export async function completerFermeture(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  changement: Partial<Fermeture>
) {
  const { fermeture } = await ouvrirFermeture(utilisateur, dossierId);

  const fusion: Fermeture = {
    ...fermeture,
    ...changement,
    situation: { ...fermeture.situation, ...(changement.situation ?? {}) },
    societe: { ...fermeture.societe, ...(changement.societe ?? {}) },
    valeurs: { ...fermeture.valeurs, ...(changement.valeurs ?? {}) },
    jalons: { ...fermeture.jalons, ...(changement.jalons ?? {}) },
    associes: changement.associes ?? fermeture.associes,
  };

  /*
   * La voie se recalcule tant que le dossier n'est pas réglé.
   *
   * Un client qui découvre, à l'étape des chiffres, qu'il a des dettes doit sortir de
   * la voie amiable même s'il avait répondu le contraire à l'entrée. Une fois réglé, la
   * voie est figée : les actes sont produits, et en changer ferait un dossier hybride.
   */
  if (!fusion.paye && changement.situation) {
    fusion.voie = fusion.situation.dettesImpayables
      ? "liquidation-judiciaire"
      : fusion.situation.associeUniquePersonneMorale
        ? "tup"
        : "liquidation-amiable";
  }

  return enregistrerFermeture(utilisateur, dossierId, fusion);
}

/**
 * Passe le dossier à la seconde phase.
 *
 * Le franchissement est explicite, et non déduit d'une date : une liquidation peut
 * durer trois ans, et rien dans les chiffres saisis ne dit qu'elle est finie. C'est le
 * client qui déclare qu'il veut clôturer.
 */
export async function passerALaCloture(utilisateur: UtilisateurConnecte, dossierId: number) {
  const { fermeture } = await ouvrirFermeture(utilisateur, dossierId);
  if (fermeture.voie === "tup") {
    throw new Error("Une dissolution sans liquidation n'a pas de phase de clôture");
  }
  return enregistrerFermeture(utilisateur, dossierId, { ...fermeture, phase: "cloture" });
}

/* ------------------------------------------------------------- Règlement */

export async function ouvrirLeReglementDeLaFermeture(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  reference: string
) {
  await completerFermeture(utilisateur, dossierId, { paiementRef: reference });
}

/**
 * Confirme le règlement et remet la dissolution aux avocats.
 *
 * Idempotent, comme partout : Stripe réémet ses avis et le retour du client passe par
 * le même chemin.
 */
export async function confirmerLeReglementDeLaFermeture(
  reference: string,
  dossierId: number | null
) {
  const dossier = await prisma.formalites.findFirst({
    where: dossierId ? { id: dossierId } : { data_json: { contains: reference } },
  });

  if (!dossier) {
    journal.warn({ session: reference }, "Encaissement sans dossier de fermeture");
    return { dossierId: null, paye: false };
  }

  const fermeture = lireFermeture(dossier.data_json);
  if (fermeture.paye) return { dossierId: dossier.id, paye: true };

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify({ ...fermeture, paiementRef: reference, paye: true }),
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
      action: "fermeture_payee",
      after_value: reference,
    },
  });

  /*
   * Les actes suivent le paiement, comme dans les trois autres parcours.
   *
   * Ils n'étaient produits nulle part : le dossier arrivait chez l'avocat sans un
   * document, et la tâche « Produire les actes » restait à faire sans qu'aucun geste
   * ne l'accomplisse. La création, la modification et le dépôt des comptes les
   * produisent à l'encaissement depuis longtemps.
   *
   * L'échec ne défait pas le règlement : l'argent est encaissé, le dossier est confié,
   * et le cabinet peut relancer la production d'un clic.
   */
  try {
    const { produits } = await produireLesActesDeLaFermeture(dossier.id, {
      ...fermeture,
      paye: true,
    });
    journal.info(
      { dossier: dossier.id, actes: produits.length },
      "Actes de la fermeture produits après règlement"
    );
  } catch (e) {
    journal.error(
      { dossier: dossier.id, err: e },
      "Actes de la fermeture non produits après règlement"
    );
  }

  const { proposes } = await proposerAuxAvocats(dossier.id);
  return { dossierId: dossier.id, paye: true, proposes };
}

export async function confirmerFermetureAuRetour(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  session: string
): Promise<{ paye: boolean }> {
  await exigerDossierModifiable(utilisateur, dossierId);

  /*
   * Une référence de session illisible ne doit pas rendre une page d'erreur.
   *
   * Le paramètre vient de l'adresse, et une adresse se recopie, se garde en favori,
   * se rouvre le lendemain. Une session expirée, tronquée ou reprise d'un ancien lien
   * faisait remonter l'erreur de Stripe jusqu'au rendu : le client sortait de sa
   * banque, carte débitée, et tombait sur une page d'erreur. On la journalise, et l'on
   * répond « pas confirmé ici » - l'avis de Stripe confirmera de son côté, et le suivi
   * dira où en est le dossier.
   */
  let encaisse: Awaited<ReturnType<typeof relirePaiement>>;
  try {
    encaisse = await relirePaiement(session);
  } catch (e) {
    journal.warn({ err: e, session, dossier: dossierId }, "Session de paiement illisible");
    return { paye: false };
  }

  if (encaisse.dossierId !== null && encaisse.dossierId !== dossierId) {
    journal.warn({ session }, "Retour de paiement pour un autre dossier, ignoré");
    return { paye: false };
  }

  const { paye } = await confirmerLeReglementDeLaFermeture(session, dossierId);
  return { paye };
}
