import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import { estPropose } from "@/domain/acces/regles";
import { DOCUMENT_FINAL, typeDeDossier } from "@/domain/formalite/cabinet";
import { envoyerMessage } from "./messages";
import { objetDuDossier, brouillonLisible } from "@/domain/formalite/demande";
import { exigerDossier, listerDossiers } from "./dossiers";
import { transitionPermise, libelleEtat } from "@/domain/formalite/transitions";
import {
  passageSousPhasePermis,
  passageBloque,
  libelleSousPhase,
  etapeMeritee,
  plafondAutomatique,
  laMoinsAvancee,
  estSousPhase,
  sousPhaseSuivante,
  SOUS_PHASES_ORDONNEES,
} from "@/domain/formalite/avocat";
import {
  correctionsDemandees,
  dossierValide,
  dossierRejete,
  immatriculee,
  documentRefuse,
  messageDeRefusDePiece,
  documentValide,
  actesDisponibles,
  actesRetires,
  dossierPrisEnCharge,
} from "@/domain/formalite/avis";
import { prevenir } from "./avis";
import { A_RELIRE } from "@/domain/document/publication";
import { TITRE_STATUTS_EN_VIGUEUR } from "@/domain/modification/formalites";
import { LONGUEUR_COMMENTAIRE } from "@/domain/formalite/avocat";
import { TYPE_RBE, TYPE_KBIS, typesDeposes } from "./suivi";
import {
  dossierVerifie,
  depotSansDocument,
  attestationAttendue,
  depotEnCours,
  dossierAPrendre,
} from "@/domain/formalite/avis";
import { equipeDe } from "./equipe";
import type { UtilisateurConnecte } from "../sessions";

/**
 * L'espace avocat.
 *
 * Il ne définit aucune règle d'accès qui lui soit propre : un avocat voit les
 * dossiers qui lui sont assignés et ceux de son cabinet, ce que listerDossiers
 * sait déjà faire. Réécrire la règle ici la ferait diverger.
 */

function exigerAvocat(utilisateur: UtilisateurConnecte) {
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Cet espace est réservé aux avocats");
  }
}

export async function dossiersDuCabinet(utilisateur: UtilisateurConnecte) {
  exigerAvocat(utilisateur);

  /*
   * Les siens, et ceux qui attendent un avocat.
   *
   * Un dossier transmis que personne n'a pris est proposé à tous : il doit se voir,
   * sinon la notification mène à une liste où il ne figure pas. Un dossier déjà pris
   * disparaît de la vue des autres - il appartient à son avocat.
   */
  const [miens, proposes] = await Promise.all([
    listerDossiers(utilisateur),
    prisma.formalites.findMany({
      where: {
        assigned_avocat_id: null,
        status: { notIn: ["en_cours", "terminee", "archive", "rejete"] },
      },
      orderBy: { updated_at: "desc" },
    }),
  ]);

  const vus = new Set(miens.map((d) => d.id));
  const dossiers = [...miens, ...proposes.filter((d) => !vus.has(d.id))];
  if (dossiers.length === 0) return [];

  const identifiants = dossiers.map((d) => d.id);

  const [clients, documents, notes, nonLus, encaisse] = await Promise.all([
    prisma.users.findMany({
      where: { id: { in: dossiers.map((d) => d.user_id) } },
      select: { id: true, name: true, email: true },
    }),
    prisma.documents.groupBy({
      by: ["formalite_id"],
      where: { formalite_id: { in: identifiants }, status: "uploaded" },
      _count: { _all: true },
    }),
    prisma.team_notes.groupBy({
      by: ["formalite_id"],
      where: { formalite_id: { in: identifiants } },
      _count: { _all: true },
    }),
    prisma.messages.groupBy({
      by: ["formalite_id"],
      where: {
        formalite_id: { in: identifiants },
        read: false,
        sender_id: { not: utilisateur.id },
      },
      _count: { _all: true },
    }),
    prisma.payments.groupBy({
      by: ["formalite_id"],
      where: { formalite_id: { in: identifiants }, status: "paid" },
      _sum: { amount_cents: true },
    }),
  ]);

  const parClient = new Map(clients.map((c) => [c.id, c]));
  const aVerifier = new Map(documents.map((d) => [d.formalite_id, d._count._all]));
  const nbNotes = new Map(notes.map((n) => [n.formalite_id, n._count._all]));
  const messages = new Map(nonLus.map((m) => [m.formalite_id, m._count._all]));
  const paye = new Map(encaisse.map((p) => [p.formalite_id, p._sum.amount_cents ?? 0]));

  return dossiers.map((d) => ({
    id: d.id,
    reference: d.reference || "#" + String(d.id).padStart(4, "0"),
    societe: d.societe || "Sans nom",
    forme: d.forme,
    capital: d.capital,
    type: d.type,
    sousType: d.sub_type,
    status: d.status,
    phase: d.phase ?? 1,
    sousPhase: d.business_sub_phase,
    offre: d.offer,
    creePar: (d.created_by_avocat ? "avocat" : "client") as "avocat" | "client",
    creeLe: d.created_at,
    majLe: d.updated_at,
    client: parClient.get(d.user_id)?.name ?? "Client inconnu",
    clientEmail: parClient.get(d.user_id)?.email ?? null,
    documentsAVerifier: aVerifier.get(d.id) ?? 0,
    notes: nbNotes.get(d.id) ?? 0,
    nonLus: messages.get(d.id) ?? 0,
    payeCentimes: paye.get(d.id) ?? 0,
    monDossier: d.assigned_avocat_id === utilisateur.id,
    /*
     * De quoi il s'agit, et pas seulement de quel type.
     *
     * « SAS · Modification » ne distingue pas un transfert de siège d'une augmentation
     * de capital : l'avocat qui décide de prendre le dossier a besoin de savoir ce
     * qu'on lui demande avant de l'ouvrir.
     */
    demande: objetDuDossier(d.type, brouillonLisible(d.data_json)),
    /*
     * Proposé, et non simplement sans avocat.
     *
     * Un administrateur voit tous les dossiers : marquer « libre » tout ce qui n'a pas
     * d'avocat faisait apparaître le bouton sur des brouillons que le client remplit
     * encore, et sur des dossiers déjà immatriculés.
     */
    libre: estPropose({
      id: d.id,
      proprietaireId: d.user_id,
      avocatAssigneId: d.assigned_avocat_id,
      equipeId: d.team_id,
      statut: d.status,
    }),
  }));
}

