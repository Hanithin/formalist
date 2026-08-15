/**
 * Déclaration d'auto-entreprise.
 *
 * Porté depuis public/auto-entrepreneur.html : sept étapes et cinquante-trois
 * champs, avec des règles qui dépendaient les unes des autres sans être écrites
 * nulle part.
 *
 * Les taux et seuils sont ceux en vigueur au 10 août 2026. Ils changent chaque
 * année : ils sont déclarés ici, une fois, et non recopiés dans les écrans.
 */

export type NatureActivite = "commerciale" | "artisanale" | "liberale";

export interface RegleActivite {
  code: NatureActivite;
  libelle: string;
  /** Régime d'imposition qui s'applique de plein droit. */
  regimeFiscal: "Micro-BIC" | "Micro-BNC";
  /** Plafond de chiffre d'affaires annuel, en euros. */
  plafond: number;
  /** Taux du versement libératoire, en pourcentage du chiffre d'affaires. */
  tauxVersementLiberatoire: number;
}

export const ACTIVITES: Record<NatureActivite, RegleActivite> = {
  commerciale: {
    code: "commerciale",
    libelle: "Achat et revente de marchandises",
    regimeFiscal: "Micro-BIC",
    plafond: 188_700,
    tauxVersementLiberatoire: 1,
  },
  artisanale: {
    code: "artisanale",
    libelle: "Prestations de services artisanales ou commerciales",
    regimeFiscal: "Micro-BIC",
    plafond: 77_700,
    tauxVersementLiberatoire: 1.7,
  },
  liberale: {
    code: "liberale",
    libelle: "Activité libérale",
    regimeFiscal: "Micro-BNC",
    plafond: 77_700,
    tauxVersementLiberatoire: 2.2,
  },
};

export function regleActivite(nature: string | null | undefined): RegleActivite | null {
  return nature && nature in ACTIVITES ? ACTIVITES[nature as NatureActivite] : null;
}

/**
 * Le régime fiscal découle de l'activité : il n'y a pas à le demander.
 *
 * Le formulaire d'origine le faisait choisir, ce qui permettait de déclarer une
 * activité libérale au Micro-BIC - une combinaison qui n'existe pas.
 */
export function regimeFiscalDe(nature: string | null | undefined): string | null {
  return regleActivite(nature)?.regimeFiscal ?? null;
}

export interface Etape {
  numero: number;
  identifiant: string;
  titre: string;
  /**
   * Le mot du fil d'étapes.
   *
   * Il est court parce que sept libellés se partagent une ligne : « Options fiscales
   * et sociales » et « Pièces justificatives » se chevauchaient. Ce sont ceux du
   * formulaire d'origine, dont le fil portait déjà des mots d'un seul tenant.
   */
  libelleCourt: string;
}

export const ETAPES: Etape[] = [
  { numero: 1, identifiant: "identite", titre: "Identité", libelleCourt: "Identité" },
  { numero: 2, identifiant: "adresse", titre: "Adresse et situation", libelleCourt: "Adresse" },
  { numero: 3, identifiant: "activite", titre: "Activité", libelleCourt: "Activité" },
  {
    numero: 4,
    identifiant: "options",
    titre: "Options fiscales et sociales",
    libelleCourt: "Fiscalité",
  },
  {
    numero: 5,
    identifiant: "pieces",
    titre: "Pièces justificatives",
    libelleCourt: "Documents",
  },
  {
    numero: 6,
    identifiant: "filiation",
    titre: "Déclaration et filiation",
    libelleCourt: "Déclaration",
  },
  {
    numero: 7,
    identifiant: "recapitulatif",
    titre: "Récapitulatif",
    libelleCourt: "Récapitulatif",
  },
];

export interface Declaration {
  civilite?: string;
  /**
   * Le numéro de sécurité sociale.
   *
   * Le guichet unique l'exige : c'est lui qui rattache l'auto-entreprise au régime
   * social de la personne. Sans lui, la déclaration est rejetée.
   */
  numeroSecuriteSociale?: string;
  nomNaissance?: string;
  nomUsage?: string;
  prenoms?: string;
  dateNaissance?: string;
  villeNaissance?: string;
  paysNaissance?: string;
  nationalite?: string;

  adresseVoie?: string;
  adresseComplement?: string;
  codePostal?: string;
  ville?: string;
  /** Elle figure sur la déclaration : le régime matrimonial engage le conjoint. */
  situationMatrimoniale?: string;
  /** L'entreprise est-elle domiciliée ailleurs qu'au domicile ? */
  adresseEntrepriseDistincte?: boolean;
  entrepriseVoie?: string;
  entrepriseComplement?: string;
  entrepriseCodePostal?: string;
  entrepriseVille?: string;

