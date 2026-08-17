import type { AssociePresent } from "./gabarit";
import { designationDeLAssocie } from "./gabarit";

/**
 * Les cessions de parts, et la répartition qui en découle.
 *
 * Le formulaire demandait « Nom du cédant » dans un champ vide, à l'étape des détails,
 * alors que l'étape suivante faisait saisir les mêmes personnes avec leurs parts. On
 * répondait deux fois, et rien ne reliait les deux réponses : on pouvait céder cinq
 * cents parts quand on en détenait cent, ou désigner un cédant qui n'était pas
 * associé. L'acte sortait ainsi, et c'est le greffe qui le disait des semaines plus
 * tard.
 *
 * Une cession désigne donc un associé de la liste, non un nom. Ce qui se calcule -
 * le prix par part, la répartition d'après - se calcule, et ce qui découle de la loi -
 * l'agrément - se déduit au lieu de se demander.
 */

export interface Cession {
  /** Le rang du cédant dans la liste des associés. */
  cedant: number | null;
  parts: number | null;
  prix: number | null;
  date?: string | null;
  /** Vers un associé déjà là, ou vers un tiers qui entre au capital. */
  vers: "associe" | "tiers";
  /** Le rang du cessionnaire, quand c'est un associé. */
  cessionnaire?: number | null;
  /** Son identité, quand c'est un tiers. */
  nom?: string | null;
  adresse?: string | null;
}

export function cessionVide(): Cession {
  return { cedant: null, parts: null, prix: null, vers: "tiers" };
}

/** Le nom sous lequel un associé se choisit dans une liste. */
export function nomDeLAssocie(associe: AssociePresent | undefined, rang: number): string {
  if (!associe) return "Associé " + (rang + 1);

  const nom =
    associe.nature === "morale"
      ? (associe.denomination ?? "").trim()
      : [associe.prenom, associe.nom]
          .map((m) => (m ?? "").trim())
          .filter(Boolean)
          .join(" ");

  return nom || "Associé " + (rang + 1);
}

/** Le nom du bénéficiaire d'une cession, associé ou tiers. */
export function nomDuCessionnaire(cession: Cession, associes: AssociePresent[]): string {
  if (cession.vers === "associe") {
    const rang = cession.cessionnaire ?? -1;
    return rang >= 0 ? nomDeLAssocie(associes[rang], rang) : "";
  }
  return (cession.nom ?? "").trim();
}

/** Le prix d'une part, quand les deux nombres sont connus. */
export function prixParPart(cession: Cession): number | null {
  if (!cession.parts || !cession.prix || cession.parts <= 0) return null;
  return Math.round((cession.prix / cession.parts) * 100) / 100;
}

export interface LigneDeRepartition {
  /** Le rang dans la liste, ou -1 pour un tiers qui entre. */
  rang: number;
  nom: string;
  avant: number;
  apres: number;
  /** Il n'était pas associé avant : il le devient. */
  entrant: boolean;
  /** Il ne l'est plus après : il sort. */
  sortant: boolean;
}

/**
 * Qui détient quoi, avant et après.
 *
 * C'est la pièce qui rend les erreurs visibles : un total qui ne retombe pas, un
 * associé qui passe en négatif, un tiers qui entre pour rien. Sur un formulaire plat,
 * rien de tout cela ne se voit avant le greffe.
 *
 * Les tiers sont regroupés par nom : deux cessions au même acquéreur ne font pas deux
 * lignes, elles font un associé qui reçoit deux fois.
 */
export function repartitionApres(
  associes: AssociePresent[],
  cessions: Cession[]
): LigneDeRepartition[] {
  const lignes: LigneDeRepartition[] = associes.map((associe, rang) => ({
    rang,
    nom: nomDeLAssocie(associe, rang),
    avant: associe.parts ?? 0,
    apres: associe.parts ?? 0,
    entrant: false,
    sortant: false,
  }));

  const entrants = new Map<string, LigneDeRepartition>();

  for (const cession of cessions) {
    const parts = cession.parts ?? 0;
    if (parts <= 0) continue;

    const cedant = cession.cedant !== null ? lignes[cession.cedant] : undefined;
    if (cedant) cedant.apres -= parts;

    if (cession.vers === "associe") {
      const beneficiaire = cession.cessionnaire !== null && cession.cessionnaire !== undefined
        ? lignes[cession.cessionnaire]
        : undefined;
      if (beneficiaire) beneficiaire.apres += parts;
      continue;
    }

    const nom = (cession.nom ?? "").trim();
    if (!nom) continue;

    const deja = entrants.get(nom.toLowerCase());
    if (deja) {
      deja.apres += parts;
    } else {
      const ligne: LigneDeRepartition = {
        rang: -1,
        nom,
        avant: 0,
        apres: parts,
        entrant: true,
        sortant: false,
      };
      entrants.set(nom.toLowerCase(), ligne);
      lignes.push(ligne);
    }
  }

  for (const ligne of lignes) ligne.sortant = ligne.avant > 0 && ligne.apres <= 0;
  return lignes;
}

/** Le nombre total de parts, qui ne doit pas changer : une cession n'en crée pas. */
export function totalDesParts(associes: AssociePresent[]): number {
  return associes.reduce((total, a) => total + (a.parts ?? 0), 0);
}