export async function dossierPourAvocat(utilisateur: UtilisateurConnecte, dossierId: number) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  const [client, documents, notes, historique, nonLus] = await Promise.all([
    prisma.users.findUnique({
      where: { id: dossier.user_id },
      select: { name: true, email: true },
    }),
    prisma.documents.findMany({
      where: { formalite_id: dossierId },
      orderBy: { created_at: "desc" },
    }),
    prisma.team_notes.findMany({
      where: { formalite_id: dossierId },
      orderBy: { created_at: "desc" },
      include: { users: { select: { name: true } } },
    }),
    prisma.audit_log.findMany({
      where: { formalite_id: dossierId },
      orderBy: { created_at: "desc" },
      take: 30,
      include: { users: { select: { name: true } } },
    }),
    prisma.messages.count({
      where: { formalite_id: dossierId, read: false, sender_id: { not: utilisateur.id } },
    }),
  ]);

  let donnees: Record<string, unknown> = {};
  try {
    donnees = JSON.parse(dossier.data_json ?? "{}");
  } catch {
    donnees = {};
  }

  /*
   * Ce que le client a réglé.
   *
   * La liste des dossiers le savait, l'écran d'un dossier non : l'avocat y lisait
   * l'offre - « Starter » - sans savoir ce qu'elle avait coûté, ni même si elle avait
   * été payée.
   */
  const encaisse = await prisma.payments.aggregate({
    where: { formalite_id: dossierId, status: "paid" },
    _sum: { amount_cents: true },
  });

  /*
   * Ce qui attend un preneur, ailleurs.
   *
   * Un dossier fini laisse l'avocat devant un écran qui n'a plus rien à lui dire : il
   * repartait à la liste pour découvrir s'il restait du travail. Le compte le lui dit.
   */
  /*
   * La même règle que le filtre « À prendre » de la liste.
   *
   * Le compte s'en écartait - il bornait la phase et n'écartait que les dossiers
   * terminés - et le bouton annonçait sept dossiers là où la liste en montrait neuf.
   * Un dossier proposé est un dossier sans avocat, transmis, et non clos : voir
   * estPropose, dans le domaine.
   */
  const aPrendre = await prisma.formalites.count({
    where: {
      assigned_avocat_id: null,
      status: { notIn: ["en_cours", "terminee", "archive", "rejete"] },
    },
  });

  return {
    dossier,
    client,
    documents,
    notes,
    historique,
    donnees,
    nonLus,
    payeCentimes: encaisse._sum.amount_cents ?? 0,
    dossiersAPrendre: aPrendre,
  };
}

/**
 * Note interne sur un dossier.
 *
 * Elle n'est visible que de l'équipe qui l'écrit : le client ne la voit jamais,
 * et une autre équipe non plus.
 */
export async function ajouterNote(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  contenu: string
) {
  exigerAvocat(utilisateur);
  await exigerDossier(utilisateur, dossierId);

  // L'équipe est créée au besoin : elle est un détail d'organisation, et exiger
  // un détour par la page Équipe avant de pouvoir écrire une note n'aurait aucun
  // sens pour la personne qui travaille sur un dossier.
  const equipe = await equipeDe(utilisateur);

  return prisma.team_notes.create({
    data: {
      formalite_id: dossierId,
      team_id: equipe.id,
      author_id: utilisateur.id,
      content: contenu.slice(0, 5000),
    },
  });
}

/** Le registre des bénéficiaires est facultatif : le message final ne le promet
 *  que s'il a été déposé. */
async function aLeRbe(dossierId: number): Promise<boolean> {
  const compte = await prisma.documents.count({
    where: { formalite_id: dossierId, type: TYPE_RBE, rejection_reason: null },
  });
  return compte > 0;
}

/**
 * Fait changer un dossier d'état.
 *
 * Le client est prévenu quand le changement le concerne, et la trace est écrite
 * dans le journal d'audit - c'est elle qui permet d'instruire une contestation.
 */
