/**
 * Ce que les deux documents ont besoin de savoir.
 *
 * Presque rien : l'entrepreneur, son entreprise, la date, et les échéances calculées.
 * Ces dernières y figurent parce que la déclaration récapitulative les porte : c'est
 * la seule feuille que le client gardera, et elle doit lui dire ce qu'il lui reste à
 * faire une fois notre travail terminé.
 */

import { adresseSurUneLigne as adresseDuSiege } from "@/domain/modification/gabarit";
import { dateEnFrancais } from "@/domain/formalite/lettres";
import { echeancesDe, type Nature, type Periodicite } from "./regles";

const TIRET = "-";

/**
 * Le motif, rédigé pour suivre « en raison de ».
 *
 * L'écran propose des intitulés qui se lisent seuls - « Création d'une société » - et
 * l'acte les enchâsse. Recopiés en minuscules, ils donnaient « en raison de création
 * d'une société » : il manque l'article, et cela se voit à la première lecture.
 */
const MOTIFS: Record<string, string> = {
  "Activité insuffisante": "l'insuffisance de l'activité",
  "Reprise d'un emploi salarié": "la reprise d'un emploi salarié",
  "Création d'une société": "la création d'une société",
  "Départ à la retraite": "un départ à la retraite",
  "Changement de projet": "un changement de projet",
  "Autre motif": "des circonstances personnelles",
};

export interface EntrepriseCessee {
  denomination?: string;
  siren?: string;
  activite?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
}

export interface ContexteCessation {
  nature: Nature;
  entreprise: EntrepriseCessee;
  /** L'entrepreneur : une auto-entreprise se confond avec la personne. */
  entrepreneur: { civilite?: string; prenom?: string; nom?: string; adresse?: string };
  valeurs: Record<string, string | number | undefined>;
}

function texte(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

function ou(valeur: string, defaut = TIRET): string {
  return valeur.trim() || defaut;
}

/*
 * L'adresse du registre porte déjà son code postal et sa commune.
 *
 * On les recollait derrière : le siège s'écrivait « 34 RUE LAUGIER 75017 PARIS, 75017
 * PARIS » en tête d'un acte déposé au greffe. Le parcours modification avait résolu ce
 * cas, et sa fonction est exportée - trois autres la recopiaient sans sa garde.
 */
function adresseSurUneLigne(entreprise: EntrepriseCessee): string {
  return adresseDuSiege(entreprise.adresse, entreprise.codePostal, entreprise.ville);
}

export function donneesDeLaCessation(contexte: ContexteCessation): Record<string, unknown> {
  const { entreprise, entrepreneur, valeurs } = contexte;

  const nom = [texte(entrepreneur.civilite), texte(entrepreneur.prenom), texte(entrepreneur.nom)]
    .filter(Boolean)
    .join(" ");

  const echeances = echeancesDe({
    nature: contexte.nature,
    dateCessation: texte(valeurs.dateCessation) || null,
    periodicite: (texte(valeurs.periodicite).toLowerCase() as Periodicite) || "trimestrielle",
    commerciale: texte(valeurs.activiteCommerciale) === "Oui",
    assujettiTva: texte(valeurs.assujettiTva) === "Oui",
    agentCommercial: texte(valeurs.agentCommercial) === "Oui",
  });

  const femme = /^(madame|mademoiselle|mme)$/i.test(texte(entrepreneur.civilite));

  return {
    /* ------------------------------------------------------- L'entreprise */
    ENTREPRISE: ou(texte(entreprise.denomination)),
    SIREN: ou(texte(entreprise.siren)),
    ACTIVITE: ou(texte(entreprise.activite)),
    ADRESSE: adresseSurUneLigne(entreprise),
    VILLE_SIGNATURE: ou(texte(entreprise.ville)),

    /* ---------------------------------------------------- L'entrepreneur */
    ENTREPRENEUR: ou(nom),
    ENTREPRENEUR_ADRESSE: ou(texte(entrepreneur.adresse), adresseSurUneLigne(entreprise)),
    /* L'accord se lit sur la civilité, non sur un indicateur séparé qui pourrait la contredire. */
    SOUSSIGNE: femme ? "Je soussignée" : "Je soussigné",
    INSCRIT: femme ? "inscrite" : "inscrit",

    /* ------------------------------------------------------- La cessation */
    IS_DEFINITIVE: contexte.nature === "definitive",
    IS_TEMPORAIRE: contexte.nature === "temporaire",
    NATURE_MOT: contexte.nature === "temporaire" ? "la suspension" : "la cessation définitive",
    DATE_CESSATION_FR: dateEnFrancais(texte(valeurs.dateCessation)),
    MOTIF: MOTIFS[texte(valeurs.motif)] ?? "des circonstances personnelles",
    PERIODICITE: ou(texte(valeurs.periodicite)).toLowerCase(),
    IS_TVA: texte(valeurs.assujettiTva) === "Oui",
    IS_AGENT_COMMERCIAL: texte(valeurs.agentCommercial) === "Oui",

    /* -------------------------------------------------------- Les suites */
    /* Celles du client, non la nôtre : la déclaration au guichet, c'est nous. */
    ECHEANCES: echeances
      .filter((echeance) => !echeance.pourNous)
      .map((echeance) => ({
      INTITULE: echeance.intitule,
      QUAND: echeance.limite
        ? "avant le " + dateEnFrancais(echeance.limite)
        : (echeance.quand ?? ""),
      EXPLICATION: echeance.explication,
      })),
  };
}
