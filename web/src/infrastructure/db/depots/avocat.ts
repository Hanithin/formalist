import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import { estPropose } from "@/domain/acces/regles";
import { exigerDossier, listerDossiers } from "./dossiers";
import { transitionPermise, libelleEtat } from "@/domain/formalite/transitions";
import {
  passageSousPhasePermis,
  passageBloque,
  libelleSousPhase,
} from "@/domain/formalite/avocat";
import {
  correctionsDemandees,
  dossierValide,
  dossierRejete,
  immatriculee,
  documentRefuse,
  documentValide,
} from "@/domain/formalite/avis";
import { prevenir } from "./avis";
import { LONGUEUR_COMMENTAIRE } from "@/domain/formalite/avocat";
import { TYPE_RBE, TYPE_KBIS, typesDeposes } from "./suivi";
import {
  annonceAPublier,
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

  return { dossier, client, documents, notes, historique, donnees, nonLus };
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

  await prisma.formalites.update({
    where: { id: dossierId },
    data: { assigned_avocat_id: avocatId, updated_at: new Date() },
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
  decision: "valider" | "refuser",
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
      action: decision === "valider" ? "document_valide" : "document_refuse",
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

  if (dossier) {
    const societe = dossier.societe || "votre société";
    await prevenir(
      dossier.user_id,
      document.formalite_id,
      decision === "refuser"
        ? documentRefuse(document.name, societe, misAJour.rejection_reason ?? "Document non conforme")
        : documentValide(document.name, societe)
    );
  }

  return misAJour;
}


/**
 * Fait avancer le travail du cabinet d'un cran.
 *
 * Les cinq pastilles - Transmis, Révision, Vérifié, Dépôt, KBIS - existaient dans
 * l'écran et aucune ne s'allumait : aucune route n'écrivait jamais la colonne.
 *
 * Chaque passage prévient le client quand il le concerne. « Vérifié » est le moment
 * où on lui demande de publier son annonce légale : c'est la seule démarche qui reste
 * de son côté, et personne ne la lui demandait.
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
  const avis =
    vers === "5c"
      ? // Le dossier est vérifié : la publication de l'annonce revient au client.
        annonceAPublier(societe)
      : vers === "5b" && !types.has("depot-capital")
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
 * Dépose dans le dossier du client un document produit par le cabinet.
 *
 * Le Kbis et le registre des bénéficiaires n'avaient aucun chemin pour arriver : les
 * deux seules routes de dépôt sont les pièces attendues du client et le coffre
 * personnel, qui range dans les documents de celui qui dépose. Le message de fin
 * promettait pourtant au client de les trouver dans ses documents.
 */
export const LIVRABLES = {
  [TYPE_KBIS]: { titre: "Kbis", formats: [".pdf", ".jpg", ".jpeg", ".png"] },
  [TYPE_RBE]: {
    titre: "Registre des bénéficiaires effectifs",
    formats: [".pdf", ".jpg", ".jpeg", ".png"],
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