export async function changerEtatDossier(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  vers: string,
  commentaire?: string
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  if (dossier.status === vers) return { inchange: true as const };

  if (!transitionPermise(dossier.status, vers)) {
    throw new Interdit(
      "Un dossier « " +
        libelleEtat(dossier.status) +
        " » ne peut pas passer à « " +
        libelleEtat(vers) +
        " »"
    );
  }

  await prisma.formalites.update({
    where: { id: dossierId },
    data: {
      status: vers,
      finalized_at: vers === "terminee" ? new Date() : dossier.finalized_at,
      updated_at: new Date(),
    },
  });

  /*
   * Ce qui est demandé - ou reproché - est écrit au dossier, non seulement au journal.
   *
   * Le motif saisi par l'avocat ne partait que dans le journal d'audit, que le client
   * ne voit pas. Le courriel lui disait pourtant « le détail est dans votre
   * messagerie », où rien n'était écrit : il apprenait qu'on lui demandait quelque
   * chose sans jamais pouvoir savoir quoi.
   */
  if ((vers === "corrections_demandees" || vers === "rejete") && commentaire?.trim()) {
    await prisma.messages.create({
      data: {
        formalite_id: dossierId,
        sender_id: utilisateur.id,
        /*
         * La même longueur que la trace du journal.
         *
         * Le suivi lit le motif au journal, borné à mille signes ; le fil le montrait
         * en entier. Les deux ne disaient pas la même chose du même geste, et le
         * rattrapage ne reconnaissait plus le message qu'il venait de poser.
         */
        content: commentaire.trim().slice(0, LONGUEUR_COMMENTAIRE),
        // Un refus n'est pas une demande de corrections : le fil l'annonce comme tel.
        kind: vers === "rejete" ? "rejection" : "correction_request",
      },
    });
  }

  /*
   * Le client est prévenu, cloche et courriel.
   *
   * L'ancien code écrivait une notification que rien ne lisait : quelqu'un dont
   * l'avocat demandait des corrections ne l'apprenait qu'en revenant de lui-même.
   */
  const societe = dossier.societe || "votre société";
  const avis =
    vers === "corrections_demandees"
      ? correctionsDemandees(societe)
      : vers === "valide"
        ? dossierValide(societe)
        : vers === "rejete"
          ? dossierRejete(societe)
          : vers === "terminee"
            ? immatriculee(societe, await aLeRbe(dossierId))
            : null;

  if (avis) await prevenir(dossier.user_id, dossierId, avis);

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: "etat_" + vers,
      before_value: dossier.status,
      after_value: vers,
      comment: commentaire?.slice(0, LONGUEUR_COMMENTAIRE) ?? null,
    },
  });

  return { inchange: false as const, etat: vers };
}

/**
 * Assigne un avocat à un dossier.
 *
 * Un avocat s'attribue un dossier de son cabinet ; un administrateur en assigne
 * un à quelqu'un d'autre.
 */
export async function assignerAvocat(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  avocatId: number
) {
  exigerAvocat(utilisateur);
  await exigerDossier(utilisateur, dossierId);

  if (avocatId !== utilisateur.id && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Vous ne pouvez vous assigner qu'à vous-même");
  }

  const cible = await prisma.users.findUnique({ where: { id: avocatId } });
  if (!cible || cible.role !== "avocat") {
    throw new Interdit("Ce compte n'est pas un avocat");
  }

  const ligne = await prisma.formalites.update({
    where: { id: dossierId },
    data: { assigned_avocat_id: avocatId, updated_at: new Date() },
    select: { user_id: true, societe: true },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: "avocat_assigne",
      after_value: cible.name,
    },
  });

  /*
   * Le client apprend qui s'occupe de son dossier.
   *
   * C'était le seul geste du parcours qui ne prévenait personne : le refus d'une
   * pièce, la mise à disposition des actes, leur retrait, tous écrivent au client.
   * Celui-ci le laissait devant un écran qui annonçait un avocat sans jamais dire
   * quand il était arrivé.
   *
   * L'avis ne fait pas échouer l'assignation : l'avocat a pris le dossier, et un
   * courriel qui ne part pas ne doit pas le lui reprendre.
   */
  if (ligne.user_id && ligne.user_id !== utilisateur.id) {
    await prevenir(
      ligne.user_id,
      dossierId,
      dossierPrisEnCharge(ligne.societe || "votre société", cible.name)
    );
  }

  return { avocat: cible.name };
}

/**
 * Supprime une note interne.
 *
 * Seul son auteur peut la retirer : une note engage celui qui l'a écrite, et un
 * confrère n'a pas à effacer son analyse.
 */
export async function supprimerNote(utilisateur: UtilisateurConnecte, noteId: number) {
  exigerAvocat(utilisateur);

  const note = await prisma.team_notes.findUnique({ where: { id: noteId } });
  if (!note) throw new Interdit("Cette note n'existe pas ou ne vous est pas accessible");

  await exigerDossier(utilisateur, note.formalite_id);

  if (note.author_id !== utilisateur.id && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Seul l'auteur d'une note peut la supprimer");
  }

  await prisma.team_notes.delete({ where: { id: noteId } });
  return { supprimee: noteId };
}

