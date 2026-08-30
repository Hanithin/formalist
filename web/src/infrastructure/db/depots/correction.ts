/**
 * Corriger un dossier depuis l'espace avocat, puis reproduire ses actes.
 *
 * L'avocat qui voyait une coquille dans un acte n'avait qu'un chemin : télécharger le
 * Word, le corriger à la main, redéposer sa version. La faute restait dans le dossier,
 * l'acte suivant la reprenait, et le document remis ne correspondait plus aux données
 * dont il était censé sortir.
 *
 * Ici, on corrige la source. Les cinq parcours qui produisent des actes déclarent leurs
 * champs - libellé, groupe, type, aide - et rangent les valeurs saisies dans leur
 * `data_json` ; ce module fait la correspondance, écrit, et relance la production.
 *
 * Deux limites assumées. Les listes de personnes - associés, dirigeants, cessionnaires -
 * ne sont pas des champs : on les ajoute et on les retire, et elles se corrigent dans le
 * parcours. Et l'auto-entrepreneur ne produit aucun acte : il n'y a rien à reproduire.
 *
 * L'écriture ne passe pas par les fonctions du client - `completerComptes` et leurs
 * sœurs - parce qu'elles verrouillent le dossier une fois transmis. C'est précisément le
 * moment où l'avocat corrige.
 */

import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import type { UtilisateurConnecte } from "../sessions";
import { exigerDossier } from "./dossiers";
import type { ChampModification } from "@/domain/modification/types";
import { champsASaisir } from "@/domain/modification/types";
import {
  CHAMPS_CREATION,
  valeursDuBrouillon,
  brouillonAvecValeurs,
} from "@/domain/formalite/champs-creation";
import { champsAffiches as champsDesComptes } from "@/domain/comptes/verification";
import { fonctionsDuDirigeant } from "@/domain/formalite/formes";
import { champsAffiches as champsDeLaFermeture } from "@/domain/fermeture/verification";
import { champsAffiches as champsDeLaCessation } from "@/domain/cessation/verification";
import { lireBrouillon } from "./brouillons";
import { lireComptes } from "./comptes";
import { lireModification } from "./modifications";
import { lireFermeture } from "./fermeture";
import { lireCessation } from "./cessation";
import { produireLesActes } from "@/infrastructure/documents/actes";
import { prevenir } from "./avis";
import { actesRetires } from "@/domain/formalite/avis";
import { avancerSelonLeTravail } from "./avocat";
import { produireLesActesDesComptes } from "@/infrastructure/documents/actes-comptes";
import { produireLesActesDeLaModification } from "@/infrastructure/documents/actes-modification";
import { produireLesActesDeLaFermeture } from "@/infrastructure/documents/actes-fermeture";
import { produireLesActesDeLaCessation } from "@/infrastructure/documents/actes-cessation";

export type Valeurs = Record<string, string | number | undefined>;

export interface FormulaireDuDossier {
  champs: ChampModification[];
  valeurs: Valeurs;
  /** Faux quand le type ne produit aucun acte : la fenêtre ne s'ouvre pas. */
  reproductible: boolean;
}

function exigerAvocat(utilisateur: UtilisateurConnecte) {
  const permis = utilisateur.roles.includes("avocat") || utilisateur.roles.includes("admin");
  if (!permis) throw new Interdit("Réservé aux avocats");
}

/** Un champ conditionné ne se montre que si sa condition est remplie. */
function visible(champ: ChampModification, valeurs: Valeurs): boolean {
  if (!champ.visibleSi) return true;
  return champ.visibleSi.vaut.includes(String(valeurs[champ.visibleSi.champ] ?? ""));
}

/**
 * Les champs du dossier et leurs valeurs, quel que soit son type.
 *
 * Chaque parcours range ses valeurs à sa façon : sous `valeurs` pour quatre d'entre
 * eux, à plat à la racine pour la création, la plus ancienne.
 */
export async function formulaireDuDossier(
  utilisateur: UtilisateurConnecte,
  dossierId: number
): Promise<FormulaireDuDossier> {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);
  const json = dossier.data_json;

  if (dossier.type === "creation") {
    const brouillon = lireBrouillon(json) as unknown as Record<string, unknown>;
    const valeurs = valeursDuBrouillon(brouillon);
    return {
      champs: CHAMPS_CREATION.filter((c) => visible(c, valeurs)),
      valeurs,
      reproductible: true,
    };
  }

  if (dossier.type === "comptes") {
    const comptes = lireComptes(json);
    /*
     * Le titre du dirigeant tient à la forme, il n'est pas au choix.
     *
     * La table déclare les quatre titres pour tout le monde ; l'écran du client les
     * restreint au moment de les offrir. Sans cette même restriction ici, la fenêtre
     * proposait « Gérant » à une société par actions - un titre que la vérification
     * refuse ensuite, après avoir laissé écrire.
     */
    const titres = fonctionsDuDirigeant(comptes.societe.forme);
    return {
      champs: champsDesComptes(comptes.societe.forme, comptes.valeurs).map((champ) =>
        champ.identifiant === "dirigeantFonction" ? { ...champ, options: titres } : champ
      ),
      valeurs: comptes.valeurs,
      reproductible: true,
    };
  }

  if (dossier.type === "modification") {
    const modification = lireModification(json);
    return {
      champs: champsASaisir(modification.codes, modification.valeurs, modification.societe.forme),
      valeurs: modification.valeurs,
      reproductible: true,
    };
  }

  if (dossier.type === "fermeture") {
    const fermeture = lireFermeture(json);
    return {
      champs:
        fermeture.voie === null || fermeture.voie === "liquidation-judiciaire"
          ? []
          : champsDeLaFermeture({
              voie: fermeture.voie,
              phase: fermeture.phase,
              societe: fermeture.societe,
              valeurs: fermeture.valeurs,
              nombreDAssocies: fermeture.associes.length,
            }),
      valeurs: fermeture.valeurs,
      reproductible: true,
    };
  }

  if (dossier.type === "cessation") {
    const cessation = lireCessation(json);
    return {
      champs: champsDeLaCessation({
        nature: cessation.nature,
        entreprise: cessation.entreprise,
        valeurs: cessation.valeurs,
      }),
      valeurs: cessation.valeurs,
      reproductible: true,
    };
  }

  /* L'auto-entreprise n'a ni gabarit ni acte : il n'y a rien à reproduire. */
  return { champs: [], valeurs: {}, reproductible: false };
}

