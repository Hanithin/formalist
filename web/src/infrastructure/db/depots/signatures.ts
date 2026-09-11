import { prisma } from "../client";
import { desActesEnRelecture, typesDeposes } from "./suivi";
import { piecesAttendues, PIECE_DEPOT_CAPITAL } from "@/domain/formalite/documents";
import { estClos } from "@/domain/acces/regles";
import { exigerDossier, exigerDossierModifiable } from "./dossiers";
import {
  etatDemande,
  jalonDeLEnvoi,
  peutRelancer,
  toutLeMondeASigne,
  verifierTrace,
  MOTIF_REJET,
  PREFIXE_PNG,
  PHASE_APRES_SIGNATURE,
  type DemandeSignature,
  type SuiviDemande,
} from "@/domain/formalite/signature";
import { jeton } from "@/lib/mots-de-passe";
import type { UtilisateurConnecte } from "../sessions";
import { emailDeSignature } from "@/infrastructure/mail/envoi";
import { journal } from "@/lib/journal";
import type { AvisDeResend } from "@/infrastructure/mail/evenements";

/**
 * Demandes de signature.
 *
 * Les associés n'ont pas de compte : leur jeton est leur seule preuve. Il est donc
 * long, à usage unique, et l'ouverture d'un lien ne révèle que ce qu'il y a à
 * signer - ni le dossier complet, ni les autres signataires.
 */

function versDemande(ligne: {
  id: number;
  associe_name: string;
  associe_email: string | null;
  opened_at: Date | null;
  signed_at: Date | null;
}): DemandeSignature {
  return {
    id: ligne.id,
    nom: ligne.associe_name,
    email: ligne.associe_email ?? "",
    ouverteLe: ligne.opened_at,
    signeeLe: ligne.signed_at,
  };
}

/** La même demande, avec ce que l'on sait du courriel qui la porte. */
function versSuivi(ligne: {
  id: number;
  associe_name: string;
  associe_email: string | null;
  opened_at: Date | null;
  signed_at: Date | null;
  envoye_le: Date | null;
  remis_le: Date | null;
  mail_ouvert_le: Date | null;
  envoi_motif: string | null;
  relances: number;
}): SuiviDemande {
  return {
    ...versDemande(ligne),
    envoyeLe: ligne.envoye_le,
    remisLe: ligne.remis_le,
    mailOuvertLe: ligne.mail_ouvert_le,
    motif: ligne.envoi_motif,
    relances: ligne.relances,
  };
}

/**
 * L'état du circuit de signature, tel que l'écran le montre.
 *
 * Ces lignes existaient et personne ne les lisait : l'écran annonçait « chacun reçoit
 * son lien par email » et se taisait ensuite. Le client qui attendait une signature
 * n'avait ni le moyen de savoir où en était chacun, ni celui de relancer.
 */
export async function demandesDuDossier(utilisateur: UtilisateurConnecte, dossierId: number) {
  await exigerDossier(utilisateur, dossierId);

  const lignes = await prisma.signature_requests.findMany({
    where: { formalite_id: dossierId },
    orderBy: [{ associe_index: "asc" }, { id: "asc" }],
  });

  /*
   * Une ligne par personne, et c'est la signature qui l'emporte.
   *
   * Une même place peut porter plusieurs demandes : relancer le circuit n'efface que
   * les demandes non signées - on ne détruit pas la trace d'une signature recueillie -
   * et laisse donc, à côté d'elle, les précédentes. L'écran prenait la première venue
   * et annonçait « Pas encore envoyé » à quelqu'un dont la signature figurait déjà sur
   * les actes.
   */
  const parPlace = new Map<number, (typeof lignes)[number]>();
  for (const ligne of lignes) {
    const retenue = parPlace.get(ligne.associe_index);
    if (!retenue || (!retenue.signed_at && ligne.signed_at))
      parPlace.set(ligne.associe_index, ligne);
  }

  return [...parPlace.values()].map((l) => {
    const suivi = versSuivi(l);
    return {
      ...suivi,
      rang: l.associe_index,
      role: l.role,
      etat: etatDemande(suivi),
      jalon: jalonDeLEnvoi(suivi),
      relancable: peutRelancer(suivi),
    };
  });
}