/** Valide ou refuse une pièce déposée par le client. */
export async function statuerSurDocument(
  utilisateur: UtilisateurConnecte,
  documentId: number,
  /**
   * Valider, refuser - ou revenir sur ce qu'on vient de décider.
   *
   * Une validation donnée trop vite ne se reprenait pas : la pièce passait « Vérifié »
   * et n'offrait plus aucun geste. « Reprendre » la remet en attente de décision, sans
   * rien dire au client - il a vu une pièce validée, lui annoncer qu'elle ne l'est plus
   * avant qu'on ait retranché ne ferait qu'inquiéter. Le journal, lui, garde la trace.
   */
  decision: "valider" | "refuser" | "reprendre",
  motif?: string
) {
  exigerAvocat(utilisateur);

  const document = await prisma.documents.findUnique({ where: { id: documentId } });
  if (!document) throw new Interdit("Ce document n'existe pas ou ne vous est pas accessible");

  // Le contrôle porte sur le dossier : c'est lui qui décide de l'accès.
  await exigerDossier(utilisateur, document.formalite_id);

  const misAJour = await prisma.documents.update({
    where: { id: documentId },
    data:
      decision === "valider"
        ? { status: "verified", rejection_reason: null, rejected_at: null }
        : decision === "reprendre"
          ? { status: "uploaded", rejection_reason: null, rejected_at: null }
          : {
              rejection_reason: motif?.slice(0, 500) || "Document non conforme",
              rejected_at: new Date(),
            },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: document.formalite_id,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action:
        decision === "valider"
          ? "document_valide"
          : decision === "reprendre"
            ? "document_decision_reprise"
            : "document_refuse",
      target_field: document.name,
      comment: decision === "refuser" ? (motif ?? null) : null,
    },
  });

  /*
   * Le client apprend le refus autrement qu'en revenant voir.
   *
   * C'est le seul avis qui appelle un geste immédiat de sa part : il part donc aussi
   * par courriel, avec le motif, faute de quoi le dossier attend sans que personne ne
   * sache qu'il attend.
   */
  const dossier = await prisma.formalites.findUnique({
    where: { id: document.formalite_id },
    select: { user_id: true, societe: true },
  });

  if (dossier && decision !== "reprendre") {
    const societe = dossier.societe || "votre société";
    await prevenir(
      dossier.user_id,
      document.formalite_id,
      decision === "refuser"
        ? documentRefuse(document.name, societe, misAJour.rejection_reason ?? "Document non conforme")
        : documentValide(document.name, societe)
    );
  }

  /*
   * Un refus ouvre aussi un message, que le client peut discuter.
   *
   * L'avis prévient, mais ne se répond pas : celui qui ne comprend pas ce qu'on attend
   * de lui redéposait la même pièce, et le dossier faisait deux allers-retours de plus.
   * Le message part du fil du dossier, il n'a qu'à répondre dessous.
   */
  if (decision === "refuser") {
    await envoyerMessage(
      utilisateur,
      document.formalite_id,
      messageDeRefusDePiece(document.name, misAJour.rejection_reason ?? "Document non conforme")
    );
  }

  /* L'étape annoncée au client suit le travail : elle n'a plus à être déclarée. */
  await avancerSelonLeTravail(utilisateur, document.formalite_id);

  return misAJour;
}


/**
 * Fait avancer l'étape annoncée au client, d'elle-même.
 *
 * L'avocat cliquait « Passer à Révision », puis « Passer à Vérifié », pour déclarer ce
 * que son propre travail disait déjà - un clic après chaque geste, et des dossiers
 * restés « Transmis » des jours après avoir été relus parce que personne n'avait pensé
 * au bouton.
 *
 * L'étape se déduit maintenant du travail fait, et le client est prévenu comme il
 * l'était. Une seule ne se déduit pas : le dépôt au guichet se passe hors de
 * l'application. Elle borne l'automatisme, qui ne la franchit jamais.
 *
 * L'avancement se fait cran par cran - c'est ce que la règle des passages autorise - et
 * il ne recule jamais. Un cran refusé arrête la montée sans faire échouer le geste qui
 * l'a déclenchée : relire une pièce doit rester possible même si l'étape suivante est
 * bloquée.
 */
export async function avancerSelonLeTravail(
  utilisateur: UtilisateurConnecte,
  dossierId: number
) {
  const dossier = await prisma.formalites.findUnique({ where: { id: dossierId } });
  if (!dossier) return { sousPhase: null };

  const documents = await prisma.documents.findMany({
    where: { formalite_id: dossierId },
    select: { type: true, status: true, uploaded_by: true, rejection_reason: true },
  });

  /* La relecture des informations vit dans le brouillon, sous « revue ». */
  let revue: { par?: unknown } | undefined;
  try {
    const lu: unknown = JSON.parse(dossier.data_json ?? "{}");
    if (lu && typeof lu === "object") {
      revue = (lu as Record<string, unknown>).revue as { par?: unknown } | undefined;
    }
  } catch {
    // Un brouillon illisible ne dit rien de la relecture : on la tient pour non faite.
  }

  const merite = etapeMeritee({
    informationsVerifiees: !!revue?.par,
    actesProduits: documents.some((d) => d.uploaded_by === "system"),
    piecesEnAttente: documents.filter(
      (d) => d.uploaded_by !== "system" && d.status === "uploaded"
    ).length,
    actesARelire: documents.filter(
      (d) => d.uploaded_by === "system" && d.status === A_RELIRE
    ).length,
    documentFinalRemis: documents.some(
      (d) => d.type === TYPE_KBIS && !d.rejection_reason
    ),
  });

  const vise = laMoinsAvancee(merite, plafondAutomatique(dossier.business_sub_phase));
  const rang = (etape: string | null | undefined) =>
    estSousPhase(etape) ? SOUS_PHASES_ORDONNEES.indexOf(etape) : -1;

  let courante = dossier.business_sub_phase;
  while (rang(courante) < rang(vise)) {
    const suivante = sousPhaseSuivante(courante);
    if (!suivante) break;
    try {
      await changerSousPhase(utilisateur, dossierId, suivante);
    } catch {
      /* Un cran empêché arrête la montée, sans défaire le geste qui l'a déclenchée. */
      break;
    }
    courante = suivante;
  }

  return { sousPhase: courante };
}

