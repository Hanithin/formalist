import { prisma } from "../client";
import { exigerDossierModifiable } from "./dossiers";
import { proposerAuxAvocats } from "./avocat";
import { relirePaiement } from "@/infrastructure/paiement/stripe";
import { estUnTypeConnu, type Valeurs } from "@/domain/modification/types";
import type { AssociePresent, SocieteModifiee } from "@/domain/modification/gabarit";
import type { Retouche } from "@/domain/modification/edition";
import type { Cession } from "@/domain/modification/cession";
import type { EtapeDHistorique } from "@/domain/modification/historique";
import { journal } from "@/lib/journal";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Les dossiers de modification.
 *
 * Une modification est une formalité comme une autre, avec les mêmes règles d'accès.
 * Ce qui la distingue tient dans son data_json : la société visée - qui n'est pas
 * forcément une société créée chez nous -, les changements décidés, l'assemblée qui
 * les décide, les statuts en vigueur et les retouches à y porter.
 */

export interface StatutsDuDossier {
  /** D'où vient le document : le registre, ou un dépôt du client. */
  source: "inpi" | "depot";
  /** Identifiant de l'acte au registre, quand il en vient. */
  acteId?: string;
  /** Date de dépôt au registre, en ISO. */
  deposeLe?: string | null;
  nature?: string;
  /** Le client a confirmé que c'est bien la version en vigueur. */
  confirmeLe?: string;
  /** Nom du document déposé, quand il vient du client. */
  fichier?: string;
}

export interface Modification {
  codes: string[];
  societe: SocieteModifiee;
  valeurs: Valeurs;
  assemblee: { date?: string | null; associes?: AssociePresent[] };
  /**
   * Les cessions de parts décidées.
   *
   * Hors de `valeurs`, qui ne porte que des chaînes et des nombres : une cession
   * désigne des associés par leur rang et se compte à plusieurs dans une assemblée.
   */
  cessions?: Cession[];
  statuts?: StatutsDuDossier;
  retouches?: Retouche[];
  /**
   * Les pages écartées des statuts à jour.
   *
   * Des statuts déposés portent parfois une page de garde du greffe, un bordereau ou
   * une page blanche que le dépôt suivant n'a pas à reprendre.
   */
  pagesRetirees?: number[];
  /**
   * Les états successifs des retouches, pour revenir en arrière.
   *
   * Chaque étape porte un état complet et dit qui l'a posée et quand. Persisté avec
   * le dossier plutôt que gardé en mémoire : une fausse manœuvre se rattrape encore
   * le lendemain, et l'avocat voit ce que le client avait fait avant lui.
   */
  historique?: EtapeDHistorique[];
  positionHistorique?: number;
  /** Les changements que le cabinet certifie faits. */
  verifiees?: string[];
  /** Les statuts retouchés ont été produits et joints au dossier. */
  statutsAJour?: boolean;
  /**
   * Le cabinet a publié les avis.
   *
   * Une création attend l'attestation de parution que le client dépose ; ici c'est
   * nous qui publions, et il n'y a personne pour déposer quoi que ce soit. La
   * publication se déclare donc, et c'est elle qui fait avancer le suivi du client.
   */
  avisPublies?: boolean;
  paiementRef?: string;
  paye?: boolean;
}

const VIDE: Modification = {
  codes: [],
  societe: {},
  valeurs: {},
  assemblee: {},
};

export function lireModification(dataJson: string | null): Modification {
  if (!dataJson) return { ...VIDE };
  try {
    const lu = JSON.parse(dataJson) as Partial<Modification>;
    return {
      ...VIDE,
      ...lu,
      // Un code inconnu viendrait d'une version antérieure ou d'une saisie forgée :
      // le garder ferait échouer la production d'actes sans dire pourquoi.
      codes: (lu.codes ?? []).filter(estUnTypeConnu),
      societe: lu.societe ?? {},
      valeurs: lu.valeurs ?? {},
      assemblee: lu.assemblee ?? {},
    };
  } catch {
    return { ...VIDE };
  }
}

