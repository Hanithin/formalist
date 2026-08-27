import { donneesDesComptes } from "@/domain/comptes/gabarit";
import { actesDesComptes } from "@/domain/comptes/actes";
import { verifierComptes } from "@/domain/comptes/verification";
import { genererDocument } from "./generation";
import { renumeroterLesResolutions } from "./resolutions";
import { typographierLeDocument } from "./typographie-docx";
import { remplacerDocumentsProduits } from "./depot";
import { villeDuRcs } from "./rcs";
import type { Comptes } from "@/infrastructure/db/depots/comptes";

/**
 * Les actes d'une approbation des comptes.
 *
 * Ils se produisaient depuis la route appelée par un bouton de l'écran, ce qui les
 * liait à la présence d'un client devant son navigateur. Or ils doivent suivre le
 * règlement : c'est le paiement qui déclenche le travail du cabinet, et l'avocat ne
 * peut rien relire tant que rien n'est écrit. La production vit donc ici, sans session
 * ni requête, appelable aussi bien par la route que par la confirmation d'un paiement
 * - laquelle peut arriver par le retour du client ou par l'avis de Stripe.
 */

export interface ActesProduits {
  produits: { id: number; titre: string }[];
  conserves: { id: number; titre: string }[];
}

/** Un dossier incomplet produirait des actes troués, qui partiraient au greffe. */
export class ComptesIncomplets extends Error {
  constructor(readonly manques: { champ: string; message: string }[]) {
    super("Le dossier est incomplet");
    this.name = "ComptesIncomplets";
  }
}

/** Un nombre lu d'une saisie libre, virgule comprise. */
function nombre(valeur: unknown): number {
  const lu = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

export async function produireLesActesDesComptes(
  dossierId: number,
  comptes: Comptes
): Promise<ActesProduits> {
  const manques = verifierComptes(comptes);
  if (manques.length > 0) throw new ComptesIncomplets(manques);

  const societe = {
    ...comptes.societe,
    villeRcs:
      comptes.societe.villeRcs ||
      villeDuRcs(comptes.societe.codePostal, comptes.societe.ville),
  };

  const aProduire = actesDesComptes({
    forme: societe.forme,
    nombreDAssocies: comptes.associes.length,
    avecCommissaire: comptes.valeurs.commissaireAuxComptes === "Oui",
    nombreDeConventions: comptes.conventions.length,
    chiffres: {
      totalBilanCentimes: Math.round(nombre(comptes.valeurs.totalBilan) * 100),
      chiffreAffairesCentimes: Math.round(nombre(comptes.valeurs.chiffreAffaires) * 100),
      effectif: nombre(comptes.valeurs.effectif),
    },
    exclusions: comptes.exclusions,
    demandeLaConfidentialite: comptes.demandeLaConfidentialite,
  });

  const donnees = donneesDesComptes({ ...comptes, societe });

  const actes = aProduire.map((acte) => ({
    titre: acte.titre,
    contenu: typographierLeDocument(
      renumeroterLesResolutions(genererDocument(acte.gabarit, donnees))
    ),
  }));

  /*
   * Ce que produit le cabinet attend sa relecture.
   *
   * Une approbation de comptes passe par un avocat : ses actes ne sont des documents
   * qu'une fois relus, et le client ne doit pas les déposer au greffe avant.
   */
  return remplacerDocumentsProduits(dossierId, actes, { aRelire: true });
}