/**
 * Fait avancer le travail du cabinet d'un cran.
 *
 * Les cinq pastilles - Transmis, Révision, Vérifié, Dépôt, KBIS - existaient dans
 * l'écran et aucune ne s'allumait : aucune route n'écrivait jamais la colonne.
 *
 * Chaque passage prévient le client quand il le concerne - où en est son dossier, et
 * ce qu'on attend de lui quand quelque chose l'attend. Publier l'annonce légale n'en
 * fait pas partie : le cabinet la rédige et la fait paraître.
 */
export async function changerSousPhase(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  vers: string
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  if (dossier.business_sub_phase === vers) return { inchange: true as const };

  if (!passageSousPhasePermis(dossier.business_sub_phase, vers)) {
    throw new Interdit(
      "Un dossier ne passe pas de « " +
        (dossier.business_sub_phase ? libelleSousPhase(dossier.business_sub_phase) : "aucune étape") +
        " » à « " +
        libelleSousPhase(vers) +
        " »"
    );
  }

  const types = await typesDeposes(dossierId);
  const refus = passageBloque(vers, types.has(TYPE_KBIS));
  if (refus) throw new Interdit(refus);

  await prisma.formalites.update({
    where: { id: dossierId },
    data: { business_sub_phase: vers, updated_at: new Date() },
  });

  const societe = dossier.societe || "votre société";
  /*
   * Ce qu'on annonce au client, et ce qu'on ne lui demande pas.
   *
   * « Vérifié » lui disait « à vous de jouer : publiez l'annonce légale ». L'avis est
   * rédigé et publié par le cabinet, ici comme partout ailleurs : le client n'a jamais
   * eu à choisir un journal. Et l'attestation de dépôt de capital n'a de sens qu'à la
   * constitution - une modification ou un dépôt de comptes ne libère aucun capital.
   */
  const avis =
    vers === "5c"
      ? dossierVerifie(societe)
      : vers === "5b" && dossier.type === "creation" && !types.has("depot-capital")
        ? attestationAttendue(societe)
        : vers === "5d"
          ? depotEnCours(societe)
          : null;

  if (avis) await prevenir(dossier.user_id, dossierId, avis);

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: "sous_phase_" + vers,
      before_value: dossier.business_sub_phase,
      after_value: vers,
    },
  });

  return { inchange: false as const, sousPhase: vers };
}

/**
 * L'avocat déclare avoir relu ce que le client a saisi.
 *
 * La tâche « Vérifier les informations du dossier » n'avait aucun geste pour
 * s'accomplir : elle n'était réputée faite qu'une fois le dossier passé en sous-phase
 * « Vérifié », c'est-à-dire tout à la fin de la révision. On cliquait « Y aller », on
 * relisait le récapitulatif, on revenait, et la case restait vide - indéfiniment.
 *
 * La marque vit dans le brouillon, sous `revue`, avec son auteur et sa date : c'est un
 * fait de la relecture, non un changement d'état du dossier. Elle se retire aussi bien
 * qu'elle se pose - on relit parfois deux fois, après une correction du client.
 */
export async function marquerLesInformationsVerifiees(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  verifiees: boolean
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  let brouillon: Record<string, unknown> = {};
  try {
    const lu: unknown = JSON.parse(dossier.data_json ?? "{}");
    if (lu && typeof lu === "object") brouillon = lu as Record<string, unknown>;
  } catch {
    // Un brouillon illisible n'empêche pas d'inscrire la relecture : on repart de zéro
    // pour cette clé plutôt que de refuser le geste.
  }

  const revue = (brouillon.revue ?? {}) as Record<string, unknown>;

  await prisma.formalites.update({
    where: { id: dossierId },
    data: {
      data_json: JSON.stringify({
        ...brouillon,
        revue: verifiees
          ? {
              ...revue,
              informations: true,
              par: utilisateur.id,
              le: new Date().toISOString(),
            }
          : { ...revue, informations: false },
      }),
      updated_at: new Date(),
    },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: utilisateur.roles[0] ?? "avocat",
      action: verifiees ? "informations_verifiees" : "informations_a_revoir",
    },
  });

  await avancerSelonLeTravail(utilisateur, dossierId);

  return { informationsVerifiees: verifiees };
}

/**
 * Dépose dans le dossier du client un document produit par le cabinet.
 *
 * Le Kbis et le registre des bénéficiaires n'avaient aucun chemin pour arriver : les
 * deux seules routes de dépôt sont les pièces attendues du client et le coffre
 * personnel, qui range dans les documents de celui qui dépose. Le message de fin
 * promettait pourtant au client de les trouver dans ses documents.
 */
export const LIVRABLES = {
  [TYPE_KBIS]: { titre: "Kbis", formats: [".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif"] },
  [TYPE_RBE]: {
    titre: "Registre des bénéficiaires effectifs",
    formats: [".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif"],
  },
} as const;

export function estLivrable(type: string): type is keyof typeof LIVRABLES {
  return type in LIVRABLES;
}

/**
 * Les avocats à prévenir qu'un dossier attend.
 *
 * Les comptes actifs ; s'il n'y en a aucun, tous. Un dossier qui n'atteint personne
 * dort indéfiniment sans que quiconque le sache - mieux vaut prévenir un compte
 * suspendu, qui ne fera rien, que de ne prévenir personne.
 */