/** Ouvre un dossier de modification, vide. La société se choisit à la première étape. */
export async function commencerModification(utilisateur: UtilisateurConnecte) {
  const equipe = await prisma.team_members.findFirst({
    where: { user_id: utilisateur.id },
    select: { team_id: true },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: utilisateur.id,
      team_id: equipe?.team_id ?? null,
      type: "modification",
      /*
       * La société n'est pas encore choisie : c'est la première étape du parcours.
       * Les deux colonnes ne sont pas nullables et sont ce que lisent la liste des
       * dossiers et l'espace avocat, d'où ces valeurs d'attente, remplacées dès
       * l'enregistrement de la société.
       */
      forme: "",
      societe: "Société à identifier",
      status: "en_cours",
      phase: 1,
      data_json: JSON.stringify(VIDE),
    },
  });

  return dossier.id;
}

export async function ouvrirModification(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);
  return { dossier, modification: lireModification(dossier.data_json) };
}

/**
 * Enregistre l'état du dossier.
 *
 * La dénomination et la forme sont recopiées dans les colonnes de la formalité :
 * c'est ce que lisent la liste des dossiers et l'espace avocat, qui n'ouvrent pas le
 * JSON.
 */
export async function enregistrerModification(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  modification: Modification
) {
  await exigerDossierModifiable(utilisateur, dossierId);

  await prisma.formalites.update({
    where: { id: dossierId },
    data: {
      data_json: JSON.stringify(modification),
      societe: modification.societe.denomination?.trim() || "Société à identifier",
      forme: modification.societe.forme?.trim() || "",
      updated_at: new Date(),
    },
  });

  return modification;
}

/** Modifie une partie du dossier sans écraser le reste. */
export async function completerModification(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  changement: Partial<Modification>
) {
  const { modification } = await ouvrirModification(utilisateur, dossierId);
  return enregistrerModification(utilisateur, dossierId, { ...modification, ...changement });
}

/* ------------------------------------------------------------- Règlement */

/**
 * La référence de paiement est posée avant le renvoi chez Stripe : au retour, c'est
 * elle qui relie la session au dossier.
 */
export async function ouvrirLeReglement(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  reference: string
) {
  await completerModification(utilisateur, dossierId, { paiementRef: reference });
}

/**
 * Confirme le règlement et remet le dossier aux avocats.
 *
 * Idempotent : Stripe réémet ses avis, et le retour du client passe par le même
 * chemin. Un dossier déjà transmis ne doit pas repartir une seconde fois dans la file.
 */
export async function confirmerLeReglement(reference: string, dossierId: number | null) {
  const dossier = await prisma.formalites.findFirst({
    where: dossierId ? { id: dossierId } : { data_json: { contains: reference } },
  });

  if (!dossier) {
    journal.warn({ session: reference }, "Encaissement sans dossier de modification");
    return { dossierId: null, paye: false };
  }

  const modification = lireModification(dossier.data_json);
  if (modification.paye) return { dossierId: dossier.id, paye: true };

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify({ ...modification, paiementRef: reference, paye: true }),
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
      action: "modification_payee",
      after_value: reference,
    },
  });

  const { proposes } = await proposerAuxAvocats(dossier.id);
  return { dossierId: dossier.id, paye: true, proposes };
}

/**
 * Confirme le règlement au retour du client.
 *
 * Le paiement est relu auprès de Stripe plutôt que cru sur parole : le paramètre vient
 * de l'adresse, et une adresse se recopie. C'est aussi ce qui rend la confirmation
 * indépendante du relais, qui peut arriver en retard - ou jamais.
 */
export async function confirmerAuRetour(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  session: string
): Promise<{ paye: boolean }> {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);

  const encaissement = await relirePaiement(session);
  if (encaissement.dossierId !== null && encaissement.dossierId !== dossier.id) {
    journal.warn({ session }, "Retour de paiement pour un autre dossier, ignoré");
    return { paye: false };
  }

  const resultat = await confirmerLeReglement(session, dossier.id);
  return { paye: resultat.paye };
}