/** Ouvre le circuit : une demande par associé. */
/** La forme du dossier : la colonne d'abord, le brouillon à défaut. */
function formeDuDossier(dossier: { forme: string | null; data_json: string | null } | null) {
  if (dossier?.forme) return dossier.forme;
  try {
    const lu: unknown = JSON.parse(dossier?.data_json ?? "{}");
    if (lu && typeof lu === "object") return (lu as { forme?: string }).forme ?? null;
  } catch {
    /* Un brouillon illisible ne dit rien de la forme : on s'en tient à la colonne. */
  }
  return null;
}

/**
 * Poste le lien de signature, et inscrit ce qu'il en advient.
 *
 * Le circuit créait le jeton et postait le message sans rien en garder : ni la date de
 * l'envoi, ni l'identifiant que rend le fournisseur, ni le motif de son refus. L'écran
 * annonçait « chacun reçoit son lien par email » et le journal, seul, savait que rien
 * n'était parti - or personne ne lit le journal en attendant une signature.
 *
 * Un envoi manqué n'annule pas la demande : le jeton reste valable, l'écran dit ce qui
 * n'est pas parti, et le bouton de relance le reprend.
 */
async function adresserLaDemande(
  demande: { id: number; token: string | null; associe_name: string; associe_email: string | null },
  societe: string
) {
  /* Sans jeton, le lien mènerait à une page introuvable : mieux vaut ne rien envoyer et
     le dire que poster une porte close. */
  const envoi = demande.token
    ? await emailDeSignature(
        demande.associe_name ?? "",
        demande.associe_email ?? "",
        demande.token,
        societe
      )
    : { ok: false as const, motif: "aucun jeton" };

  const simule = envoi.ok && "simule" in envoi && !!envoi.simule;

  /*
   * Sans clé d'envoi, ce n'est pas la même chose ici et là-bas.
   *
   * En développement, c'est le fonctionnement normal : aucune clé n'est configurée,
   * rien ne doit partir, et la demande est aussi aboutie qu'elle peut l'être - le jeton
   * existe, le lien fonctionne, le message se relit dans le journal. La ligne dit
   * « Envoyé », et la note sous le bloc dit pourquoi rien n'a quitté la machine.
   *
   * En production, c'est une panne, et de celles qui ne se voient pas : les demandes
   * partent en apparence, personne ne reçoit rien, et le client attend des signatures
   * qui ne viendront jamais. Elle se dit donc comme un échec, sur la ligne concernée.
   */
  const enPanne = simule && process.env.NODE_ENV === "production";
  const parti = envoi.ok && !enPanne;

  /*
   * Le motif porte trois choses distinctes, et c'est voulu.
   *
   * « simule » n'est pas une panne : en développement, aucune clé n'est configurée et
   * rien ne doit partir. L'écran l'affichait pourtant en rouge, avec « Prévenez le
   * cabinet » - un message alarmant pour un fonctionnement normal. Un refus du
   * fournisseur, lui, porte sa propre phrase, et c'est elle qui dit quoi corriger.
   */
  await prisma.signature_requests.update({
    where: { id: demande.id },
    data: {
      envoye_le: new Date(),
      message_id: "identifiant" in envoi ? (envoi.identifiant ?? null) : null,
      envoi_motif: parti
        ? null
        : enPanne
          ? "aucune clé d'envoi n'est configurée sur le serveur"
          : (envoi.motif ?? "envoi refusé"),
      /* Une relance efface ce que le précédent envoi avait rapporté : ces dates
         parlaient d'un message qui n'est plus celui qu'on attend. */
      remis_le: null,
      mail_ouvert_le: null,
      /* `status` n'est pas touché ici. Il ne porte que trois valeurs - pending, opened,
         signed - qu'une contrainte de la base impose, et rien ne le lit : ce sont les
         dates qui disent où en est une demande. Y écrire « sent » ou « delivered »
         demanderait d'élargir cette contrainte pour une colonne redondante, qui se
         mettrait à diverger des dates au premier oubli. */
    },
  });

  if (!parti) {
    journal.warn(
      { demande: demande.id, motif: envoi.motif },
      "Demande de signature créée, courriel non parti"
    );
  }

  return { parti, simule, motif: parti ? null : (envoi.motif ?? "envoi refusé") };
}

