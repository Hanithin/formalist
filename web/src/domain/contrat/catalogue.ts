/**
 * Contrats proposés.
 *
 * Repris de public/contrats.html, où les types, leurs libellés et leurs champs
 * étaient mêlés à l'affichage. Les regrouper ici permet de vérifier qu'un contrat
 * demandé est bien proposé, et que ses champs sont renseignés avant génération.
 */

export type TypeContrat =
  | "bail_commercial"
  | "bail_professionnel"
  | "cdi"
  | "cdd"
  | "prestation"
  | "cession_droits";

export interface ChampContrat {
  identifiant: string;
  libelle: string;
  type: "texte" | "nombre" | "date" | "long";
  /** Facultatif : tous les contrats n'exigent pas tous leurs champs. */
  facultatif?: boolean;
}

export interface DefinitionContrat {
  code: TypeContrat;
  libelle: string;
  description: string;
  champs: ChampContrat[];
}

const PARTIES: ChampContrat[] = [
  { identifiant: "partieA", libelle: "Première partie", type: "texte" },
  { identifiant: "partieB", libelle: "Seconde partie", type: "texte" },
];

export const CONTRATS: DefinitionContrat[] = [
  {
    code: "bail_commercial",
    libelle: "Bail commercial",
    description: "Location de locaux commerciaux.",
    champs: [
      ...PARTIES,
      { identifiant: "adresseLocal", libelle: "Adresse du local", type: "texte" },
      { identifiant: "loyerMensuel", libelle: "Loyer mensuel, en euros", type: "nombre" },
      { identifiant: "dateDebut", libelle: "Date de prise d'effet", type: "date" },
    ],
  },
  {
    code: "bail_professionnel",
    libelle: "Bail professionnel",
    description: "Location de locaux professionnels.",
    champs: [
      ...PARTIES,
      { identifiant: "adresseLocal", libelle: "Adresse du local", type: "texte" },
      { identifiant: "loyerMensuel", libelle: "Loyer mensuel, en euros", type: "nombre" },
      { identifiant: "dateDebut", libelle: "Date de prise d'effet", type: "date" },
    ],
  },
  {
    code: "cdi",
    libelle: "Contrat de travail (CDI)",
    description: "Embauche à durée indéterminée.",
    champs: [
      ...PARTIES,
      { identifiant: "poste", libelle: "Intitulé du poste", type: "texte" },
      { identifiant: "remuneration", libelle: "Rémunération brute annuelle", type: "nombre" },
      { identifiant: "dateDebut", libelle: "Date d'embauche", type: "date" },
    ],
  },
  {
    code: "cdd",
    libelle: "Contrat de travail (CDD)",
    description: "Embauche à durée déterminée.",
    champs: [
      ...PARTIES,
      { identifiant: "poste", libelle: "Intitulé du poste", type: "texte" },
      { identifiant: "remuneration", libelle: "Rémunération brute annuelle", type: "nombre" },
      { identifiant: "dateDebut", libelle: "Date d'embauche", type: "date" },
      { identifiant: "dateFin", libelle: "Date de fin", type: "date" },
      { identifiant: "motif", libelle: "Motif du recours", type: "long" },
    ],
  },
  {
    code: "prestation",
    libelle: "Contrat de prestation",
    description: "Services entre professionnels.",
    champs: [
      ...PARTIES,
      { identifiant: "mission", libelle: "Description de la mission", type: "long" },
      { identifiant: "montant", libelle: "Montant, en euros", type: "nombre" },
      { identifiant: "dateDebut", libelle: "Date de début", type: "date" },
      { identifiant: "dateFin", libelle: "Date de fin", type: "date", facultatif: true },
    ],
  },
  {
    code: "cession_droits",
    libelle: "Cession de droits d'auteur",
    description: "Transfert de propriété intellectuelle.",
    champs: [
      ...PARTIES,
      { identifiant: "oeuvre", libelle: "Œuvre concernée", type: "long" },
      { identifiant: "montant", libelle: "Montant de la cession, en euros", type: "nombre" },
      { identifiant: "duree", libelle: "Durée de la cession", type: "texte" },
    ],
  },
];

export function definitionContrat(code: string): DefinitionContrat | null {
  return CONTRATS.find((c) => c.code === code) ?? null;
}

export interface Anomalie {
  champ: string;
  message: string;
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function verifierContrat(
  code: string,
  valeurs: Record<string, string | number | undefined>
): Anomalie[] {
  const definition = definitionContrat(code);
  if (!definition) return [{ champ: "type", message: "Choisissez un type de contrat" }];

  const anomalies: Anomalie[] = [];

  for (const champ of definition.champs) {
    const valeur = valeurs[champ.identifiant];
    const vide =
      valeur === undefined ||
      valeur === null ||
      (typeof valeur === "string" && !valeur.trim());

    if (vide) {
      if (!champ.facultatif) {
        anomalies.push({ champ: champ.identifiant, message: champ.libelle + " est requis" });
      }
      continue;
    }

    if (champ.type === "nombre") {
      const nombre = typeof valeur === "number" ? valeur : Number(valeur);
      if (!Number.isFinite(nombre) || nombre <= 0) {
        anomalies.push({
          champ: champ.identifiant,
          message: champ.libelle + " doit être un montant positif",
        });
      }
    }

    if (champ.type === "date" && !DATE_ISO.test(String(valeur))) {
      anomalies.push({ champ: champ.identifiant, message: champ.libelle + " est invalide" });
    }
  }

  // Un contrat qui se termine avant de commencer ne veut rien dire.
  const debut = valeurs.dateDebut;
  const fin = valeurs.dateFin;
  if (typeof debut === "string" && typeof fin === "string" && DATE_ISO.test(debut) && DATE_ISO.test(fin)) {
    if (fin < debut) {
      anomalies.push({ champ: "dateFin", message: "La date de fin précède la date de début" });
    }
  }

  return anomalies;
}

export type EtatContrat = "brouillon" | "genere" | "en_validation" | "valide" | "signe";

/** Les transitions permises. Un contrat signé ne revient jamais en arrière. */
const SUITES: Record<EtatContrat, EtatContrat[]> = {
  brouillon: ["genere"],
  genere: ["brouillon", "en_validation"],
  en_validation: ["valide", "genere"],
  valide: ["signe", "en_validation"],
  signe: [],
};

export function transitionPermise(depuis: string, vers: string): boolean {
  const suites = SUITES[depuis as EtatContrat];
  return !!suites && suites.includes(vers as EtatContrat);
}