  natureActivite?: string;
  descriptionActivite?: string;
  codeApe?: string;
  dateDebut?: string;
  lieuExercice?: string;
  /**
   * Une activité réglementée demande un justificatif de plus.
   *
   * Coiffure, bâtiment, transport, restauration... : le guichet réclame le diplôme
   * ou l'autorisation avant d'immatriculer. On le demande ici plutôt que de le
   * découvrir au dépôt.
   */
  activiteReglementee?: boolean;

  versementLiberatoire?: boolean;
  acre?: boolean;

  filiationMere?: string;
  filiationPere?: string;
  certifie?: boolean;
}

/**
 * Les situations matrimoniales, telles que la déclaration les demande.
 *
 * Le régime matrimonial n'est pas une curiosité administrative : sous un régime
 * communautaire, les biens de l'entreprise engagent aussi le conjoint.
 */
export const SITUATIONS = [
  "Célibataire",
  "Marié(e)",
  "Pacsé(e)",
  "Divorcé(e)",
  "Veuf(ve)",
] as const;

/** Où l'activité s'exerce, ce qui décide notamment de la taxe applicable. */
export const LIEUX_EXERCICE = [
  "À mon domicile",
  "Chez mes clients",
  "Dans un local dédié",
  "Sur les marchés ou en ambulant",
  "En ligne uniquement",
] as const;

export interface Anomalie {
  champ: string;
  message: string;
}

const CODE_POSTAL = /^\d{5}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Le numéro de sécurité sociale : quinze chiffres, espaces tolérés.
 *
 * On vérifie la longueur, non la clé de contrôle : une clé fausse se corrige au
 * guichet, tandis qu'un numéro tronqué est une faute de saisie qu'on peut attraper
 * ici. Refuser sur un calcul mal reproduit ferait plus de mal que de bien.
 */
export function numeroSecuriteSocialeValide(brut: string | null | undefined): boolean {
  return /^\d{15}$/.test((brut ?? "").replace(/\s/g, ""));
}

/** Âge minimum pour déclarer une activité en son nom propre. */
const AGE_MINIMUM = 16;

export function ageA(naissance: string, maintenant: Date = new Date()): number | null {
  if (!DATE.test(naissance)) return null;

  const date = new Date(naissance + "T00:00:00Z");
  if (isNaN(date.getTime())) return null;

  let age = maintenant.getUTCFullYear() - date.getUTCFullYear();
  const moisEcoules =
    maintenant.getUTCMonth() - date.getUTCMonth() ||
    maintenant.getUTCDate() - date.getUTCDate();
  if (moisEcoules < 0) age -= 1;

  return age;
}

export function verifierEtape(
  numero: number,
  declaration: Declaration,
  maintenant: Date = new Date()
): Anomalie[] {
  const anomalies: Anomalie[] = [];

  if (numero === 1) {
    if (!declaration.civilite) anomalies.push({ champ: "civilite", message: "Indiquez votre civilité" });
    if (!declaration.nomNaissance?.trim()) {
      anomalies.push({ champ: "nomNaissance", message: "Indiquez votre nom de naissance" });
    }
    if (!declaration.prenoms?.trim()) {
      anomalies.push({ champ: "prenoms", message: "Indiquez vos prénoms" });
    }
    if (!DATE.test(declaration.dateNaissance ?? "")) {
      anomalies.push({ champ: "dateNaissance", message: "Indiquez votre date de naissance" });
    } else {
      const age = ageA(declaration.dateNaissance!, maintenant);
      if (age !== null && age < AGE_MINIMUM) {
        anomalies.push({
          champ: "dateNaissance",
          message: "Il faut avoir au moins " + AGE_MINIMUM + " ans pour déclarer une activité",
        });
      }
      if (age !== null && age > 120) {
        anomalies.push({ champ: "dateNaissance", message: "Cette date de naissance est invalide" });
      }
    }
    if (!declaration.villeNaissance?.trim()) {
      anomalies.push({ champ: "villeNaissance", message: "Indiquez votre ville de naissance" });
    }
    if (!declaration.nationalite?.trim()) {
      anomalies.push({ champ: "nationalite", message: "Indiquez votre nationalité" });
    }
    if (!numeroSecuriteSocialeValide(declaration.numeroSecuriteSociale)) {
      anomalies.push({
        champ: "numeroSecuriteSociale",
        message: "Le numéro de sécurité sociale comporte quinze chiffres",
      });
    }
    return anomalies;
  }

  if (numero === 2) {
    if (!declaration.adresseVoie?.trim()) {
      anomalies.push({ champ: "adresseVoie", message: "Indiquez votre adresse" });
    }
    if (!CODE_POSTAL.test(declaration.codePostal ?? "")) {
      anomalies.push({ champ: "codePostal", message: "Le code postal comporte cinq chiffres" });
    }
    if (!declaration.ville?.trim()) {
      anomalies.push({ champ: "ville", message: "Indiquez votre ville" });
    }
    if (!declaration.situationMatrimoniale) {
      anomalies.push({
        champ: "situationMatrimoniale",
        message: "Indiquez votre situation matrimoniale",
      });
    }

    // L'adresse de l'entreprise n'est demandée que si elle diffère du domicile.
    if (declaration.adresseEntrepriseDistincte) {
      if (!declaration.entrepriseVoie?.trim()) {
        anomalies.push({ champ: "entrepriseVoie", message: "Indiquez l'adresse de l'entreprise" });
      }
      if (!CODE_POSTAL.test(declaration.entrepriseCodePostal ?? "")) {
        anomalies.push({
          champ: "entrepriseCodePostal",
          message: "Le code postal comporte cinq chiffres",
        });
      }
      if (!declaration.entrepriseVille?.trim()) {
        anomalies.push({ champ: "entrepriseVille", message: "Indiquez la ville de l'entreprise" });
      }
    }
    return anomalies;
  }

  if (numero === 3) {
    if (!regleActivite(declaration.natureActivite)) {
      anomalies.push({ champ: "natureActivite", message: "Choisissez la nature de votre activité" });
    }
    if (!declaration.descriptionActivite?.trim()) {
      anomalies.push({ champ: "descriptionActivite", message: "Décrivez votre activité" });
    }
    if (!DATE.test(declaration.dateDebut ?? "")) {
      anomalies.push({ champ: "dateDebut", message: "Indiquez la date de début d'activité" });
    }
    if (!declaration.lieuExercice) {
      anomalies.push({ champ: "lieuExercice", message: "Indiquez où vous exercez" });
    }
    return anomalies;
  }

  if (numero === 6) {
    if (!declaration.filiationMere?.trim()) {
      anomalies.push({ champ: "filiationMere", message: "Indiquez le nom de votre mère" });
    }
    if (!declaration.filiationPere?.trim()) {
      anomalies.push({ champ: "filiationPere", message: "Indiquez le nom de votre père" });
    }
    if (!declaration.certifie) {
      anomalies.push({
        champ: "certifie",
        message: "Certifiez l'exactitude des informations avant d'envoyer",
      });
    }
    return anomalies;
  }

  // Les étapes 4, 5 et 7 n'imposent rien : les options ont des valeurs par
  // défaut, les pièces se vérifient au dépôt, et le récapitulatif ne fait que
  // relire ce qui précède.
  return anomalies;
}

