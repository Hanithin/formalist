import { verifierModification } from "@/domain/modification/verification";
import { donneesDuGabarit, actesAProduire } from "@/domain/modification/gabarit";
import { genererDocument } from "./generation";
import { renumeroterLesResolutions } from "./resolutions";
import { typographierLeDocument } from "./typographie-docx";
import { remplacerDocumentsProduits } from "./depot";
import { rendreLePvAge, rendreLeTraiteDApport } from "./modeles-cabinet";
import { donneesDuPvAge, verifierLePvAge } from "@/domain/modification/pv-age";
import { donneesDuTraite } from "@/domain/modification/traite-apport";
import { villeDuRcs } from "./rcs";
import { journal } from "@/lib/journal";
import type { Modification } from "@/infrastructure/db/depots/modifications";

/**
 * Produire le procès-verbal et les actes d'une modification.
 *
 * Ce travail vivait dans la route qui l'expose, appelée par le bouton de l'étape des
 * actes. Depuis que le règlement précède les actes, il faut aussi pouvoir le lancer à
 * la confirmation du paiement - le client n'a plus d'écran où appuyer, et l'avocat
 * reçoit un dossier dont les pièces doivent déjà exister.
 *
 * Deux appelants, donc, et une seule écriture des règles : le nombre d'associés qui
 * décide du procès-verbal, la renumérotation des résolutions, la typographie, la mise
 * en relecture.
 */

export class DossierIncompletPourLesActes extends Error {
  readonly statut = 400;
  constructor(readonly manques: { champ: string; message: string }[]) {
    super("Le dossier est incomplet");
    this.name = "DossierIncompletPourLesActes";
  }
}

export class AucunActeAProduire extends Error {
  readonly statut = 400;
  constructor() {
    super("Aucun acte ne correspond");
    this.name = "AucunActeAProduire";
  }
}

/**
 * Par quel moteur un acte se rend.
 *
 * Trois chemins : les modèles universels du cabinet, qui portent leurs styles et leurs
 * balises à une accolade, et les gabarits historiques de Formalist, qui passent par
 * docx.cjs puis par la renumérotation des résolutions.
 */
function rendu(
  acte: { gabarit: string; moteur?: string },
  donneesDuPv: Record<string, unknown>,
  contexte: Parameters<typeof donneesDuTraite>[0],
  donnees: Record<string, unknown>
): Buffer {
  if (acte.moteur === "pv-age") return rendreLePvAge(donneesDuPv);
  if (acte.moteur === "traite-apport") return rendreLeTraiteDApport(donneesDuTraite(contexte));
  return renumeroterLesResolutions(genererDocument(acte.gabarit, donnees));
}

export async function produireLesActesDeLaModification(
  dossierId: number,
  modification: Modification
) {
  // Un dossier incomplet produirait des actes troués, qui partiraient au greffe en
  // l'état.
  const manques = verifierModification(
    modification.codes,
    modification.valeurs,
    modification.societe,
    modification.assemblee,
    modification.cessions
  );
  if (manques.length > 0) throw new DossierIncompletPourLesActes(manques);

  const societe = {
    ...modification.societe,
    villeRcs:
      modification.societe.villeRcs ||
      villeDuRcs(modification.societe.codePostal, modification.societe.ville),
  };

  const donnees = donneesDuGabarit({
    societe,
    assemblee: modification.assemblee,
    codes: modification.codes,
    valeurs: modification.valeurs,
    cessions: modification.cessions,
    villeRcsNouvelle: villeDuRcs(
      typeof modification.valeurs.nouveauCodePostal === "string"
        ? modification.valeurs.nouveauCodePostal
        : "",
      typeof modification.valeurs.nouvelleVille === "string"
        ? modification.valeurs.nouvelleVille
        : ""
    ),
  });

  const aProduire = actesAProduire(
    modification.codes,
    modification.societe.forme,
    modification.valeurs,
    /*
     * Le nombre d'associés décide du procès-verbal.
     *
     * Une SASU dont deux associés sont saisis n'a plus d'associé unique : l'acte
     * s'intitulait « DÉCISION DE L'ASSOCIÉ UNIQUE » et listait deux noms détenant
     * chacun des parts.
     */
    (modification.assemblee.associes ?? []).length
  );
  if (aProduire.length === 0) throw new AucunActeAProduire();

  /*
   * Ce qui mérite un regard sans empêcher l'acte.
   *
   * Les incohérences bloquantes du procès-verbal sont relevées par
   * `verifierModification` ci-dessus, comme dans le formulaire et à la route de
   * paiement : arrivé ici, le dossier les a déjà franchies. Restent les conséquences
   * qu'on ne veut pas voir passer sans trace - le délai d'opposition des créanciers
   * sur une réduction qui n'efface pas des pertes.
   */
  for (const alerte of verifierLePvAge({
    societe,
    assemblee: modification.assemblee,
    codes: modification.codes,
    valeurs: modification.valeurs,
    cessions: modification.cessions,
  })) {
    if (alerte.gravite === "bloquant") continue;
    journal.warn(
      { dossier: dossierId, bloc: alerte.bloc },
      "Procès-verbal : " + alerte.message
    );
  }

  /*
   * Le procès-verbal d'assemblée passe par le modèle du cabinet.
   *
   * Il apporte sa feuille de styles, sa numérotation et son pied de page : la passe de
   * mise en page héritée les défairait. Ses balises ne sont pas celles de Formalist non
   * plus - la couche d'adaptation les traduit (voir domain/modification/pv-age.ts).
   */
  const contexte = {
    societe,
    assemblee: modification.assemblee,
    codes: modification.codes,
    valeurs: modification.valeurs,
    cessions: modification.cessions,
  };
  const donneesDuPv = donneesDuPvAge(contexte);

  // Comme à la création : régénérer remplace le jeu précédent au lieu de l'empiler.
  const actes = aProduire.map((acte) => ({
    titre: acte.titre,
    /*
     * Rendu, renuméroté, puis typographié.
     *
     * La dernière passe ne peut pas se faire sur le gabarit : « {{PRIX_CESSION}} euros »
     * n'a pas de chiffre avant l'unité, et c'est une fois la valeur posée qu'on sait
     * qu'il faut lier « 2 000 » à « euros ».
     */
    contenu: typographierLeDocument(rendu(acte, donneesDuPv, contexte, donnees)),
  }));

  /*
   * Ce que produit le cabinet attend sa relecture.
   *
   * Une modification passe toujours par un avocat : ses actes ne sont des documents
   * qu'une fois relus, et le client ne doit pas les voir avant.
   */
  return remplacerDocumentsProduits(dossierId, actes, { aRelire: true });
}
