import { prisma } from "../client";
import { exigerDossier, exigerDossierModifiable } from "./dossiers";
import { ETAPES, premiereEtapeIncomplete, type Brouillon } from "@/domain/formalite/parcours";
import { nombreDEtapes } from "@/domain/formalite/etapes";
import { monteeEnOffrePermise } from "@/domain/formalite/transitions";
import { motifDuRefus, phraseDuRefus } from "@/domain/formalite/suppression";
import { effacerPieces } from "@/infrastructure/documents/depot";
import { Interdit } from "../utilisateur-courant";
import { regle } from "@/domain/formalite/formes";
import { journal } from "@/lib/journal";
import { proposerAuxAvocats } from "./avocat";
import { produireLesActesDuBrouillon } from "@/infrastructure/documents/actes";
import { relirePaiement } from "@/infrastructure/paiement/stripe";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Le brouillon d'une formalité.
 *
 * Il est stocké dans data_json du dossier, comme le fait déjà le serveur
 * d'origine - mais côté serveur cette fois, et non dans le navigateur. Le travail
 * ne se perd plus en changeant d'appareil, et les pièces déposées ont enfin un
 * propriétaire connu du serveur.
 */

export function lireBrouillon(dataJson: string | null): Brouillon {
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

/**
 * Le dossier se dit-il payé ?
 *
 * Les cinq parcours qui encaissent - auto-entreprise, modification, dépôt des
 * comptes, fermeture, cessation - posent `paye: true` dans le brouillon au moment de
 * la confirmation. La création n'encaisse pas encore : son brouillon ne porte jamais
 * ce drapeau, et c'est son statut qui dit s'il a quitté les mains du client.
 *
 * Un brouillon illisible est tenu pour payé : c'est le sens qui protège. Mieux vaut
 * refuser une suppression légitime que d'effacer un dossier réglé sur une erreur de
 * lecture.
 */
export function paiementDuBrouillon(dataJson: string | null): boolean {
  if (!dataJson) return false;
  try {
    const brouillon: unknown = JSON.parse(dataJson);
    if (!brouillon || typeof brouillon !== "object") return false;
    return (brouillon as { paye?: unknown }).paye === true;
  } catch {
    return true;
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
/**
 * Une relecture porte sur ce qui était écrit ce jour-là.
 *
 * Le client reste propriétaire de son dossier après l'avoir transmis : il peut y
 * revenir, et il le doit quand on lui demande des corrections. La fusion conservait
 * `revue` telle quelle, si bien que la case « J'ai vérifié les informations » restait
 * cochée sur un capital ou un siège modifiés depuis - et l'avancement continuait de
 * compter la vérification comme faite.
 *
 * Une écriture qui ne vient pas du relecteur la retire. L'avocat la recoche d'un
 * clic ; ce qui compte est qu'il la revoie.
 */
function relectureTenue(
  brouillon: Brouillon,
  utilisateur: UtilisateurConnecte
): Partial<Brouillon> {
  const revue = (brouillon as { revue?: { informations?: boolean; par?: number } }).revue;
  if (!revue?.informations || revue.par === utilisateur.id) return {};

  return { revue: { ...revue, informations: false } } as Partial<Brouillon>;
}

export async function enregistrerBrouillon(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  modifications: Partial<Brouillon>
) {
  const { dossier, brouillon } = await ouvrirBrouillon(utilisateur, dossierId);
  const fusionne: Brouillon = { ...brouillon, ...modifications, ...relectureTenue(brouillon, utilisateur) };

  // La dénomination et la forme sont recopiées dans leurs colonnes : les listes
  // et l'espace avocat les lisent là, sans avoir à ouvrir le brouillon.
  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify(fusionne),
      societe: fusionne.denomination ?? dossier.societe,
      forme: regle(fusionne.forme) ? fusionne.forme! : dossier.forme,
      offer: fusionne.offre ?? dossier.offer,
      // Deux échelles se croisent ici : le formulaire compte sept étapes, le cycle
      // de vie du dossier cinq ou six selon l'offre - c'est cette seconde que
      // lisent le tableau de bord et l'espace avocat. La progression du formulaire
      // est donc bornée, sans quoi la vignette annonçait « Étape 7 sur 6 ».
      phase: Math.min(
        premiereEtapeIncomplete(fusionne) ?? ETAPES.length,
        nombreDEtapes(fusionne.offre)
      ),
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

/**
 * Le client transmet son dossier à l'avocat.
 *
 * Ce geste n'existait nulle part : seul `changerEtatDossier` fait passer un dossier
 * de « en cours » à « en attente de validation », et il exige d'être avocat. Le
 * dossier restait donc en cours indéfiniment, quoi que le client fasse.
 *
 * Une fois transmis, il est proposé à tous les avocats : le premier qui l'accepte le
 * prend. Un dossier déjà pris n'est pas reproposé.
 */
export async function transmettreALAvocat(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);

  if (dossier.status !== "en_cours" && dossier.status !== "corrections_demandees") {
    return { deja: true as const, etat: dossier.status };
  }

  // Un dossier incomplet ne se transmet pas : l'avocat relirait des blancs.
  const brouillon = lireBrouillon(dossier.data_json);
  const bloquante = premiereEtapeIncomplete(brouillon);
  if (bloquante !== null && bloquante < 5) {
    throw new DossierIncompletPourTransmission(bloquante);
  }

  await prisma.formalites.update({
    where: { id: dossierId },
    data: {
      status: "en_attente_validation",
      phase: Math.max(dossier.phase ?? 1, 5),
      updated_at: new Date(),
    },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: "user",
      action: "dossier_transmis",
      before_value: dossier.status,
      after_value: "en_attente_validation",
    },
  });

  const { proposes } = await proposerAuxAvocats(dossierId);
  return { deja: false as const, proposes };
}

/**
 * Le client ouvre le règlement de sa création.
 *
 * La référence de session est notée dans le brouillon avant le départ chez Stripe :
 * c'est par elle que le relais retrouve le dossier si les métadonnées venaient à
 * manquer, et c'est elle qui rend la confirmation idempotente.
 */
export async function ouvrirLeReglementDeLaCreation(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  reference: string
) {
  await enregistrerBrouillon(utilisateur, dossierId, { paiementRef: reference });
}

/**
 * Confirme le règlement d'une création, produit ses actes et confie le dossier.
 *
 * Les quatre autres parcours payants font déjà exactement cela ; la création était la
 * seule à ne pas encaisser, et son brouillon ne portait jamais `paye`.
 *
 * Idempotent : Stripe réémet ses avis, et le retour du client passe par le même
 * chemin. Un dossier déjà confié ne doit pas repartir une seconde fois dans la file.
 */
export async function confirmerLeReglementDeLaCreation(
  reference: string,
  dossierId: number | null
) {
  const dossier = await prisma.formalites.findFirst({
    where: dossierId ? { id: dossierId } : { data_json: { contains: reference } },
  });

  if (!dossier) {
    journal.warn({ session: reference }, "Encaissement sans dossier de création");
    return { dossierId: null, paye: false };
  }

  const brouillon = lireBrouillon(dossier.data_json);
  if (brouillon.paye) return { dossierId: dossier.id, paye: true };

  const regle: Brouillon = { ...brouillon, paiementRef: reference, paye: true };

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify(regle),
      status: "en_attente_validation",
      phase: Math.max(dossier.phase ?? 1, 5),
      updated_at: new Date(),
    },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossier.id,
      actor_id: dossier.user_id,
      actor_role: "user",
      action: "creation_payee",
      after_value: reference,
    },
  });

  /*
   * Les actes sont produits à l'encaissement, non par un clic du client.
   *
   * Un échec ne remet pas le paiement en cause : l'argent est encaissé, le dossier est
   * confié, et les actes se régénèrent d'un clic côté cabinet. Refuser la confirmation
   * ici laisserait un dossier payé mais non transmis, ce qui est bien pire qu'un
   * dossier transmis sans ses actes.
   */
  try {
    await produireLesActesDuBrouillon(dossier.id, regle, { aRelire: true });
  } catch (e) {
    journal.error({ err: e, dossier: dossier.id }, "Actes de création non produits à l'encaissement");
  }

  const { proposes } = await proposerAuxAvocats(dossier.id);
  return { dossierId: dossier.id, paye: true, proposes };
}

