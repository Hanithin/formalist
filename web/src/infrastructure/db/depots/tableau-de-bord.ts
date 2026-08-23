import { prisma } from "../client";
import { mesDossiers, exigerDossier } from "./dossiers";
import { actionsAttendues, prochaineEtape, type ContexteDossier } from "@/domain/formalite/actions";
import { premiereEtapeIncomplete, type Brouillon } from "@/domain/formalite/parcours";
import type { EntreeJournal } from "@/domain/formalite/journal";
import { dateLimiteApprobation, dateLimiteDepot } from "@/domain/comptes/regles";
import { termeDuMandat } from "@/domain/fermeture/delais";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Le tableau de bord.
 *
 * Les compteurs sont demandés en une fois plutôt qu'un par dossier : la page
 * d'origine enchaînait un appel par société, ce qui la rendait lente dès trois
 * dossiers.
 */

/**
 * La banque du dépôt de capital.
 *
 * Elle vit dans le brouillon sous NOM_BANQUE, pas en colonne. Le tableau de bord
 * d'origine lisait `f.banque` sur le dossier, donc toujours indéfini : « Choisir
 * votre banque » restait affiché même une fois la banque choisie.
 */
function banqueDe(brouillon: Record<string, unknown>): string | null {
  const nom = brouillon.NOM_BANQUE;
  return typeof nom === "string" && nom.trim() ? nom : null;
}