export async function avocatsANotifier(): Promise<{ id: number }[]> {
  const actifs = await prisma.users.findMany({
    where: { role: "avocat", suspended: false },
    select: { id: true },
  });
  if (actifs.length > 0) return actifs;

  return prisma.users.findMany({ where: { role: "avocat" }, select: { id: true } });
}

/**
 * Propose un dossier à tous les avocats.
 *
 * Rien n'est assigné : c'est une offre. Le premier qui l'accepte le prend, et les
 * autres l'apprennent en essayant.
 */
export async function proposerAuxAvocats(dossierId: number) {
  const dossier = await prisma.formalites.findUnique({
    where: { id: dossierId },
    select: { societe: true, forme: true, assigned_avocat_id: true },
  });
  // Un dossier déjà pris ne se propose pas : ce serait rappeler un travail fait.
  if (!dossier || dossier.assigned_avocat_id !== null) return { proposes: 0 };

  const avocats = await avocatsANotifier();
  const avis = dossierAPrendre(dossier.societe || "Sans nom", dossier.forme);

  for (const avocat of avocats) {
    await prevenir(avocat.id, dossierId, avis);
  }

  return { proposes: avocats.length };
}

/** Levée quand un dossier a déjà trouvé son avocat. */
export class DejaPris extends Error {
  constructor(readonly avocat: string) {
    super("Ce dossier a déjà été pris en charge par " + avocat);
  }
}

/**
 * Un avocat prend un dossier qui attendait.
 *
 * La prise est une mise à jour conditionnelle : elle ne s'applique qu'aux lignes dont
 * l'avocat est encore nul. Lire puis écrire laisserait passer deux avocats qui
 * cliquent dans la même seconde - chacun lirait « libre » avant que l'autre n'écrive,
 * et le second effacerait le premier sans que personne ne le sache.
 *
 * C'est la base qui tranche, en une instruction.
 */
export async function prendreLeDossier(utilisateur: UtilisateurConnecte, dossierId: number) {
  exigerAvocat(utilisateur);

  /*
   * Le dossier est chargé sans passer par exigerDossier.
   *
   * Une fois pris, il n'est plus proposé : le confrère arrivé trop tard n'a donc plus
   * le droit de le lire, et recevrait « accès refusé » là où il faut lui dire que
   * quelqu'un a été plus rapide. Le contrôle porte ici sur ce qui compte : être
   * avocat, et que le dossier soit bien transmis.
   */
  const dossier = await prisma.formalites.findUnique({
    where: { id: dossierId },
    select: { id: true, status: true, assigned_avocat_id: true },
  });
  if (!dossier) throw new Interdit("Ce dossier n'existe pas ou ne vous est pas accessible");

  // Tant que le client remplit, il n'y a rien à réviser.
  if (dossier.status === "en_cours") {
    throw new Interdit("Ce dossier n'a pas encore été transmis");
  }

  const { count } = await prisma.formalites.updateMany({
    where: { id: dossierId, assigned_avocat_id: null },
    data: { assigned_avocat_id: utilisateur.id, updated_at: new Date() },
  });

  if (count === 0) {
    // Quelqu'un a été plus rapide - ou c'est déjà le nôtre.
    const apres = await prisma.formalites.findUnique({
      where: { id: dossierId },
      select: { assigned_avocat_id: true },
    });

    if (apres?.assigned_avocat_id === utilisateur.id) {
      return { deja: true as const, dossier: dossier.id };
    }

    const preneur = apres?.assigned_avocat_id
      ? await prisma.users.findUnique({
          where: { id: apres.assigned_avocat_id },
          select: { name: true },
        })
      : null;

    throw new DejaPris(preneur?.name ?? "un autre avocat");
  }

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "dossier_pris",
      after_value: utilisateur.nom,
    },
  });

  /* Prendre un dossier, c'est l'ouvrir : le client le voit passer en « Transmis ». */
  await avancerSelonLeTravail(utilisateur, dossierId);

  return { deja: false as const, dossier: dossier.id };
}

/**
 * Ce que l'avocat a demandé de reprendre, en dernier lieu.
 *
 * Lu au journal plutôt qu'au fil : la trace y est écrite depuis toujours, et les
 * dossiers d'avant portent leur demande là et nulle part ailleurs.
 */
export async function derniereDemandeDeCorrections(dossierId: number): Promise<string | null> {
  const trace = await prisma.audit_log.findFirst({
    where: { formalite_id: dossierId, action: "etat_corrections_demandees" },
    orderBy: { created_at: "desc" },
    select: { comment: true },
  });

  const demande = trace?.comment?.trim();
  return demande ? demande : null;
}

/**
 * Rend les actes visibles au client.
 *
 * C'est le geste qui transforme un projet en document : jusque-là, ce qui sort du
 * gabarit n'est lu par personne. Le client en est prévenu, comme pour toute étape qui
 * lui rend la main.
 */
export async function mettreLesActesADisposition(
  utilisateur: UtilisateurConnecte,
  dossierId: number
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  const { count } = await prisma.documents.updateMany({
    where: { formalite_id: dossierId, uploaded_by: "system", status: A_RELIRE },
    data: { status: "generated" },
  });

  if (count === 0) return { publies: 0 };

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "actes_mis_a_disposition",
      after_value: String(count),
    },
  });

  await prevenir(dossier.user_id, dossierId, actesDisponibles(dossier.societe || "votre société"));

  await avancerSelonLeTravail(utilisateur, dossierId);

  return { publies: count };
}