/**
 * Confirme le règlement au retour du client.
 *
 * Le paiement est relu auprès de Stripe plutôt que cru sur parole : le paramètre vient
 * de l'adresse, et une adresse se recopie. C'est aussi ce qui rend la confirmation
 * indépendante du relais, qui peut arriver en retard - ou jamais, en développement où
 * personne n'écoute Stripe.
 *
 * Le dossier est lu, non ouvert en modification : après confirmation il n'est plus
 * modifiable, et recharger la page d'arrivée referait le même appel. Exiger un dossier
 * modifiable transformerait ce rafraîchissement en page d'erreur.
 */
export async function confirmerAuRetourDeLaCreation(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  session: string
): Promise<{ paye: boolean }> {
  const dossier = await exigerDossier(utilisateur, dossierId);

  /*
   * Une session illisible ne casse pas la page où l'on revient : une session expirée
   * ou recopiée d'un ancien lien ferait remonter l'erreur de Stripe jusqu'au rendu, et
   * l'écran d'arrivée après paiement serait une page d'erreur.
   */
  let encaissement: Awaited<ReturnType<typeof relirePaiement>>;
  try {
    encaissement = await relirePaiement(session);
  } catch (e) {
    journal.warn({ err: e, session, dossier: dossier.id }, "Session de paiement illisible");
    return { paye: false };
  }

  if (encaissement.dossierId !== null && encaissement.dossierId !== dossier.id) {
    journal.warn({ session }, "Retour de paiement pour un autre dossier, ignoré");
    return { paye: false };
  }

  const resultat = await confirmerLeReglementDeLaCreation(session, dossier.id);
  return { paye: resultat.paye };
}