function lireBrouillon(dataJson: string | null): Brouillon & Record<string, unknown> {
  if (!dataJson) return {};
  try {
    const analyse: unknown = JSON.parse(dataJson);
    return analyse && typeof analyse === "object"
      ? (analyse as Brouillon & Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function tableauDeBord(utilisateur: UtilisateurConnecte) {
  /*
   * Les siens, jamais ceux de toute la plateforme.
   *
   * listerDossiers rend tout à un administrateur : son accueil annonçait « Vos
   * sociétés » avec les soixante-dix-neuf dossiers des clients, et « Maître Dupont
   * vous a écrit » pour un message reçu dans le dossier de quelqu'un d'autre. Le lien
   * menait alors à une messagerie où ce fil n'existe pas - elle ne montre que les
   * siens - et l'écran restait vide.
   *
   * Un administrateur qui veut voir le dossier d'un client passe par l'administration
   * ou l'espace avocat, où c'est annoncé. La bibliothèque de documents et la
   * messagerie posaient déjà cette règle.
   */
  const dossiers = await mesDossiers(utilisateur);
  if (dossiers.length === 0) return { dossiers: [], societes: [], activite: [] };

  const identifiants = dossiers.map((d) => d.id);

  const [rejetes, signatures, nonLus, derniers, journal] = await Promise.all([
    prisma.documents.groupBy({
      by: ["formalite_id"],
      where: { formalite_id: { in: identifiants }, rejection_reason: { not: null } },
      _count: { _all: true },
    }),
    prisma.signature_requests.groupBy({
      by: ["formalite_id", "signed_at"],
      where: { formalite_id: { in: identifiants } },
      _count: { _all: true },
    }),
    // Ses propres messages ne lui sont pas signalés comme non lus.
    prisma.messages.groupBy({
      by: ["formalite_id"],
      where: {
        formalite_id: { in: identifiants },
        read: false,
        sender_id: { not: utilisateur.id },
      },
      _count: { _all: true },
    }),
    /*
     * Le dernier message reçu, non seulement leur nombre.
     *
     * « 1 nouveau message » ne dit ni qui écrit ni de quoi il s'agit : on ouvre pour
     * l'apprendre. Le nom de l'expéditeur et les premiers mots suffisent le plus
     * souvent à savoir si cela presse.
     */
    prisma.messages.findMany({
      where: {
        formalite_id: { in: identifiants },
        read: false,
        sender_id: { not: utilisateur.id },
      },
      /*
       * Un par dossier, non les quarante plus récents du compte.
       *
       * Trié sur l'ensemble puis tronqué, un dossier bavard prenait toute la place et
       * les autres se retrouvaient sans dernier message - donc sans rien à dire.
       */
      distinct: ["formalite_id"],
      orderBy: [{ formalite_id: "asc" }, { created_at: "desc" }],
      select: {
        formalite_id: true,
        content: true,
        kind: true,
        created_at: true,
        users: { select: { name: true } },
      },
    }),
    // Le fil d'activité, en une requête plutôt qu'un appel par dossier comme le
    // faisait la page d'origine.
    prisma.audit_log.findMany({
      where: { formalite_id: { in: identifiants } },
      orderBy: { created_at: "desc" },
      take: 40,
      include: { users: { select: { name: true } } },
    }),
  ]);

  const rejetesPar = new Map(rejetes.map((r) => [r.formalite_id, r._count._all]));
  const nonLusPar = new Map(nonLus.map((m) => [m.formalite_id, m._count._all]));

  // La requête en rend déjà un seul par dossier, le plus récent.
  const dernierPar = new Map(derniers.map((m) => [m.formalite_id, m]));

  const signaturesPar = new Map<number, { total: number; enAttente: number }>();
  for (const s of signatures) {
    const courant = signaturesPar.get(s.formalite_id) ?? { total: 0, enAttente: 0 };
    courant.total += s._count._all;
    if (!s.signed_at) courant.enAttente += s._count._all;
    signaturesPar.set(s.formalite_id, courant);
  }

  /**
   * Les deux dates que les dossiers portent vraiment.
   *
   * L'accueil annonce des échéances, et il n'a pas de calendrier des obligations : on
   * ne lui donne donc que ce qui est réellement saisi. La clôture d'un exercice
   * commande la date limite de dépôt ; la dissolution commande le terme du mandat du
   * liquidateur. Le reste attendra que la donnée existe.
   */
  function echeanceDu(d: (typeof dossiers)[number]): {
    limiteDepot: string | null;
    termeDuMandat: string | null;
  } {
    if (d.type !== "comptes" && d.type !== "fermeture") {
      return { limiteDepot: null, termeDuMandat: null };
    }

    let valeurs: Record<string, unknown> = {};
    try {
      const lu: unknown = JSON.parse(d.data_json ?? "{}");
      if (lu && typeof lu === "object" && "valeurs" in lu) {
        const brut = (lu as { valeurs?: unknown }).valeurs;
        if (brut && typeof brut === "object") valeurs = brut as Record<string, unknown>;
      }
      if (d.type === "comptes" && lu && typeof lu === "object" && "societe" in lu) {
        const societe = (lu as { societe?: { forme?: string } }).societe;
        if (societe?.forme) valeurs.__forme = societe.forme;
      }
    } catch {
      return { limiteDepot: null, termeDuMandat: null };
    }

    const texte = (cle: string) =>
      typeof valeurs[cle] === "string" ? (valeurs[cle] as string) : null;

    if (d.type === "comptes") {
      const approbation = dateLimiteApprobation(
        typeof valeurs.__forme === "string" ? valeurs.__forme : d.forme,
        texte("dateCloture")
      );
      return { limiteDepot: dateLimiteDepot(approbation), termeDuMandat: null };
    }

    return { limiteDepot: null, termeDuMandat: termeDuMandat(texte("dateDissolution")) };
  }

  const societes = dossiers.map((d) => {
    const brouillon = lireBrouillon(d.data_json);
    const compteurs = signaturesPar.get(d.id) ?? { total: 0, enAttente: 0 };

    const contexte: ContexteDossier = {
      dossierId: d.id,
      type: d.type,
      status: d.status,
      phase: d.phase ?? 1,
      banque: banqueDe(brouillon),
      capital: brouillon.capital ?? null,
      // Les trois premières étapes du parcours renseignent la société, ses
      // associés et son dirigeant : au-delà, les informations sont complètes.
      informationsCompletes: (premiereEtapeIncomplete(brouillon) ?? 9) > 3,
      documentsRejetes: rejetesPar.get(d.id) ?? 0,
      signaturesEnAttente: compteurs.enAttente,
      signaturesTotal: compteurs.total,
    };

    const actions = actionsAttendues(contexte);

    return {
      id: d.id,
      societe: d.societe || "Sans nom",
      forme: d.forme,
      // Le type nomme le bandeau du bloc de tête : « Création », « Modification ».
      type: d.type,
      status: d.status,
      phase: d.phase ?? 1,
      // Une fois les informations saisies, l'étape 1 est derrière nous, même si
      // la colonne n'a pas encore bougé : sans cela la vignette annonce « Étape 1
      // · Informations » à quelqu'un qui en est au dépôt du capital.
      etapeAffichee: Math.max(d.phase ?? 1, contexte.informationsCompletes ? 2 : 1),
      offre: d.offer,
      nonLus: nonLusPar.get(d.id) ?? 0,
      dernierMessage: (() => {
        const m = dernierPar.get(d.id);
        return m
          ? {
              auteur: m.users?.name ?? "Le cabinet",
              extrait: m.content,
              genre: m.kind ?? "text",
            }
          : null;
      })(),
      majLe: d.updated_at,
      attendLeClient: actions.length > 0,
      prochaineEtape: prochaineEtape(contexte),
      actions,
      ...echeanceDu(d),
    };
  });

  const nomsPar = new Map(societes.map((s) => [s.id, s.societe]));

  const activite: (EntreeJournal & { dossierId: number; societe: string })[] = journal.map((e) => ({
    dossierId: e.formalite_id as number,
    societe: nomsPar.get(e.formalite_id as number) ?? "Sans nom",
    action: e.action,
    auteurRole: e.actor_role,
    auteur: e.users?.name ?? null,
    champ: e.target_field,
    valeur: e.after_value,
    commentaire: e.comment,
    quand: e.created_at,
  }));

  return { dossiers, societes, activite };
}

/**
 * Ce que l'accueil affiche en plus quand un seul dossier est ouvert.
 *
 * La page d'origine allait le chercher après coup (loadSingleExtras : deux appels
 * à /api/formalites/:id et /audit, avec « Chargement… » en attendant). Ici il
 * arrive avec la page, et le mot d'attente disparaît.
 */
export async function focusDuDossier(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossier(utilisateur, dossierId);

  const [documents, avocat] = await Promise.all([
    prisma.documents.findMany({
      where: { formalite_id: dossierId },
      orderBy: { created_at: "desc" },
      take: 6,
      select: { id: true, name: true, status: true, rejection_reason: true, file_path: true },
    }),
    dossier.assigned_avocat_id
      ? prisma.users.findUnique({
          where: { id: dossier.assigned_avocat_id },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  return {
    documents: documents.map((d) => ({
      id: d.id,
      nom: d.name,
      statut: d.status,
      motifRejet: d.rejection_reason,
      fichier: d.file_path,
    })),
    avocat: avocat?.name ?? null,
  };
}