export function premiereEtapeIncomplete(
  declaration: Declaration,
  maintenant: Date = new Date()
): number | null {
  for (const etape of ETAPES) {
    if (verifierEtape(etape.numero, declaration, maintenant).length > 0) return etape.numero;
  }
  return null;
}

/** Ce que rapporte le versement libératoire, pour aider à choisir. */
export function coutVersementLiberatoire(
  nature: string | null | undefined,
  chiffreAffaires: number
): number | null {
  const regle = regleActivite(nature);
  if (!regle || !Number.isFinite(chiffreAffaires) || chiffreAffaires < 0) return null;

  return Math.round(chiffreAffaires * regle.tauxVersementLiberatoire) / 100;
}

/** Le chiffre d'affaires annoncé dépasse-t-il le plafond du régime ? */
export function depassePlafond(
  nature: string | null | undefined,
  chiffreAffaires: number
): boolean {
  const regle = regleActivite(nature);
  return !!regle && chiffreAffaires > regle.plafond;
}

/* ---------- Les pièces justificatives ---------- */

export interface PieceAttendue {
  identifiant: string;
  titre: string;
  description: string;
  formats: string[];
}

/**
 * Ce que le guichet unique réclame.
 *
 * L'étape des pièces renvoyait vers une autre page sans dire lesquelles : on
 * découvrait au dépôt qu'il fallait le recto et le verso de la pièce d'identité, et
 * une activité réglementée voyait son dossier refusé faute d'un diplôme que personne
 * ne lui avait demandé.
 *
 * La déclaration de non-condamnation n'y figure pas : elle est signée ici même, à
 * l'étape suivante, et non déposée en fichier.
 */
export function piecesDeclaration(declaration: Declaration): PieceAttendue[] {
  const images = [".pdf", ".jpg", ".jpeg", ".png"];

  const pieces: PieceAttendue[] = [
    {
      identifiant: "identite-recto",
      titre: "Pièce d'identité - recto",
      description: "Carte nationale d'identité ou passeport, en cours de validité.",
      formats: images,
    },
    {
      identifiant: "identite-verso",
      titre: "Pièce d'identité - verso",
      description: "Le verso de la même pièce. Un passeport n'en a pas : redéposez la page d'identité.",
      formats: images,
    },
    {
      identifiant: "domicile",
      titre: "Justificatif de domicile",
      description: "Facture d'énergie, de téléphone ou quittance de loyer de moins de trois mois.",
      formats: images,
    },
  ];

  if (declaration.activiteReglementee) {
    pieces.push({
      identifiant: "qualification",
      titre: "Qualification professionnelle ou autorisation",
      description:
        "Diplôme, titre, attestation d'expérience ou autorisation d'exercer, selon ce que votre activité exige.",
      formats: images,
    });
  }

  return pieces;
}