export async function demanderSignatures(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  signataires: { nom: string; email: string; role?: string }[]
) {
  await exigerDossierModifiable(utilisateur, dossierId);

  /*
   * On ne signe pas un acte que l'avocat n'a pas rendu.
   *
   * L'écran désactivait déjà le bouton, mais un écran se contourne : la demande de
   * signature part par courriel avec un jeton d'accès, et un acte encore en relecture
   * serait signé avant que quiconque l'ait lu - or c'est la relecture qui en fait un
   * document signable.
   *
   * C'est ainsi que l'avocat accorde la mise en signature : en validant les actes.
   */
  /* Une société immatriculée ne signe plus ses statuts constitutifs. */
  const clos = await prisma.formalites.findUnique({
    where: { id: dossierId },
    select: { status: true },
  });
  if (estClos(clos?.status)) {
    throw new SignatureRetenue("Ce dossier est clos : il n'y a plus rien à signer.");
  }

  if (await desActesEnRelecture(dossierId)) {
    throw new SignatureRetenue(
      "Vos actes sont en relecture chez l'avocat. La signature s'ouvrira dès qu'il les aura validés."
    );
  }

  /*
   * On ne signe pas non plus des statuts datés d'avant le capital.
   *
   * L'écran cache tout le bloc de signature tant que l'attestation de dépôt n'est pas
   * au dossier - c'est elle qui date les actes du jour où la banque l'a délivrée. Mais
   * un écran se contourne, et la demande part par courriel avec un jeton : le circuit
   * s'ouvrait sur des statuts que la re-datation allait remplacer, et les signataires
   * auraient signé une version périmée.
   *
   * Une SCI ne dépose pas de capital : la réserve ne vaut que pour les formes qui en
   * libèrent, celles-là mêmes dont la liste des pièces réclame l'attestation.
   */
  const dossier = await prisma.formalites.findUnique({
    where: { id: dossierId },
    select: { forme: true, data_json: true },
  });
  const attendue = piecesAttendues(formeDuDossier(dossier)).some(
    (p) => p.identifiant === PIECE_DEPOT_CAPITAL
  );

  if (attendue && !(await typesDeposes(dossierId)).has(PIECE_DEPOT_CAPITAL)) {
    throw new SignatureRetenue(
      "Déposez d'abord votre attestation de dépôt de capital : vos actes seront datés du jour où la banque vous l'a délivrée, et c'est cette version qui se signe."
    );
  }

  /* Le nom qui figurera dans le message : un lien de signature sans contexte se prend
     pour une tentative d'hameçonnage, et se jette. */
  const dossierASigner = await prisma.formalites.findUnique({
    where: { id: dossierId },
    select: { societe: true },
  });

  // On repart de zéro : relancer le circuit ne doit pas laisser d'anciens jetons
  // valides en circulation.
  await prisma.signature_requests.deleteMany({
    where: { formalite_id: dossierId, signed_at: null },
  });

  /*
   * On ne redemande pas sa signature à qui a signé.
   *
   * Reprendre le circuit créait une demande pour tout le monde, y compris pour ceux
   * dont la signature figurait déjà sur les actes. Deux conséquences, l'une visible et
   * l'autre non : l'écran leur annonçait « Pas encore envoyé » alors qu'ils avaient
   * signé, et surtout un nouveau jeton partait chez eux - une seconde signature
   * recueillie remplace la première, puisque c'est la plus récente qui est apposée.
   * Quelqu'un qui avait signé pouvait donc voir sa signature remplacée par un tracé
   * fait à la va-vite sur un lien qu'il ne comprenait pas.
   */
  const dejaSignees = new Set(
    (
      await prisma.signature_requests.findMany({
        where: { formalite_id: dossierId, signed_at: { not: null } },
        select: { associe_index: true },
      })
    ).map((d) => d.associe_index)
  );

  const creees = [];
  for (const [index, signataire] of signataires.entries()) {
    if (dejaSignees.has(index)) continue;

    const demande = await prisma.signature_requests.create({
      data: {
        formalite_id: dossierId,
        associe_index: index,
        associe_name: signataire.nom,
        associe_email: signataire.email,
        role: signataire.role ?? "associe",
        token: jeton(),
        status: "pending",
      },
    });

    const envoi = await adresserLaDemande(demande, dossierASigner?.societe ?? "");

    creees.push({
      id: demande.id,
      nom: demande.associe_name,
      jeton: demande.token,
      courrielParti: envoi.parti,
      simule: envoi.simule,
      motif: envoi.motif,
    });
  }

  return creees;
}

