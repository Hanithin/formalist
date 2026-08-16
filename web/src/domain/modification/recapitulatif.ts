import { champVisible, definitions, type Valeurs } from "./types";
import type { SocieteModifiee } from "./gabarit";

/**
 * Le dossier de modification, lisible par l'avocat.
 *
 * L'espace avocat cherchait les champs d'une création - dénomination, activité,
 * capital libéré - à la racine du dossier. Une modification ne les y a pas : elle
 * range la société, les changements décidés et leurs valeurs dans des sous-objets.
 * Le récapitulatif annonçait donc « le client n'a encore rien renseigné » sur un
 * dossier réglé et complet, ce qui est le pire moment pour le dire.
 */

export interface FaitDuDossier {
  libelle: string;
  valeur: string;
}

export interface SectionDuDossier {
  titre: string;
  faits: FaitDuDossier[];
}

const CHAMPS_SOCIETE: { cle: keyof SocieteModifiee; libelle: string }[] = [
  { cle: "denomination", libelle: "Dénomination" },
  { cle: "forme", libelle: "Forme juridique" },
  { cle: "siren", libelle: "SIREN" },
  { cle: "adresse", libelle: "Adresse du siège" },
  { cle: "codePostal", libelle: "Code postal" },
  { cle: "ville", libelle: "Ville" },
  { cle: "capital", libelle: "Capital social" },
];

export interface DossierDeModification {
  codes?: string[];
  societe?: SocieteModifiee;
  valeurs?: Valeurs;
  assemblee?: { date?: string | null; associes?: { civilite?: string | null; prenom?: string | null; nom?: string | null; parts?: number | null }[] };
  statuts?: { source?: string; nature?: string; deposeLe?: string | null; fichier?: string };
  statutsAJour?: boolean;
  paye?: boolean;
}

function ecrit(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  return String(valeur).trim();
}

/** Reconnaît un dossier de modification à sa forme, sans dépendre du type déclaré. */
export function estUneModification(donnees: Record<string, unknown>): boolean {
  return Array.isArray(donnees.codes) && typeof donnees.societe === "object";
}

/**
 * Les sections du récapitulatif.
 *
 * Une section vide n'apparaît pas : mieux vaut un récapitulatif court qu'un
 * récapitulatif jalonné de titres sans contenu, où l'on cherche ce qui manque.
 */
export function recapitulatifDeModification(
  donnees: DossierDeModification
): SectionDuDossier[] {
  const sections: SectionDuDossier[] = [];
  const codes = donnees.codes ?? [];
  const valeurs = donnees.valeurs ?? {};
  const societe = donnees.societe ?? {};

  const choisies = definitions(codes);
  if (choisies.length > 0) {
    sections.push({
      titre: "Ce que le client change",
      faits: choisies.map((d) => ({ libelle: d.libelle, valeur: d.description })),
    });
  }

  const faitsSociete = CHAMPS_SOCIETE.map((champ) => ({
    libelle: champ.libelle,
    valeur: ecrit(societe[champ.cle]),
  })).filter((f) => f.valeur);
  if (faitsSociete.length > 0) {
    sections.push({ titre: "La société", faits: faitsSociete });
  }

  // Une section par changement : les valeurs d'un transfert et celles d'une
  // nomination n'ont rien à faire dans la même liste.
  for (const definition of choisies) {
    const faits = definition.champs
      .filter((champ) => champVisible(champ, valeurs))
      .map((champ) => ({ libelle: champ.libelle, valeur: ecrit(valeurs[champ.identifiant]) }))
      .filter((f) => f.valeur);

    if (faits.length > 0) sections.push({ titre: definition.libelle, faits });
  }

  const associes = donnees.assemblee?.associes ?? [];
  const faitsAssemblee: FaitDuDossier[] = [];
  if (donnees.assemblee?.date) {
    faitsAssemblee.push({ libelle: "Date", valeur: ecrit(donnees.assemblee.date) });
  }
  for (const associe of associes) {
    const nom = [associe.civilite, associe.prenom, associe.nom].filter(Boolean).join(" ");
    if (!nom.trim()) continue;
    faitsAssemblee.push({
      libelle: "Associé présent",
      valeur: nom + (associe.parts ? ", " + associe.parts + " parts" : ""),
    });
  }
  if (faitsAssemblee.length > 0) {
    sections.push({ titre: "L'assemblée", faits: faitsAssemblee });
  }

  if (donnees.statuts) {
    sections.push({
      titre: "Les statuts",
      faits: [
        {
          libelle: "Origine",
          valeur:
            donnees.statuts.source === "inpi"
              ? "Registre national" +
                (donnees.statuts.nature ? " - " + donnees.statuts.nature : "")
              : "Déposés par le client" +
                (donnees.statuts.fichier ? " - " + donnees.statuts.fichier : ""),
        },
        ...(donnees.statuts.deposeLe
          ? [{ libelle: "Dépôt au registre", valeur: ecrit(donnees.statuts.deposeLe) }]
          : []),
        {
          libelle: "Retouche",
          valeur: donnees.statutsAJour
            ? "Statuts à jour produits et joints"
            : "Pas encore retouchés",
        },
      ],
    });
  }

  return sections;
}
