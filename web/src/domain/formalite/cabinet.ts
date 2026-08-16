/**
 * Ce qu'il reste à faire au cabinet, sur un dossier.
 *
 * Le pendant de suivi.ts, vu de l'autre côté. Le client voit où en est son dossier ;
 * l'avocat doit voir ce qu'on attend de lui, dans l'ordre, sans avoir à reconstituer
 * l'état du dossier depuis cinq onglets et une colonne de sous-phases.
 *
 * L'espace avocat était celui de la création, réemployé tel quel : cinq pastilles
 * « Transmis / Révision / Vérifié / Dépôt / KBIS » et deux livrables, Kbis et registre
 * des bénéficiaires. Sur une modification, aucun de ces mots n'est juste - il n'y a
 * pas de Kbis, il y a un extrait à jour - et rien ne parlait des statuts.
 */

export type TypeDeDossier = "creation" | "modification" | "auto-entrepreneur";

export type EtatTache = "faite" | "a_faire" | "plus_tard";

export interface Tache {
  identifiant: string;
  titre: string;
  /** Pourquoi elle existe, et ce qu'elle engage. */
  explication: string;
  etat: EtatTache;
  /** Où elle se fait, dans l'écran du dossier. */
  onglet?: string;
  /** Ce qui l'empêche encore, quand elle attend autre chose. */
  bloquee?: string;
}

export interface EtatDuCabinet {
  type: TypeDeDossier;
  status: string | null;
  sousPhase: string | null;
  /** Des documents attendent une décision de l'avocat. */
  piecesAVerifier: number;
  /** Les actes ont été produits. */
  actesProduits: boolean;
  /** Les statuts en vigueur sont au dossier. */
  statutsAuDossier: boolean;
  /** Les statuts à jour ont été produits. */
  statutsAJour: boolean;
  /** Le nombre d'avis à publier ; zéro quand la modification n'en demande pas. */
  avisAPublier: number;
  /** Les avis ont été publiés par le cabinet. */
  avisPublies: boolean;
  /** Le document final a été remis au client. */
  finalRemis: boolean;
  /** La modification touche-t-elle au texte des statuts ? */
  statutsConcernes: boolean;
}

const ORDRE = ["5a", "5b", "5c", "5d", "5e"];

function auMoins(sousPhase: string | null, seuil: string): boolean {
  if (!sousPhase) return false;
  const rang = ORDRE.indexOf(sousPhase);
  return rang >= 0 && rang >= ORDRE.indexOf(seuil);
}

/**
 * Le mot juste selon le dossier.
 *
 * « KBIS » sur une modification est faux : le greffe délivre un extrait à jour, non
 * une immatriculation. Une auto-entreprise, elle, reçoit un SIRET. Le tenir dans une
 * table plutôt qu'en conditions semées dans les écrans évite qu'un seul des trois
 * endroits soit corrigé.
 */
export const DOCUMENT_FINAL: Record<TypeDeDossier, string> = {
  creation: "Extrait Kbis",
  modification: "Extrait à jour",
  "auto-entrepreneur": "Avis de situation SIRENE",
};

export const LIBELLES_SOUS_PHASES: Record<TypeDeDossier, Record<string, string>> = {
  creation: {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Dépôt",
    "5e": "Kbis",
  },
  modification: {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Dépôt",
    "5e": "Extrait",
  },
  "auto-entrepreneur": {
    "5a": "Transmis",
    "5b": "Révision",
    "5c": "Vérifié",
    "5d": "Guichet",
    "5e": "SIRET",
  },
};

export function libelleSousPhase(type: TypeDeDossier, sousPhase: string): string {
  return LIBELLES_SOUS_PHASES[type]?.[sousPhase] ?? sousPhase;
}

/**
 * Les tâches du cabinet, dans l'ordre où elles se font.
 *
 * Une tâche « plus tard » n'est pas grisée par principe : elle dit ce qu'elle attend.
 * « Publier l'avis » avant d'avoir vérifié le dossier ferait paraître, au tarif du
 * caractère, un avis qu'il faudra republier.
 */
