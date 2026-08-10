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
}

export const ETAPES: Etape[] = [
  { numero: 1, identifiant: "identite", titre: "Identité" },
  { numero: 2, identifiant: "adresse", titre: "Adresse et situation" },
  { numero: 3, identifiant: "activite", titre: "Activité" },
  { numero: 4, identifiant: "options", titre: "Options fiscales et sociales" },
  { numero: 5, identifiant: "pieces", titre: "Pièces justificatives" },
  { numero: 6, identifiant: "filiation", titre: "Déclaration et filiation" },
  { numero: 7, identifiant: "recapitulatif", titre: "Récapitulatif" },
];

export interface Declaration {
  civilite?: string;
  nomNaissance?: string;
  nomUsage?: string;
  prenoms?: string;
  dateNaissance?: string;
  paysNaissance?: string;
  nationalite?: string;

  adresseVoie?: string;
  codePostal?: string;
  ville?: string;
  /** L'entreprise est-elle domiciliée ailleurs qu'au domicile ? */
  adresseEntrepriseDistincte?: boolean;
  entrepriseVoie?: string;
  entrepriseCodePostal?: string;
  entrepriseVille?: string;

  natureActivite?: string;
  descriptionActivite?: string;
  codeApe?: string;
  dateDebut?: string;

  versementLiberatoire?: boolean;
  acre?: boolean;
  eirl?: boolean;

  filiationMere?: string;
  filiationPere?: string;
  certifie?: boolean;
}

export interface Anomalie {
  champ: string;
  message: string;
}

const CODE_POSTAL = /^\d{5}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    if (!declaration.nationalite?.trim()) {
      anomalies.push({ champ: "nationalite", message: "Indiquez votre nationalité" });
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