/**
 * Valider un acte, et lui seul.
 *
 * La mise à disposition était collective : un bouton publiait le jeu entier, et un
 * avocat qui n'avait relu qu'un acte sur trois publiait les trois. Chaque acte se
 * valide désormais depuis sa ligne, et c'est cette validation - et elle seule - qui le
 * rend visible au client.
 *
 * Le client n'est prévenu qu'une fois : au premier acte validé du dossier. Trois
 * messages pour trois actes relus dans la même minute ne lui apprendraient rien de
 * plus.
 */
export async function mettreUnActeADisposition(
  utilisateur: UtilisateurConnecte,
  documentId: number
) {
  exigerAvocat(utilisateur);

  const document = await prisma.documents.findUnique({ where: { id: documentId } });
  if (!document?.formalite_id) throw new Interdit("Document introuvable");

  const dossier = await exigerDossier(utilisateur, document.formalite_id);

  if (document.uploaded_by !== "system" || document.status !== A_RELIRE) {
    throw new Interdit("Cet acte n'attend pas de relecture");
  }

  /* Un acte déjà chez le client vaut annonce faite : on ne la répète pas. */
  const dejaChezLui = await prisma.documents.count({
    where: {
      formalite_id: document.formalite_id,
      uploaded_by: "system",
      status: "generated",
      name: { not: TITRE_STATUTS_EN_VIGUEUR },
    },
  });

  await prisma.documents.update({
    where: { id: documentId },
    data: { status: "generated" },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: document.formalite_id,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "actes_mis_a_disposition",
      target_field: document.name,
      after_value: "1",
    },
  });

  if (dejaChezLui === 0) {
    await prevenir(
      dossier.user_id,
      document.formalite_id,
      actesDisponibles(dossier.societe || "votre société")
    );
  }

  await avancerSelonLeTravail(utilisateur, document.formalite_id);

  return { publie: document.name };
}

/**
 * Déclarer le dépôt au guichet, d'où que l'on parte.
 *
 * Le geste posait « Dépôt » directement. Un dossier qu'on venait de rouvrir était
 * revenu à « Transmis » : le passage était refusé - on ne saute pas trois crans - et
 * l'avocat se retrouvait devant un bouton qui ne faisait rien, sans autre chemin.
 *
 * On monte donc cran par cran jusqu'au dépôt, comme le fait l'avancement automatique.
 * Chaque passage prévient le client de ce qui le concerne, dans l'ordre.
 */
export async function marquerLeDepotAuGuichet(
  utilisateur: UtilisateurConnecte,
  dossierId: number
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  const rang = (etape: string | null | undefined) =>
    estSousPhase(etape) ? SOUS_PHASES_ORDONNEES.indexOf(etape) : -1;

  let courante = dossier.business_sub_phase;
  while (rang(courante) < rang("5d")) {
    const suivante = sousPhaseSuivante(courante);
    if (!suivante) break;
    await changerSousPhase(utilisateur, dossierId, suivante);
    courante = suivante;
  }

  return { sousPhase: courante };
}

/**
 * Conclure un dossier qu'aucun document du greffe ne viendra clore.
 *
 * La dernière étape attend le document délivré par le greffe, et le refuse tant qu'il
 * n'est pas au dossier. Or le greffe ne délivre pas toujours de récépissé : le dossier
 * restait alors en suspens indéfiniment, et le client guettait une remise qui ne
 * viendrait jamais.
 *
 * Le dépôt doit avoir eu lieu : c'est lui qu'on conclut, non le travail.
 */
export async function conclureSansDocumentFinal(
  utilisateur: UtilisateurConnecte,
  dossierId: number
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  if (!estSousPhase(dossier.business_sub_phase) || dossier.business_sub_phase !== "5d") {
    throw new Interdit("Le dépôt au guichet n'est pas encore marqué");
  }

  await prisma.formalites.update({
    where: { id: dossierId },
    data: { business_sub_phase: "5e", updated_at: new Date() },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "depot_sans_document",
      after_value: DOCUMENT_FINAL[typeDeDossier(dossier.type)],
    },
  });

  await prevenir(
    dossier.user_id,
    dossierId,
    depotSansDocument(
      dossier.societe || "votre société",
      DOCUMENT_FINAL[typeDeDossier(dossier.type)]
    )
  );

  return { conclu: true as const };
}

/**
 * Les versions d'un acte, de la plus récente à la plus ancienne.
 *
 * Elles se rattachent à l'acte, non au document : reproduire supprime la ligne de
 * `documents` et en crée une autre, si bien qu'un identifiant de document ne
 * survivrait pas à la première correction. Dans un dossier, l'identité d'un acte est
 * son titre.
 */
export interface VersionArchivee {
  id: number;
  fichier: string | null;
  produiteLe: string;
  archiveeLe: string;
  par: string | null;
}

/**
 * Les versions de tous les actes d'un dossier, rangées par titre.
 *
 * Lues en une fois : une requête par ligne de document multiplierait les
 * allers-retours pour une liste presque toujours vide.
 */
export async function versionsDuDossier(
  dossierId: number
): Promise<Map<string, VersionArchivee[]>> {
  const versions = await prisma.document_versions.findMany({
    where: { formalite_id: dossierId },
    orderBy: { archivee_le: "desc" },
    include: { users: { select: { name: true } } },
  });

  const parActe = new Map<string, VersionArchivee[]>();
  for (const v of versions) {
    const liste = parActe.get(v.name) ?? [];
    liste.push({
      id: v.id,
      fichier: v.file_path,
      produiteLe: v.produite_le.toISOString(),
      archiveeLe: v.archivee_le.toISOString(),
      par: v.users?.name ?? null,
    });
    parActe.set(v.name, liste);
  }
  return parActe;
}

