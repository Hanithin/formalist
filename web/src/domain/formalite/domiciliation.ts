import { MANDATAIRE, nommer } from "./mandataire";

/**
 * Où une société naissante fixe son siège, et ce que chaque cas demande.
 *
 * Quatre situations, qui n'appellent ni les mêmes pièces ni les mêmes actes :
 *
 *   - des locaux à soi - un bail commercial, un titre de propriété : le client fournit
 *     son justificatif de jouissance, et le cabinet ne produit rien ;
 *   - une société de domiciliation : le greffe veut le contrat, mais aussi de quoi
 *     vérifier que le domiciliataire existe et détient son agrément - sa dénomination,
 *     son numéro d'immatriculation et son extrait Kbis récent ;
 *   - le domicile du dirigeant : le cabinet produit l'attestation de mise à
 *     disposition, et l'article L. 123-11-1 décide si elle est sans terme ;
 *   - le cabinet lui-même : c'est lui qui met ses locaux à disposition, et c'est donc
 *     lui qui fournit l'attestation et les pièces qui l'accompagnent.
 *
 * Le dernier cas n'existait pas. Il se traitait en choisissant « société de
 * domiciliation » et en tapant le cabinet à la main - ce qui déclare au greffe une
 * domiciliation agréée que le cabinet n'exerce pas.
 */

/**
 * Le cabinet, tel qu'il se désigne dans une attestation.
 *
 * Écrit ici et non en base, comme l'identité du mandataire : ce n'est pas une donnée de
 * dossier, c'est celle de la maison. Le président du cabinet est le mandataire - ce sont
 * deux rôles de la même personne, et le nom ne doit pas pouvoir diverger entre les deux
 * documents qu'elle signe.
 */
export const CABINET = {
  denomination: "STERLING PEAK",
  forme: "SELAS d'Avocats",
  capital: 20000,
  adresse: "34 rue Laugier, 75017 Paris",
  greffe: "Paris",
  siren: "899 979 934",
  /** À quel titre le cabinet occupe ses locaux : c'est ce qui l'autorise à en disposer. */
  occupation: "locataire",
  /** La qualité sous laquelle son représentant signe. */
  qualiteDuSignataire: "Président",
  get signataire(): string {
    return nommer(MANDATAIRE);
  },
  /** « MADFAI Hani » : le bas de l'attestation nomme à l'envers, comme le modèle. */
  get signatureEnPied(): string {
    return MANDATAIRE.civilite + " " + MANDATAIRE.nom + " " + MANDATAIRE.prenom;
  },
} as const;

/**
 * Les pièces que le cabinet fournit quand il domicilie.
 *
 * Elles ne dépendent d'aucun dossier : ce sont les siennes, les mêmes à chaque fois.
 * Deux d'entre elles se périment - un extrait Kbis et un justificatif de domicile de
 * plus de trois mois se font refuser au guichet - et c'est la seule raison pour
 * laquelle l'application les date.
 */
export const FRAICHEUR_MOIS = 3;

export interface PieceDuCabinet {
  identifiant: string;
  titre: string;
  description: string;
  /** Se périme-t-elle ? Un passeport a sa propre validité, qu'aucun délai ne remplace. */
  perissable: boolean;
  formats: string[];
}

export const PIECES_DU_CABINET: PieceDuCabinet[] = [
  {
    identifiant: "cabinet-kbis",
    titre: "Extrait Kbis du cabinet",
    description:
      "Moins de trois mois à la date du dépôt. Il prouve que le cabinet existe et qu'il est bien à l'adresse qu'il met à disposition.",
    perissable: true,
    formats: [".pdf"],
  },
  {
    identifiant: "cabinet-identite",
    titre: "Pièce d'identité du signataire",
    description:
      "Passeport ou carte nationale d'identité de celui qui signe l'attestation, en cours de validité.",
    perissable: false,
    formats: [".pdf", ".jpg", ".jpeg", ".png"],
  },
  {
    identifiant: "cabinet-domicile",
    titre: "Justificatif de domicile du cabinet",
    description:
      "Moins de trois mois : facture d'énergie, de téléphonie fixe ou quittance de loyer au nom du cabinet.",
    perissable: true,
    formats: [".pdf", ".jpg", ".jpeg", ".png"],
  },
];

export type EtatDeFraicheur = "fraiche" | "bientot" | "perimee" | "sans-date" | "absente";

/**
 * Une pièce périssable est-elle encore recevable ?
 *
 * Le guichet compte trois mois à partir de la date portée par la pièce, non de celle où
 * on l'a déposée ici. Un Kbis tiré en janvier et téléversé en juin est périmé le jour
 * de son téléversement, et rien dans le fichier ne le dit : c'est la date déclarée qui
 * fait foi.
 *
 * « bientôt » couvre le dernier mois : il laisse le temps d'en demander un autre avant
 * qu'un dossier ne se retrouve bloqué la veille de son dépôt.
 */
export function fraicheur(
  etabliLe: string | null | undefined,
  maintenant: Date = new Date()
): EtatDeFraicheur {
  const brut = etabliLe?.trim();
  /*
   * La date se lit au format ISO, ou pas du tout.
   *
   * `new Date` accepte des textes qu'aucun formulaire ne produit et en tire ce qu'il
   * peut : « le 3 mars » devient le 1er janvier de l'an 3, une date parfaitement
   * valide et vieille de deux millénaires - la pièce serait dite périmée au lieu
   * d'être dite indatée, et personne ne comprendrait pourquoi.
   */
  if (!brut || !/^\d{4}-\d{2}-\d{2}$/.test(brut)) return "sans-date";

  const date = new Date(brut + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return "sans-date";

  const limite = new Date(date);
  limite.setMonth(limite.getMonth() + FRAICHEUR_MOIS);
  if (limite.getTime() <= maintenant.getTime()) return "perimee";

  const alerte = new Date(limite);
  alerte.setMonth(alerte.getMonth() - 1);
  return alerte.getTime() <= maintenant.getTime() ? "bientot" : "fraiche";
}

/** Ce qui empêche un dépôt : une pièce absente, périmée, ou dont on ignore la date. */
export function piecesDuCabinetIncompletes(
  deposees: { identifiant: string; etabliLe?: string | null }[],
  maintenant: Date = new Date()
): { piece: PieceDuCabinet; etat: EtatDeFraicheur }[] {
  const manques: { piece: PieceDuCabinet; etat: EtatDeFraicheur }[] = [];

  for (const attendue of PIECES_DU_CABINET) {
    const deposee = deposees.find((d) => d.identifiant === attendue.identifiant);
    if (!deposee) {
      manques.push({ piece: attendue, etat: "absente" });
      continue;
    }
    if (!attendue.perissable) continue;

    const etat = fraicheur(deposee.etabliLe, maintenant);
    if (etat === "perimee" || etat === "sans-date") manques.push({ piece: attendue, etat });
  }

  return manques;
}
