import { nomComplet, nomDeLaPartie } from "./etat-civil";
import { regle } from "./formes";
import { personneDuDirigeant } from "./gabarit";
import { libellesDesAssocies, type Brouillon } from "./parcours";

/**
 * Ce qui est déjà saisi, en une colonne.
 *
 * Le parcours de création tient sur sept étapes et jusqu'à quinze champs par étape :
 * arrivé au capital, on ne sait plus quelle forme on a choisie deux écrans plus tôt,
 * et l'on revient en arrière pour vérifier - au risque de perdre la saisie en cours.
 *
 * Ce module ne rédige rien qu'il ne lise dans le brouillon, et n'invente aucun mot que
 * le domaine ne connaisse déjà : le titre du dirigeant vient de la forme, le mot
 * « actionnaire » de la nature des titres, le nom du dirigeant de l'associé qu'il
 * reprend. Ce qui manque se dit manquant - `valeur` à null - plutôt que de disparaître
 * : la colonne est aussi la liste de ce qu'il reste à faire.
 */

export interface LigneDuRecapitulatif {
  cle: string;
  libelle: string;
  /** Null quand rien n'est saisi. Une valeur peut tenir sur deux lignes, séparées par un saut. */
  valeur: string | null;
}

export interface Recapitulatif {
  /** « SARL », tant que la forme est reconnue. */
  forme: string | null;
  denomination: string | null;
  lignes: LigneDuRecapitulatif[];
}

const MOIS = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Une date ISO en toutes lettres, ou telle quelle si ce n'en est pas une. */
function dateLisible(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const quand = new Date(iso + "T00:00:00Z");
  return Number.isNaN(quand.getTime()) ? iso : MOIS.format(quand);
}

function vide(valeur: string | null | undefined): string | null {
  const net = (valeur ?? "").trim();
  return net === "" ? null : net;
}

/**
 * Le siège, sur deux lignes.
 *
 * La voie d'un côté, le code postal et la ville de l'autre : c'est ainsi qu'une adresse
 * s'écrit sur une enveloppe, et la colonne est trop étroite pour tout mettre bout à
 * bout.
 */
function siege(brouillon: Brouillon): string | null {
  const commune = [vide(brouillon.codePostal), vide(brouillon.ville)].filter(Boolean).join(" ");
  return vide([vide(brouillon.adresse), vide(commune)].filter(Boolean).join("\n"));
}

/**
 * Qui sont les associés.
 *
 * Leurs noms plutôt que leur nombre tant qu'ils sont deux au plus : « Associés » suivi
 * de « 2 associés » écrit deux fois la même chose, quand le nom dit qui est au capital.
 * Au-delà, la colonne est trop étroite et le compte reprend la main.
 *
 * On ne retient que ceux qui portent un nom : ajouter une ligne au tableau des associés
 * n'est pas renseigner un associé, et annoncer « 2 associés » sur des lignes vides
 * ferait croire l'étape faite.
 */
function associes(brouillon: Brouillon): string | null {
  const noms = (brouillon.associes ?? [])
    .map((a) => nomDeLaPartie(a).trim())
    .filter((nom) => nom !== "");
  if (noms.length === 0) return null;
  if (noms.length <= 2) return noms.join(", ");

  return noms.length + " " + libellesDesAssocies(brouillon.forme, noms.length).libelleCourt.toLowerCase();
}

/** Le capital, quand il est chiffré. Le champ vide vaut zéro : ce n'est pas une saisie. */
function capital(brouillon: Brouillon): string | null {
  const montant = brouillon.capital;
  if (typeof montant !== "number" || montant <= 0) return null;
  return montant.toLocaleString("fr-FR") + " €";
}

export function recapitulatifDuBrouillon(brouillon: Brouillon): Recapitulatif {
  const forme = regle(brouillon.forme);

  const dirigeant = personneDuDirigeant(
    (brouillon.dirigeants ?? [])[0],
    brouillon.associes ?? []
  );

  return {
    forme: forme?.libelle ?? null,
    denomination: vide(brouillon.denomination),
    lignes: [
      { cle: "siege", libelle: "Siège", valeur: siege(brouillon) },
      { cle: "capital", libelle: "Capital", valeur: capital(brouillon) },
      {
        cle: "associes",
        libelle: libellesDesAssocies(brouillon.forme, 2).libelleCourt,
        valeur: associes(brouillon),
      },
      {
        // Sans forme choisie, on ne suppose ni gérant ni président.
        cle: "dirigeant",
        libelle: forme?.titreDirigeant ?? "Dirigeant",
        valeur: vide(nomComplet(dirigeant)),
      },
      {
        cle: "cloture",
        libelle: "Clôture",
        valeur: brouillon.dateCloturePremierExercice
          ? dateLisible(brouillon.dateCloturePremierExercice)
          : null,
      },
    ],
  };
}