export class DossierIncompletPourTransmission extends Error {
  constructor(readonly etape: number) {
    super("Le dossier est incomplet");
  }
}

/**
 * Le client retire un brouillon qu'il n'a jamais transmis.
 *
 * La règle est dans `estSupprimable`, et elle est revérifiée ici sur les lignes
 * réelles : la liste qui a montré la corbeille a été rendue à un instant donné, et le
 * dossier a pu être réglé depuis un autre onglet entre-temps. Le brouillon dit ce
 * qu'il croit du paiement ; `payments` et `signature_requests` disent ce qui s'est
 * vraiment passé, et ce sont eux qui tranchent.
 *
 * Les clés étrangères sont posées en `NoAction` : les lignes filles partent d'abord,
 * dans une transaction, sans quoi Postgres refuse la suppression du dossier. Ce qui
 * survit est la ligne d'audit, écrite avec `formalite_id` à nul - la colonne
 * l'admet - car une suppression dont il ne reste aucune trace n'en est pas une.
 */
export async function supprimerBrouillon(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);

  const [reglements, signatures] = await Promise.all([
    prisma.payments.count({ where: { formalite_id: dossierId, status: "paid" } }),
    prisma.signature_requests.count({ where: { formalite_id: dossierId } }),
  ]);

  const motif = motifDuRefus({
    statut: dossier.status,
    avocatAssigneId: dossier.assigned_avocat_id,
    finaliseLe: dossier.finalized_at,
    paye: paiementDuBrouillon(dossier.data_json),
    aUnReglement: reglements > 0,
    aUneSignature: signatures > 0,
  });

  if (motif) throw new Interdit(phraseDuRefus(motif));

  // Les chemins sont relevés avant la transaction : après elle, plus rien ne dit
  // quels fichiers appartenaient à ce dossier.
  const documents = await prisma.documents.findMany({
    where: { formalite_id: dossierId },
    select: { file_path: true, source_path: true },
  });
  const depots = await prisma.uploaded_files.findMany({
    where: { formalite_id: dossierId },
    select: { filename: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.documents.deleteMany({ where: { formalite_id: dossierId } });
    await tx.uploaded_files.deleteMany({ where: { formalite_id: dossierId } });
    await tx.messages.deleteMany({ where: { formalite_id: dossierId } });
    await tx.notifications.deleteMany({ where: { formalite_id: dossierId } });
    await tx.team_notes.deleteMany({ where: { formalite_id: dossierId } });
    await tx.signature_requests.deleteMany({ where: { formalite_id: dossierId } });
    /*
     * Les règlements non aboutis partent avec le dossier.
     *
     * Il n'en reste ici que des tentatives abandonnées - une session Stripe ouverte
     * puis fermée : `estSupprimable` a déjà écarté tout dossier portant un paiement
     * encaissé, et le montant réel vit chez Stripe, non dans cette table.
     */
    await tx.payments.deleteMany({ where: { formalite_id: dossierId } });
    await tx.audit_log.deleteMany({ where: { formalite_id: dossierId } });
    await tx.formalites.delete({ where: { id: dossierId } });
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: null,
      actor_id: utilisateur.id,
      actor_role: "user",
      action: "brouillon_supprime",
      // Le dossier n'existe plus : la ligne dit lequel, et ce qu'il portait.
      before_value: JSON.stringify({
        dossier: dossierId,
        type: dossier.type,
        societe: dossier.societe,
      }),
    },
  });

  await effacerPieces([
    ...documents.flatMap((d) => [d.file_path, d.source_path]),
    ...depots.map((f) => f.filename),
  ]);

  return { supprime: dossierId };
}