export function travailDuCabinet(etat: EtatDuCabinet): Tache[] {
  const taches: Tache[] = [];
  const verifie = auMoins(etat.sousPhase, "5c") || etat.status === "valide" || etat.status === "terminee";
  const depose = auMoins(etat.sousPhase, "5d");

  taches.push({
    identifiant: "informations",
    titre: "Vérifier les informations du dossier",
    explication:
      "Relisez ce que le client a saisi. Une erreur ici se retrouve dans tous les actes, et le greffe la renvoie des semaines plus tard.",
    etat: verifie ? "faite" : "a_faire",
    onglet: "recapitulatif",
  });

  taches.push({
    identifiant: "pieces",
    titre:
      etat.piecesAVerifier > 0
        ? etat.piecesAVerifier + (etat.piecesAVerifier === 1 ? " pièce à vérifier" : " pièces à vérifier")
        : "Vérifier les pièces justificatives",
    explication:
      "Validez ou refusez chaque justificatif, avec un motif. Un refus prévient le client, qui peut remplacer la pièce.",
    etat: etat.piecesAVerifier > 0 ? "a_faire" : "faite",
    onglet: "pieces",
  });

  taches.push({
    identifiant: "actes",
    titre: "Produire les actes",
    explication:
      "Procès-verbal, avenant aux statuts et, selon le cas, acte de cession ou déclaration de non-condamnation.",
    etat: etat.actesProduits ? "faite" : "a_faire",
    onglet: "actes",
  });

  if (etat.type === "modification" && etat.statutsConcernes) {
    taches.push({
      identifiant: "statuts",
      titre: "Mettre les statuts à jour",
      explication:
        "Remplacez, dans les statuts en vigueur, chaque passage que les décisions changent. Le reste du document ne bouge pas.",
      etat: etat.statutsAJour ? "faite" : "a_faire",
      onglet: "statuts",
      bloquee: etat.statutsAuDossier
        ? undefined
        : "Les statuts en vigueur ne sont pas au dossier : demandez-les au client.",
    });
  }

  if (etat.avisAPublier > 0) {
    taches.push({
      identifiant: "annonce",
      titre:
        etat.avisAPublier > 1
          ? "Publier les " + etat.avisAPublier + " avis de modification"
          : "Publier l'avis de modification",
      explication:
        etat.avisAPublier > 1
          ? "Le siège change de ressort : un avis paraît dans le département de départ, un autre dans celui d'arrivée. Le texte de chacun est rédigé, il n'y a qu'à le copier."
          : "Le texte est rédigé : copiez-le dans le formulaire du support habilité, puis joignez l'attestation de parution au dossier.",
      etat: etat.avisPublies ? "faite" : "a_faire",
      onglet: "annonce",
      bloquee: verifie ? undefined : "Vérifiez d'abord le dossier : un avis erroné se republie à vos frais.",
    });
  }

  taches.push({
    identifiant: "depot",
    titre: "Déposer au guichet unique",
    explication:
      "Transmettez le dossier à l'INPI au nom du client, avec les actes et les statuts à jour.",
    etat: depose ? "faite" : "a_faire",
    onglet: "avancement",
    bloquee: verifie ? undefined : "Le dossier n'est pas encore vérifié.",
  });

  taches.push({
    identifiant: "final",
    titre: "Remettre " + DOCUMENT_FINAL[etat.type].toLowerCase(),
    explication: "Déposez le document délivré par le greffe : le client en est prévenu aussitôt.",
    etat: etat.finalRemis ? "faite" : "a_faire",
    onglet: "avancement",
    bloquee: depose ? undefined : "Le dépôt n'a pas encore eu lieu.",
  });

  return taches;
}

/** La première tâche à faire, celle qu'on met en avant. */
export function tacheEnCours(taches: Tache[]): Tache | null {
  return taches.find((t) => t.etat === "a_faire" && !t.bloquee) ?? null;
}

/** Ce qui reste, pour l'annoncer en un chiffre. */
export function resteAFaire(taches: Tache[]): number {
  return taches.filter((t) => t.etat !== "faite").length;
}
