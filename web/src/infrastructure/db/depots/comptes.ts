import { prisma } from "../client";
import { exigerDossierModifiable } from "./dossiers";
import { proposerAuxAvocats } from "./avocat";
import { relirePaiement } from "@/infrastructure/paiement/stripe";
import { affectationProposee, type Affectation } from "@/domain/comptes/regles";
import type { CleExclusion } from "@/domain/comptes/confidentialite";
import type { Convention } from "@/domain/comptes/conventions";
import type { AssociePresent, SocieteApprouvante } from "@/domain/comptes/gabarit";
import { journal } from "@/lib/journal";
import type { UtilisateurConnecte } from "../sessions";
import { SOCIETE_A_IDENTIFIER } from "@/domain/formalite/liste";

/**
 * Les dossiers d'approbation des comptes.
 *
 * Une formalité comme les autres, avec les mêmes règles d'accès. Ce qui la distingue
 * tient dans son data_json : l'exercice à approuver, les chiffres qui en sortent,
 * l'affectation décidée, les conventions à déclarer et la confidentialité demandée.
 *
 * Elle revient chaque année. C'est pourquoi la dénomination et la forme sont recopiées
 * dans les colonnes de la formalité : la liste des dossiers doit distinguer d'un coup
 * d'œil l'exercice 2025 de l'exercice 2024 de la même société.
 */

export interface Comptes {
  societe: SocieteApprouvante;
  associes: AssociePresent[];
  valeurs: Record<string, string | number | undefined>;
  affectation: Affectation;
  conventions: Convention[];
  exclusions: CleExclusion[];
  /** La confidentialité se demande : elle ne s'impose pas à qui n'en veut pas. */
  demandeLaConfidentialite: boolean;
  /** Le bilan déposé, dont les chiffres ont été extraits. */
  bilan?: { fichier: string; deposeLe: string } | null;
  /** Les champs remplis par l'extraction, pour que l'écran dise d'où ils viennent. */
  extraits?: string[];
  paiementRef?: string;
  paye?: boolean;
}

const VIDE: Comptes = {
  societe: {},
  associes: [],
  valeurs: {},
  affectation: {
    reserveLegaleCentimes: 0,
    autresReservesCentimes: 0,
    dividendesCentimes: 0,
    reportANouveauCentimes: 0,
  },
  conventions: [],
  exclusions: [],
  demandeLaConfidentialite: false,
};

/**
 * La dénomination d'attente, tant que la société n'est pas choisie.
 *
 * Elle sert de marqueur autant que d'affichage : c'est à elle qu'on reconnaît un
 * dossier resté sur la ligne de départ, et qu'on reprend au lieu d'en ouvrir un second.
 */

/**
 * Le dirigeant, repris en trois champs.
 *
 * Il se saisissait sur une ligne libre - « Monsieur Paul DURAND » - et se saisit
 * désormais en civilité, prénom et nom. Les dossiers commencés avant portent l'ancienne
 * valeur : on la découpe à la lecture, plutôt que de rendre un formulaire vide à qui
 * l'avait déjà rempli. Le découpage est simple parce que la saisie l'était : une
 * civilité en tête si elle y figure, un prénom, et le reste pour le nom.
 */
function dirigeantEnTroisChamps(valeurs: Comptes["valeurs"]): Comptes["valeurs"] {
  const ancien = typeof valeurs.dirigeantNom === "string" ? valeurs.dirigeantNom.trim() : "";
  if (!ancien || valeurs.dirigeantNomFamille) return valeurs;

  const mots = ancien.split(/\s+/);
  const civilite = /^(monsieur|madame)$/i.test(mots[0] ?? "")
    ? mots[0].replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase())
    : "";
  const reste = civilite ? mots.slice(1) : mots;

  return {
    ...valeurs,
    dirigeantCivilite: valeurs.dirigeantCivilite || civilite,
    dirigeantPrenom: valeurs.dirigeantPrenom || (reste.length > 1 ? reste[0] : ""),
    dirigeantNomFamille: reste.length > 1 ? reste.slice(1).join(" ") : reste.join(" "),
  };
}

export function lireComptes(dataJson: string | null): Comptes {
  if (!dataJson) return structuredClone(VIDE);
  try {
    const lu = JSON.parse(dataJson) as Partial<Comptes>;
    return {
      ...structuredClone(VIDE),
      ...lu,
      societe: lu.societe ?? {},
      associes: lu.associes ?? [],
      valeurs: dirigeantEnTroisChamps(lu.valeurs ?? {}),
      affectation: lu.affectation ?? structuredClone(VIDE.affectation),
      conventions: lu.conventions ?? [],
      exclusions: lu.exclusions ?? [],
    };
  } catch {
    return structuredClone(VIDE);
  }
}