/**
 * L'agrément, déduit plutôt que demandé.
 *
 * Dans une SARL, la cession à un tiers exige l'agrément de la majorité des associés
 * représentant au moins la moitié des parts (art. L. 223-14 du code de commerce) ;
 * entre associés, les statuts peuvent l'exiger mais la loi ne l'impose pas. Dans une
 * société par actions, rien n'est de droit : tout dépend d'une clause d'agrément.
 *
 * « Choisir » sur un menu vide ne guide personne ; la réponse est proposée avec son
 * motif, et reste modifiable - ce sont les statuts qui tranchent.
 */
export function agrementDeDroit(
  forme: string | null | undefined,
  vers: Cession["vers"]
): { requis: boolean; motif: string } {
  const f = (forme ?? "").toUpperCase();
  const societeDePersonnes = f.startsWith("SARL") || f.startsWith("EURL") || f.startsWith("SC");

  if (societeDePersonnes && vers === "tiers") {
    return {
      requis: true,
      motif:
        "La loi l'exige pour une cession à un tiers dans cette forme de société (art. L. 223-14 du code de commerce).",
    };
  }
  if (societeDePersonnes) {
    return {
      requis: false,
      motif: "Entre associés, la loi ne l'impose pas - vos statuts peuvent le prévoir.",
    };
  }
  return {
    requis: false,
    motif:
      "Dans une société par actions, l'agrément ne vaut que si une clause des statuts le prévoit.",
  };
}

export interface AnomalieDeCession {
  champ: string;
  message: string;
}

/**
 * Ce qui empêche une cession de tenir.
 *
 * Chaque anomalie porte le rang de la cession dans son champ - « cession-2-parts » -
 * pour se poser sous le bon bloc plutôt qu'en tête de page.
 */
export function verifierCessions(
  associes: AssociePresent[],
  cessions: Cession[]
): AnomalieDeCession[] {
  const anomalies: AnomalieDeCession[] = [];

  /*
   * Aucune cession saisie : l'écran en montre pourtant une, vide.
   *
   * « Ajoutez au moins une cession » désignerait un bouton alors que le bloc est là,
   * sous les yeux : c'est de le remplir qu'il s'agit.
   */
  if (cessions.length === 0) {
    return [{ champ: "cessions", message: "Renseignez la cession" }];
  }

  const repartition = repartitionApres(associes, cessions);

  cessions.forEach((cession, rang) => {
    const prefixe = "cession-" + rang + "-";

    if (cession.cedant === null || !associes[cession.cedant]) {
      anomalies.push({ champ: prefixe + "cedant", message: "Choisissez le cédant" });
    }

    if (!cession.parts || cession.parts <= 0) {
      anomalies.push({ champ: prefixe + "parts", message: "Indiquez le nombre de parts cédées" });
    } else if (cession.cedant !== null) {
      const detenues = associes[cession.cedant]?.parts ?? 0;
      if (cession.parts > detenues) {
        anomalies.push({
          champ: prefixe + "parts",
          message:
            nomDeLAssocie(associes[cession.cedant], cession.cedant) +
            " ne détient que " +
            detenues +
            (detenues > 1 ? " parts" : " part"),
        });
      }
    }

    if (cession.vers === "associe") {
      if (cession.cessionnaire === null || cession.cessionnaire === undefined) {
        anomalies.push({ champ: prefixe + "cessionnaire", message: "Choisissez le cessionnaire" });
      } else if (cession.cessionnaire === cession.cedant) {
        anomalies.push({
          champ: prefixe + "cessionnaire",
          message: "Le cédant et le cessionnaire sont la même personne",
        });
      }
    } else if (!(cession.nom ?? "").trim()) {
      anomalies.push({ champ: prefixe + "nom", message: "Nommez le cessionnaire" });
    }

    if (cession.prix === null || cession.prix === undefined || cession.prix < 0) {
      anomalies.push({ champ: prefixe + "prix", message: "Indiquez le prix de cession" });
    }

    if (!(cession.date ?? "").trim()) {
      anomalies.push({ champ: prefixe + "date", message: "Indiquez la date de cession" });
    }
  });

  /*
   * Le cumul, une fois toutes les cessions posées.
   *
   * Deux cessions prises isolément peuvent tenir, et vider ensemble un associé au-delà
   * de ce qu'il détient : c'est le total qui le dit, non chaque ligne.
   */
  for (const ligne of repartition) {
    if (ligne.apres < 0) {
      anomalies.push({
        champ: "cessions",
        message:
          ligne.nom + " cède au total plus de parts qu'il n'en détient (" + ligne.avant + ")",
      });
    }
  }

  return anomalies;
}

/**
 * Les cessions telles qu'un acte les nomme.
 *
 * Le gabarit ne connaît ni rangs ni listes : il attend des phrases faites.
 */
export function cessionsRedigees(
  associes: AssociePresent[],
  cessions: Cession[]
): {
  CEDANT: string;
  CESSIONNAIRE: string;
  PARTS: number;
  PRIX: number;
  PRIX_PAR_PART: number | null;
  DATE: string;
}[] {
  return cessions.map((cession) => ({
    CEDANT:
      cession.cedant !== null && associes[cession.cedant]
        ? designationDeLAssocie(associes[cession.cedant])
        : "",
    CESSIONNAIRE:
      cession.vers === "associe" &&
      cession.cessionnaire !== null &&
      cession.cessionnaire !== undefined &&
      associes[cession.cessionnaire]
        ? designationDeLAssocie(associes[cession.cessionnaire])
        : (cession.nom ?? "").trim(),
    PARTS: cession.parts ?? 0,
    PRIX: cession.prix ?? 0,
    PRIX_PAR_PART: prixParPart(cession),
    DATE: (cession.date ?? "").trim(),
  }));
}
