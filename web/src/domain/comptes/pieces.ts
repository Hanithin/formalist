import { regimeDesConventions } from "./conventions";

/**
 * Le seul justificatif qu'un dépôt des comptes réclame.
 *
 * Le parcours n'en demandait aucun, et c'était juste : les comptes annuels et le
 * procès-verbal, le cabinet les produit. Reste le rapport spécial sur les conventions
 * réglementées quand la société a un commissaire aux comptes - il est de sa main, nous
 * ne le rédigeons pas à sa place, et l'assemblée délibère après en avoir pris
 * connaissance. Le procès-verbal l'écrit noir sur blanc : « après avoir pris
 * connaissance du rapport spécial établi par le commissaire aux comptes ». Sans le
 * document au dossier, cette phrase atteste d'une lecture qui n'a pas eu lieu.
 *
 * Le formulaire demandait déjà son nom - c'est ce nom que la pièce porte, pour que le
 * client cherche le rapport de celui-là et non « un rapport » parmi ses fichiers.
 */
export interface PieceDesComptes {
  identifiant: string;
  titre: string;
  explication: string;
  obligatoire: boolean;
  formats: string[];
}

/* Le HEIC est le format par défaut de tout iPhone : le refuser refuse l'appareil. */
const PDF_OU_IMAGE = [".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif"];

export function piecesDesComptes(args: {
  forme: string | null | undefined;
  avecCommissaire: boolean;
  commissaireNom?: string | null;
  nombreDeConventions: number;
}): PieceDesComptes[] {
  const regime = regimeDesConventions({
    forme: args.forme,
    avecCommissaire: args.avecCommissaire,
  });

  /*
   * La même condition que celle qui décide d'écrire le rapport, prise à l'envers.
   *
   * Là où le cabinet le produit, rien n'est demandé au client ; là où le commissaire
   * l'établit, c'est au client de le verser. Les deux règles doivent se répondre : une
   * seule d'entre elles qui bouge, et le dossier réclame un document qu'il produit
   * lui-même, ou n'en réclame aucun là où il en manque un.
   */
  if (regime.regime !== "rapport-et-vote" || !args.avecCommissaire) return [];
  if (args.nombreDeConventions <= 0) return [];

  const nom = (args.commissaireNom ?? "").trim();

  return [
    {
      identifiant: "rapport-commissaire",
      titre: "Rapport spécial du commissaire aux comptes",
      explication:
        "Sur les conventions réglementées de l'exercice" +
        (nom ? ", établi par " + nom : "") +
        ". L'assemblée délibère après en avoir pris connaissance : le procès-verbal le dit.",
      obligatoire: true,
      formats: PDF_OU_IMAGE,
    },
  ];
}