/**
 * Inscrit ce qu'un avis du fournisseur apprend sur un message.
 *
 * L'avis désigne le message, jamais la demande : le rapprochement se fait par
 * l'identifiant rendu à l'envoi. L'adresse ne suffirait pas - la même personne peut
 * avoir deux demandes en cours dans deux dossiers.
 *
 * Un avis qui ne retrouve rien est ignoré sans bruit : c'est le sort d'un message
 * envoyé avant que ce suivi n'existe, ou d'un courriel qui n'est pas une demande de
 * signature - une confirmation d'adresse, une invitation.
 */
export async function inscrireLAvis(avis: AvisDeResend): Promise<boolean> {
  const demande = await prisma.signature_requests.findFirst({
    where: { message_id: avis.identifiant },
    select: { id: true },
  });
  if (!demande) return false;

  /*
   * « Remis » et « ouvert » se datent ; un rejet se dit.
   *
   * Un message rendu par le serveur d'en face - adresse inexistante, boîte pleine - est
   * la seule chose qui compte à afficher : le lien n'arrivera jamais, et c'est l'adresse
   * qu'il faut corriger. Le classer indésirable revient au même de notre point de vue :
   * il est parti et personne ne le verra.
   */
  const inscription =
    avis.sort === "remis"
      ? { remis_le: avis.quand, envoi_motif: null }
      : avis.sort === "ouvert"
        ? /* Ouvrir suppose d'avoir reçu, et l'avis d'ouverture arrive parfois sans que
             celui de remise soit passé : on date les deux plutôt que d'afficher un
             message ouvert dont on ignorerait qu'il est arrivé. */
          { mail_ouvert_le: avis.quand, remis_le: avis.quand, envoi_motif: null }
        : { envoi_motif: MOTIF_REJET };

  await prisma.signature_requests.update({ where: { id: demande.id }, data: inscription });
  return true;
}

/**
 * Efface une signature recueillie, et redemande la même.
 *
 * Une signature tracée de travers, un doigt qui dérape sur un téléphone, une personne
 * qui signe sans avoir relu : le circuit ne savait pas revenir en arrière. Une fois la
 * dernière signature recueillie, l'écran annonçait « Tout le monde a signé » et
 * n'offrait plus rien - il fallait passer par le cabinet.
 *
 * Trois choses se défont ensemble. Le tracé et le paraphe, qui sont ce que portent les
 * actes ; les dates, qui racontaient une signature qui n'a plus lieu ; et le jeton, qui
 * est remplacé - le lien déjà reçu doit cesser de fonctionner, sans quoi deux liens
 * vivraient dans la même boîte pour la même signature.
 *
 * La phase du dossier ne bouge pas. Elle dit qu'il est passé au cabinet, ce qui reste
 * vrai : la reculer ferait croire à une transmission qui n'a pas eu lieu, et le suivi
 * ne la lit pas pour savoir qui a signé - il lit les signatures.
 *
 * Une société immatriculée, en revanche, ne resigne pas ses statuts constitutifs : ce
 * qui est déposé est déposé.
 */