/**
 * Revenir à une version antérieure d'un acte.
 *
 * La version reprend la place du document en cours, lequel devient à son tour une
 * version : on ne perd jamais ce qu'on quitte, et l'on peut faire l'aller-retour
 * autant de fois qu'il le faut.
 *
 * L'acte revenu repasse en relecture. Une version d'avant n'a pas été validée sous
 * cette forme, et la remettre au client sans la relire referait le défaut que la
 * validation corrige.
 */
export async function revenirALaVersion(utilisateur: UtilisateurConnecte, versionId: number) {
  exigerAvocat(utilisateur);

  const version = await prisma.document_versions.findUnique({ where: { id: versionId } });
  if (!version) throw new Interdit("Version introuvable");

  await exigerDossier(utilisateur, version.formalite_id);

  const actuel = await prisma.documents.findFirst({
    where: { formalite_id: version.formalite_id, name: version.name, uploaded_by: "system" },
  });
  if (!actuel) throw new Interdit("Cet acte n'est plus au dossier");

  if (actuel.status === "signed" || actuel.status === "verified") {
    throw new Interdit("Un acte signé ou vérifié ne se remplace pas");
  }

  await prisma.$transaction(async (tx) => {
    /* Ce qu'on quitte devient une version : l'aller-retour reste possible. */
    await tx.document_versions.create({
      data: {
        formalite_id: version.formalite_id,
        name: actuel.name,
        file_path: actuel.file_path,
        source_path: actuel.source_path,
        produite_le: actuel.created_at,
        archivee_par: utilisateur.id,
      },
    });

    await tx.documents.update({
      where: { id: actuel.id },
      data: {
        file_path: version.file_path,
        source_path: version.source_path,
        status: A_RELIRE,
        created_at: version.produite_le,
      },
    });

    await tx.document_versions.delete({ where: { id: versionId } });
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: version.formalite_id,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "acte_version_retablie",
      target_field: version.name,
      after_value: version.produite_le.toISOString(),
    },
  });

  return { retablie: version.name };
}

/**
 * Reprendre un acte, et lui seul.
 *
 * Une coquille se voit parfois après coup. L'acte remis n'avait plus aucun geste sur
 * sa ligne : il fallait retirer le jeu entier depuis une tâche accomplie et repliée,
 * ce qui remettait en relecture des actes que l'on n'avait pas à toucher.
 *
 * Repris, l'acte redevient un projet : il quitte l'espace du client, se corrige, puis
 * se valide à nouveau. Le client en est prévenu - un document qui disparaît sans un
 * mot inquiète plus qu'il n'informe.
 */
export async function reprendreUnActe(utilisateur: UtilisateurConnecte, documentId: number) {
  exigerAvocat(utilisateur);

  const document = await prisma.documents.findUnique({ where: { id: documentId } });
  if (!document?.formalite_id) throw new Interdit("Document introuvable");

  const dossier = await exigerDossier(utilisateur, document.formalite_id);

  /*
   * Trois réserves, les mêmes que pour le jeu entier. Les statuts en vigueur ne sont
   * pas un acte du cabinet - ils viennent du registre ou du client, et les retirer lui
   * ôterait son propre document. Un acte signé ou vérifié ne se reprend pas non plus :
   * la signature est un fait, elle ne s'annule pas d'un clic.
   */
  if (
    document.uploaded_by !== "system" ||
    document.status !== "generated" ||
    document.name === TITRE_STATUTS_EN_VIGUEUR
  ) {
    throw new Interdit("Cet acte ne se reprend pas");
  }

  await prisma.documents.update({
    where: { id: documentId },
    data: { status: A_RELIRE },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: document.formalite_id,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "actes_retires",
      target_field: document.name,
      after_value: "1",
    },
  });

  await prevenir(
    dossier.user_id,
    document.formalite_id,
    actesRetires(dossier.societe || "votre société")
  );

  return { repris: document.name };
}

/**
 * Retirer de l'espace du client les actes qu'on venait d'y mettre.
 *
 * La mise à disposition n'avait pas d'envers : un acte publié par erreur - le mauvais
 * dossier, une coquille vue une seconde trop tard - restait chez le client, qui pouvait
 * le signer ou l'envoyer à sa banque. Le geste le remet en relecture.
 *
 * Trois réserves. Les statuts en vigueur ne sont pas des actes du cabinet : ils
 * viennent du registre ou du client, et les retirer lui ôterait son propre document. Un
 * acte signé ou vérifié ne se reprend pas non plus - la signature est un fait, elle ne
 * s'annule pas d'un clic. Et le client est prévenu : des documents qui disparaissent
 * sans un mot inquiètent plus qu'ils n'informent.
 */
export async function retirerLesActesDeLEspaceClient(
  utilisateur: UtilisateurConnecte,
  dossierId: number
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  const { count } = await prisma.documents.updateMany({
    where: {
      formalite_id: dossierId,
      uploaded_by: "system",
      status: "generated",
      name: { not: TITRE_STATUTS_EN_VIGUEUR },
    },
    data: { status: A_RELIRE },
  });

  if (count === 0) return { retires: 0 };

  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "actes_retires",
      after_value: String(count),
    },
  });

  await prevenir(dossier.user_id, dossierId, actesRetires(dossier.societe || "votre société"));

  return { retires: count };
}