/**
 * Écrit les valeurs corrigées, puis reproduit les actes.
 *
 * Les actes du dossier partagent les mêmes données : corriger la date de clôture doit
 * la corriger dans le procès-verbal comme dans la déclaration. Ils sont donc tous
 * refaits, et repassent en relecture - ce qui vient d'être réécrit n'a pas été validé
 * sous cette forme. Ceux que la production conserve, parce qu'ils sont signés ou
 * vérifiés, ne bougent pas.
 */
export async function corrigerEtReproduire(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  corrections: Valeurs
) {
  exigerAvocat(utilisateur);
  const dossier = await exigerDossier(utilisateur, dossierId);

  const lu: unknown = JSON.parse(dossier.data_json ?? "{}");
  const brut = (lu && typeof lu === "object" ? lu : {}) as Record<string, unknown>;

  const ecrit =
    dossier.type === "creation"
      ? brouillonAvecValeurs(brut, corrections)
      : {
          ...brut,
          valeurs: { ...((brut.valeurs as Valeurs | undefined) ?? {}), ...corrections },
        };

  await prisma.formalites.update({
    where: { id: dossierId },
    data: { data_json: JSON.stringify(ecrit), updated_at: new Date() },
  });

  /*
   * Les identifiants de champs restent au commentaire, non à la valeur.
   *
   * `after_value` est ce que le fil du client rend : il y lisait « a corrigé le
   * dossier : dateOuverture, dateCloture, dirigeantFonction » - les noms que le code
   * donne à ses champs, tronqués par la colonne. Le commentaire, lui, ne sort que
   * dans le journal du cabinet.
   */
  await prisma.audit_log.create({
    data: {
      formalite_id: dossierId,
      actor_id: utilisateur.id,
      actor_role: "avocat",
      action: "dossier_corrige",
      comment: Object.keys(corrections).join(", ") || null,
    },
  });

  const par = utilisateur.id;

  if (dossier.type === "creation") {
    /*
     * Un acte corrigé repasse devant l'avocat, comme dans les quatre autres parcours.
     *
     * Eux produisent toujours `aRelire` ; la création s'en remettait à l'état courant,
     * si bien qu'un dossier dont les actes étaient déjà chez le client - donc validés -
     * les voyait remplacés en silence par d'autres, qu'aucune relecture n'avait vus. Le
     * client pouvait avoir téléchargé les premiers la veille. La fenêtre de correction
     * promet d'ailleurs l'inverse : « ils repasseront en relecture ».
     */
    const chezLeClient = await prisma.documents.count({
      where: { formalite_id: dossierId, uploaded_by: "system", status: "generated" },
    });

    const { produits } = await produireLesActes(utilisateur, dossierId, {
      forcerLaRelecture: true,
    });

    /* Des documents qui quittent son espace sans un mot inquiètent plus qu'ils n'informent. */
    if (chezLeClient > 0) {
      await prevenir(
        dossier.user_id,
        dossierId,
        actesRetires(dossier.societe || "votre société")
      );
      await avancerSelonLeTravail(utilisateur, dossierId);
    }

    return { produits: produits.length };
  }
  if (dossier.type === "comptes") {
    const { produits } = await produireLesActesDesComptes(
      dossierId,
      lireComptes(JSON.stringify(ecrit)),
      { par }
    );
    return { produits: produits.length };
  }
  if (dossier.type === "modification") {
    const { produits } = await produireLesActesDeLaModification(
      dossierId,
      lireModification(JSON.stringify(ecrit)),
      { par }
    );
    return { produits: produits.length };
  }
  if (dossier.type === "fermeture") {
    const { produits } = await produireLesActesDeLaFermeture(
      dossierId,
      lireFermeture(JSON.stringify(ecrit)),
      { par }
    );
    return { produits: produits.length };
  }
  if (dossier.type === "cessation") {
    const { produits } = await produireLesActesDeLaCessation(
      dossierId,
      lireCessation(JSON.stringify(ecrit)),
      { par }
    );
    return { produits: produits.length };
  }

  throw new Interdit("Ce type de dossier ne produit pas d'actes");
}