export async function annulerSignature(utilisateur: UtilisateurConnecte, demandeId: number) {
  const demande = await prisma.signature_requests.findUnique({
    where: { id: demandeId },
    include: { formalites: { select: { id: true, societe: true, status: true } } },
  });
  if (!demande?.formalites) return null;

  await exigerDossierModifiable(utilisateur, demande.formalites.id);

  if (estClos(demande.formalites.status)) {
    throw new SignatureRetenue("Ce dossier est clos : ses actes ne se resignent plus.");
  }
  if (!demande.signed_at) {
    throw new SignatureRetenue(demande.associe_name + " n'a pas encore signé.");
  }

  const repris = await prisma.signature_requests.update({
    where: { id: demande.id },
    data: {
      signature_data: null,
      paraphe_data: null,
      signed_at: null,
      opened_at: null,
      envoye_le: null,
      remis_le: null,
      mail_ouvert_le: null,
      envoi_motif: null,
      message_id: null,
      /* Un jeton neuf : le lien déjà reçu cesse de fonctionner, sans quoi deux liens
         vivraient dans la même boîte pour la même signature. */
      token: jeton(),
      status: "pending",
    },
  });

  /* Effacer une signature recueillie se trace : c'est la seule pièce qui dira, plus
     tard, pourquoi l'acte porte une signature datée d'un autre jour. */
  await prisma.audit_log.create({
    data: {
      formalite_id: demande.formalites.id,
      actor_id: utilisateur.id,
      actor_role: "client",
      action: "signature_annulee",
      target_field: demande.associe_name,
      before_value: demande.signed_at.toISOString(),
    },
  });

  const envoi = await adresserLaDemande(repris, demande.formalites.societe ?? "");
  return { ...envoi, nom: demande.associe_name };
}

/**
 * Le tracé d'une signature recueillie, en octets.
 *
 * L'écran disait « Signé le 10 septembre à 23h41 » et rien d'autre : une date, sur la
 * foi de la plateforme. Or ce qui prouve une signature, c'est la signature - celle-là
 * même qui est apposée au bas des actes. La montrer relie les deux : ce qu'on voit dans
 * le suivi est ce que porte le document.
 *
 * Elle sort par une route à elle plutôt que dans le suivi. Un tracé pèse quelques
 * dizaines de milliers d'octets ; quatre signataires en JSON, rechargés à chaque geste,
 * feraient passer une liste de quatre lignes pour un téléversement.
 */
export async function traceDeLaSignature(
  utilisateur: UtilisateurConnecte,
  demandeId: number
): Promise<Buffer | null> {
  const demande = await prisma.signature_requests.findUnique({
    where: { id: demandeId },
    select: { formalite_id: true, signature_data: true },
  });
  if (!demande?.signature_data) return null;

  /* Les droits sont ceux du dossier : une signature n'est pas plus publique que l'acte
     qu'elle porte. */
  await exigerDossier(utilisateur, demande.formalite_id);

  if (!demande.signature_data.startsWith(PREFIXE_PNG)) return null;
  return Buffer.from(demande.signature_data.slice(PREFIXE_PNG.length), "base64");
}

/**
 * Renvoie le lien à une seule personne.
 *
 * Le même jeton : relancer, c'est faire revenir le message, non casser le lien qui est
 * déjà dans une boîte. Reprendre tout le circuit était le seul recours - et il supprime
 * les demandes non signées, donc invalide les jetons de tous ceux qui n'ont pas encore
 * signé pour renvoyer à un seul.
 */
