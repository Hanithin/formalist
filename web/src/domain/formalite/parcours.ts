import { regle, verifierAssocies, verifierCapital, verifierRepartition, type Anomalie } from "./formes";

/**
 * Le parcours de création, étape par étape.
 *
 * Le formulaire d'origine gardait son brouillon dans le navigateur
 * (localStorage). Trois conséquences : le travail se perd en changeant d'appareil,
 * il disparaît avec l'historique de navigation, et le nom des pièces déposées
 * n'existait nulle part côté serveur - c'est précisément ce qui rendait impossible
 * de savoir à qui appartenait un fichier, et qui a laissé /api/file ouvert.
 *
 * Le brouillon vit désormais dans le dossier. Ce module décrit les étapes et dit,
 * pour un brouillon donné, ce qui manque encore.
 */

export interface Etape {
  numero: number;
  identifiant: string;
  titre: string;
  description: string;
}

export const ETAPES: Etape[] = [
  {
    numero: 1,
    identifiant: "societe",
    titre: "Informations de la société",
    description: "Nom, forme juridique, activité et adresse du siège.",
  },
  {
    numero: 2,
    identifiant: "associes",
    titre: "Associés",
    description: "Qui détient la société.",
  },
  {
    numero: 3,
    identifiant: "dirigeants",
    titre: "Dirigeants",
    description: "Qui la représente et l'engage.",
  },
  {
    numero: 4,
    identifiant: "capital",
    titre: "Répartition du capital",
    description: "Montant, libération et parts de chacun.",
  },
  {
    numero: 5,
    identifiant: "pieces",
    titre: "Pièces justificatives",
    description: "Identité, domicile et attestation de dépôt.",
  },
  {
    numero: 6,
    identifiant: "offre",
    titre: "Votre offre",
    description: "Ce que nous prenons en charge.",
  },
];

export interface Associe {
  prenom?: string;
  nom?: string;
  /** Part du capital détenue, en euros. */
  apport?: number;
}

export interface Dirigeant {
  prenom?: string;
  nom?: string;
}

/** Le brouillon, tel qu'il est stocké dans le dossier. */
export interface Brouillon {
  forme?: string;
  denomination?: string;
  activite?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  capital?: number;
  capitalLibere?: number;
  associes?: Associe[];
  dirigeants?: Dirigeant[];
  offre?: string;
}

const CODE_POSTAL = /^\d{5}$/;

/** Ce qui manque à une étape donnée. Une liste vide vaut « étape complète ». */
export function verifierEtape(numero: number, brouillon: Brouillon): Anomalie[] {
  const anomalies: Anomalie[] = [];

  if (numero === 1) {
    if (!regle(brouillon.forme)) {
      anomalies.push({ champ: "forme", message: "Choisissez une forme juridique" });
    }
    if (!brouillon.denomination?.trim()) {
      anomalies.push({ champ: "denomination", message: "Indiquez le nom de la société" });
    }
    if (!brouillon.activite?.trim()) {
      anomalies.push({ champ: "activite", message: "Décrivez l'activité" });
    }
    if (!brouillon.adresse?.trim()) {
      anomalies.push({ champ: "adresse", message: "Indiquez l'adresse du siège" });
    }
    if (!CODE_POSTAL.test(brouillon.codePostal ?? "")) {
      anomalies.push({ champ: "codePostal", message: "Le code postal comporte cinq chiffres" });
    }
    if (!brouillon.ville?.trim()) {
      anomalies.push({ champ: "ville", message: "Indiquez la ville" });
    }
    return anomalies;
  }

  if (numero === 2) {
    const associes = brouillon.associes ?? [];

    // Sans associé, l'étape n'est pas faite - même si la forme n'est pas encore
    // choisie. Se reposer sur les règles de forme rendait l'étape vide « complète ».
    if (associes.length === 0) {
      anomalies.push({ champ: "associes", message: "Ajoutez au moins un associé" });
      return anomalies;
    }

    if (brouillon.forme) anomalies.push(...verifierAssocies(brouillon.forme, associes.length));

    associes.forEach((a, i) => {
      if (!a.prenom?.trim() || !a.nom?.trim()) {
        anomalies.push({
          champ: "associes." + i,
          message: "Renseignez le prénom et le nom de l'associé " + (i + 1),
        });
      }
    });
    return anomalies;
  }

  if (numero === 3) {
    const dirigeants = brouillon.dirigeants ?? [];
    if (dirigeants.length === 0) {
      const titre = regle(brouillon.forme)?.titreDirigeant ?? "dirigeant";
      anomalies.push({ champ: "dirigeants", message: "Désignez le " + titre.toLowerCase() });
    }
    dirigeants.forEach((d, i) => {
      if (!d.prenom?.trim() || !d.nom?.trim()) {
        anomalies.push({
          champ: "dirigeants." + i,
          message: "Renseignez le prénom et le nom du dirigeant " + (i + 1),
        });
      }
    });
    return anomalies;
  }

  if (numero === 4) {
    const capital = brouillon.capital ?? 0;
    const libere = brouillon.capitalLibere ?? 0;

    if (capital <= 0) {
      anomalies.push({ champ: "capital", message: "Indiquez le montant du capital" });
      return anomalies;
    }

    if (brouillon.forme) anomalies.push(...verifierCapital(brouillon.forme, capital, libere));

    const parts = (brouillon.associes ?? []).map((a) => a.apport ?? 0);
    if (parts.length) anomalies.push(...verifierRepartition(capital, parts));
    return anomalies;
  }

  if (numero === 6 && !brouillon.offre) {
    anomalies.push({ champ: "offre", message: "Choisissez une offre" });
  }

  // Étape 5 : les pièces sont vérifiées à leur dépôt, pas ici. Elle ne bloque
  // donc jamais le parcours, et compte comme faite dès le départ.
  return anomalies;
}

/** La première étape encore incomplète, ou null si tout est renseigné. */
export function premiereEtapeIncomplete(brouillon: Brouillon): number | null {
  for (const etape of ETAPES) {
    if (verifierEtape(etape.numero, brouillon).length > 0) return etape.numero;
  }
  return null;
}

/**
 * Jusqu'où la personne peut aller.
 *
 * On laisse revenir en arrière librement, mais pas sauter par-dessus une étape
 * incomplète : les étapes suivantes s'appuient sur ce qui précède - la
 * répartition du capital n'a pas de sens sans les associés.
 */
export function etapeAccessible(demandee: number, brouillon: Brouillon): number {
  const bloquante = premiereEtapeIncomplete(brouillon);
  if (bloquante === null) return Math.min(Math.max(demandee, 1), ETAPES.length);
  return Math.min(Math.max(demandee, 1), bloquante);
}

export function avancementParcours(brouillon: Brouillon): number {
  const completes = ETAPES.filter((e) => verifierEtape(e.numero, brouillon).length === 0).length;
  return Math.round((completes / ETAPES.length) * 100);
}