/**
 * Le libellé d'un dossier dans la liste.
 *
 * « ATELIER MARCHAND » ne suffit pas quand la même société y figure trois fois : c'est
 * l'exercice qui distingue les dossiers d'une formalité annuelle.
 */
function libelleDu(comptes: Comptes): string {
  const nom = comptes.societe.denomination?.trim();
  if (!nom) return SOCIETE_A_IDENTIFIER;

  const cloture = String(comptes.valeurs.dateCloture ?? "").slice(0, 4);
  return cloture ? nom + " - exercice " + cloture : nom;
}

/**
 * Ouvre un dossier d'approbation, ou reprend celui resté sur la ligne de départ.
 *
 * Sans cette reprise, ouvrir l'écran trois fois laisserait trois dossiers vides dans
 * la liste des formalités, sans moyen de savoir lequel reprendre.
 */
export async function commencerComptes(utilisateur: UtilisateurConnecte) {
  const enAttente = await prisma.formalites.findFirst({
    where: {
      user_id: utilisateur.id,
      type: "comptes",
      status: "en_cours",
      phase: 1,
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
      type: "comptes",
      forme: "",
      societe: SOCIETE_A_IDENTIFIER,
      status: "en_cours",
      phase: 1,
      data_json: JSON.stringify(VIDE),
    },
  });

  return dossier.id;
}

export async function ouvrirComptes(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);
  return { dossier, comptes: lireComptes(dossier.data_json) };
}

export async function enregistrerComptes(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  comptes: Comptes
) {
  await exigerDossierModifiable(utilisateur, dossierId);

  await prisma.formalites.update({
    where: { id: dossierId },
    data: {
      data_json: JSON.stringify(comptes),
      societe: libelleDu(comptes),
      forme: comptes.societe.forme?.trim() || "",
      updated_at: new Date(),
    },
  });

  return comptes;
}

/** Modifie une partie du dossier sans écraser le reste. */
export async function completerComptes(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  changement: Partial<Comptes>
) {
  const { comptes } = await ouvrirComptes(utilisateur, dossierId);
  const fusion = { ...comptes, ...changement };

  /*
   * L'affectation suit les chiffres tant qu'on n'y a pas touché.
   *
   * Saisir un résultat puis découvrir une affectation restée à zéro oblige à la
   * recalculer de tête, alors que la loi en impose déjà la plus grande part. Dès que
   * l'écran envoie une affectation, c'est celle-là qui vaut.
   */
  if (changement.valeurs && !changement.affectation) {
    const nb = (v: unknown) => {
      const lu = Number(String(v ?? "").replace(",", "."));
      return Number.isFinite(lu) ? lu : 0;
    };
    fusion.affectation = affectationProposee({
      forme: fusion.societe.forme,
      resultatCentimes: Math.round(nb(fusion.valeurs.resultat) * 100),
      reportAnterieurCentimes: Math.round(nb(fusion.valeurs.reportAnterieur) * 100),
      capitalCentimes: Math.round((fusion.societe.capital ?? 0) * 100),
      reserveExistanteCentimes: Math.round(nb(fusion.valeurs.reserveLegale) * 100),
    });
  }

  return enregistrerComptes(utilisateur, dossierId, fusion);
}

/* ------------------------------------------------------------- Règlement */

export async function ouvrirLeReglementDesComptes(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  reference: string
) {
  await completerComptes(utilisateur, dossierId, { paiementRef: reference });
}

/**
 * Confirme le règlement et remet le dossier aux avocats.
 *
 * Idempotent : Stripe réémet ses avis, et le retour du client passe par le même
 * chemin. Un dossier déjà transmis ne doit pas repartir une seconde fois dans la file.
 */
export async function confirmerLeReglementDesComptes(
  reference: string,
  dossierId: number | null
) {
  const dossier = await prisma.formalites.findFirst({
    where: dossierId ? { id: dossierId } : { data_json: { contains: reference } },
  });

  if (!dossier) {
    journal.warn({ session: reference }, "Encaissement sans dossier de comptes");
    return { dossierId: null, paye: false };
  }

  const comptes = lireComptes(dossier.data_json);
  if (comptes.paye) return { dossierId: dossier.id, paye: true };

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify({ ...comptes, paiementRef: reference, paye: true }),
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
      action: "comptes_payes",
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
 * de l'adresse, et une adresse se recopie.
 */
export async function confirmerComptesAuRetour(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  session: string
): Promise<{ paye: boolean }> {
  await exigerDossierModifiable(utilisateur, dossierId);

  const encaisse = await relirePaiement(session);
  if (!encaisse) return { paye: false };

  const { paye } = await confirmerLeReglementDesComptes(session, dossierId);
  return { paye };
}