export async function relancerSignature(
  utilisateur: UtilisateurConnecte,
  demandeId: number,
  adresse?: string
) {
  const demande = await prisma.signature_requests.findUnique({
    where: { id: demandeId },
    include: { formalites: { select: { id: true, societe: true } } },
  });
  if (!demande?.formalites) return null;

  await exigerDossierModifiable(utilisateur, demande.formalites.id);

  if (demande.signed_at) {
    throw new SignatureRetenue(demande.associe_name + " a déjà signé : il n'y a rien à relancer.");
  }

  if (!peutRelancer(versSuivi(demande))) {
    throw new SignatureRetenue(
      "Le dernier message vient de partir. Laissez-lui une minute avant de relancer."
    );
  }

  /* L'adresse se corrige au moment de relancer : c'est le geste qu'on fait quand le
     message n'est pas arrivé, et une faute de frappe en est la première cause. */
  const corrigee = adresse?.trim();
  if (corrigee && corrigee !== demande.associe_email) {
    await prisma.signature_requests.update({
      where: { id: demande.id },
      data: { associe_email: corrigee },
    });
    demande.associe_email = corrigee;
  }

  const envoi = await adresserLaDemande(demande, demande.formalites.societe ?? "");

  await prisma.signature_requests.update({
    where: { id: demande.id },
    data: { relances: { increment: 1 } },
  });

  return envoi;
}

/**
 * Ce que voit le signataire en ouvrant son lien.
 *
 * On ne rend que son nom, la société et les documents à signer. Un jeton ne donne
 * pas accès au dossier.
 */
export async function ouvrirLienDeSignature(jetonRecu: string) {
  const demande = await prisma.signature_requests.findUnique({
    where: { token: jetonRecu },
    include: { formalites: { select: { id: true, societe: true, forme: true } } },
  });
  if (!demande) return null;

  // La première ouverture est datée : elle sert à savoir si le lien est arrivé.
  if (!demande.opened_at && !demande.signed_at) {
    await prisma.signature_requests.update({
      where: { id: demande.id },
      data: { opened_at: new Date(), status: "opened" },
    });
  }

  return {
    nom: demande.associe_name,
    societe: demande.formalites?.societe ?? "",
    forme: demande.formalites?.forme ?? "",
    dejaSignee: demande.signed_at !== null,
  };
}

/**
 * Enregistre une signature.
 *
 * Le jeton devient inutilisable : une signature ne se rejoue pas. Quand tous ont
 * signé, le dossier avance - c'est le seul moment où il le fait tout seul.
 */
export async function signer(jetonRecu: string, trace: string, paraphe: string | null = null) {
  verifierTrace(trace);
  /* Le paraphe passe le même contrôle : il finit au bas de chaque page d'un acte. */
  if (paraphe) verifierTrace(paraphe);

  const demande = await prisma.signature_requests.findUnique({ where: { token: jetonRecu } });
  if (!demande) return { ok: false as const, raison: "introuvable" as const };
  if (demande.signed_at) return { ok: false as const, raison: "deja_signee" as const };

  await prisma.signature_requests.update({
    where: { id: demande.id },
    data: {
      signature_data: trace,
      paraphe_data: paraphe,
      signed_at: new Date(),
      status: "signed",
    },
  });

  const toutes = await prisma.signature_requests.findMany({
    where: { formalite_id: demande.formalite_id },
  });

  const complet = toutLeMondeASigne(toutes.map(versDemande));
  if (complet) {
    await prisma.formalites.update({
      where: { id: demande.formalite_id },
      data: { phase: PHASE_APRES_SIGNATURE, updated_at: new Date() },
    });
  }

  await prisma.audit_log.create({
    data: {
      formalite_id: demande.formalite_id,
      actor_id: null,
      actor_role: "signataire",
      action: "statuts_signes",
      target_field: demande.associe_name,
    },
  });

  return { ok: true as const, complet };
}

/** La signature demandée trop tôt : les actes attendent encore l'avocat. */
export class SignatureRetenue extends Error {}
