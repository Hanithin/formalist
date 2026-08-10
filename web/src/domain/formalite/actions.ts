/**
 * Ce qu'on attend du client, dossier par dossier.
 *
 * Porté depuis buildTodoList de public/dashboard.html. L'ordre compte : les
 * entrées sont rendues dans l'ordre où elles bloquent le dossier, pour qu'on
 * sache par quoi commencer sans avoir à comprendre le parcours.
 */

export interface ContexteDossier {
  dossierId: number;
  status: string | null;
  phase: number;
  banque?: string | null;
  capital?: number | null;
  informationsCompletes: boolean;
  documentsRejetes: number;
  signaturesEnAttente: number;
  signaturesTotal: number;
}

export interface ActionAttendue {
  titre: string;
  precision: string;
  bouton: string;
  lien: string;
  /** Ce qui bloque vraiment le dossier, par opposition à ce qui l'avance. */
  urgent: boolean;
}

function montantLisible(capital: number | null | undefined): string {
  if (typeof capital !== "number" || !Number.isFinite(capital) || capital <= 0) {
    return "votre capital";
  }
  return capital.toLocaleString("fr-FR") + " euros";
}

export function actionsAttendues(ctx: ContexteDossier): ActionAttendue[] {
  if (ctx.status === "terminee") return [];

  const lien = "/creation?dossier=" + ctx.dossierId;
  const actions: ActionAttendue[] = [];

  // Un document refusé passe avant tout : il bloque la suite et le client ne
  // sait pas toujours qu'on l'attend.
  if (ctx.documentsRejetes > 0) {
    actions.push({
      titre:
        ctx.documentsRejetes > 1
          ? ctx.documentsRejetes + " documents à remplacer"
          : "Un document à remplacer",
      precision: "Votre avocat a demandé un justificatif conforme",
      bouton: "Remplacer",
      lien,
      urgent: true,
    });
  }

  // Les étapes du parcours s'excluent : une seule est la prochaine à faire.
  if (!ctx.informationsCompletes) {
    actions.push({
      titre: "Compléter les informations",
      precision: "Nom, forme juridique, capital et dirigeant",
      bouton: "Compléter",
      lien,
      urgent: false,
    });
  } else if (!ctx.banque) {
    actions.push({
      titre: "Choisir votre banque",
      precision: "Pour recevoir le dépôt de capital social",
      bouton: "Choisir",
      lien,
      urgent: false,
    });
  } else if (ctx.phase < 3) {
    actions.push({
      titre: "Déposer " + montantLisible(ctx.capital) + " sur votre compte " + ctx.banque,
      precision: "Puis envoyez-nous l'attestation de dépôt",
      bouton: "Envoyer l'attestation",
      lien,
      urgent: false,
    });
  } else if (ctx.phase === 3) {
    actions.push({
      titre: "Déposer les pièces des associés",
      precision: "Pièce d'identité et justificatif de domicile",
      bouton: "Déposer",
      lien,
      urgent: false,
    });
  }

  if (ctx.signaturesEnAttente > 0 && ctx.signaturesTotal > 0) {
    actions.push({
      titre:
        ctx.signaturesEnAttente > 1
          ? ctx.signaturesEnAttente + " signatures manquantes"
          : "Une signature manquante",
      precision: "Les statuts partent au greffe une fois tous les associés signataires",
      bouton: "Voir les signatures",
      lien,
      urgent: true,
    });
  }

  return actions;
}

/** Un dossier qui attend quelque chose du client se distingue de celui qui avance. */
export function attendLeClient(ctx: ContexteDossier): boolean {
  return actionsAttendues(ctx).length > 0;
}

/**
 * Où en est le dossier, en une phrase.
 *
 * Quand quelque chose est attendu du client, c'est cette action ; sinon, c'est ce
 * que fait la plateforme. Une vignette qui ne dit rien pousse à ouvrir le dossier
 * pour rien.
 */
export function prochaineEtape(ctx: ContexteDossier): string {
  if (ctx.status === "terminee") {
    return "Votre société est immatriculée, le K-bis est disponible.";
  }

  const [premiere] = actionsAttendues(ctx);
  if (premiere) {
    const precision = premiere.precision;
    return premiere.titre + " : " + precision.charAt(0).toLowerCase() + precision.slice(1) + ".";
  }

  if (ctx.phase >= 5) return "Dossier déposé au greffe, réception du K-bis sous 24 à 72 h.";
  if (ctx.phase === 4) {
    return "Un avocat vérifie l'ensemble de vos documents avant le dépôt au greffe.";
  }
  return "Votre dossier est en cours de traitement par notre équipe.";
}

export type EtatTableauDeBord = "aucun" | "unique" | "plusieurs" | "tous_termines";

/**
 * Ce que le tableau de bord doit montrer.
 *
 * Trois écrans très différents se cachaient derrière la même page : aucune
 * société, une seule, ou plusieurs. Le nommer ici évite de le redécider à chaque
 * bloc d'affichage.
 */
export function etatTableauDeBord(dossiers: { status: string | null }[]): EtatTableauDeBord {
  if (dossiers.length === 0) return "aucun";
  if (dossiers.every((d) => d.status === "terminee")) return "tous_termines";
  return dossiers.length === 1 ? "unique" : "plusieurs";
}

/** Salutation selon l'heure, comme le faisait la page d'origine. */
export function salutation(maintenant: Date = new Date()): string {
  const heure = maintenant.getHours();
  if (heure < 6) return "Bonsoir";
  if (heure < 18) return "Bonjour";
  return "Bonsoir";
}
