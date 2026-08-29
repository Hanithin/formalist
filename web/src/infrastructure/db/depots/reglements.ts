import { prisma } from "../client";
import { confirmerLeReglement as confirmerAutoEntreprise } from "./auto-entrepreneur";
import { confirmerLeReglement as confirmerModification } from "./modifications";
import { confirmerLeReglementDesComptes } from "./comptes";
import { confirmerLeReglementDeLaFermeture } from "./fermeture";
import { confirmerLeReglementDeLaCessation } from "./cessation";
import { confirmerLeReglementDeLaCreation } from "./brouillons";
import { natureDuDossier } from "@/domain/societe/portefeuille";
import { journal } from "@/lib/journal";

/**
 * Le règlement d'une formalité, confirmé par le parcours dont elle relève.
 *
 * Le relais de Stripe appelait le même module pour toutes : celui de l'auto-entreprise.
 * Une modification encaissée par ce chemin se voyait relue comme une déclaration
 * d'auto-entrepreneur, réécrite avec les valeurs par défaut de celle-ci, et inscrite au
 * journal sous « auto_entreprise_payee ». Cela ne se voyait pas, parce que le parcours
 * de modification confirme d'ordinaire au retour du client - mais le relais arrive
 * aussi, et parfois le premier.
 *
 * Chaque parcours garde sa confirmation : elles n'écrivent ni les mêmes champs, ni le
 * même statut, ni la même ligne de journal. Ce module ne fait que choisir.
 *
 * Le choix passe par `natureDuDossier` et non par une comparaison de chaînes. Le type
 * est du texte libre : les dossiers portent « Création SARL » ou « Dépôt des comptes »
 * aussi bien que « creation » ou « comptes », et un test d'égalité les manquait tous.
 * Une création réglée serait alors tombée dans le repli - l'auto-entreprise - et son
 * dossier aurait été relu comme une déclaration d'auto-entrepreneur.
 */
export async function confirmerLeReglementDeLaFormalite(
  reference: string,
  dossierId: number | null
) {
  const dossier = await prisma.formalites.findFirst({
    where: dossierId ? { id: dossierId } : { data_json: { contains: reference } },
    select: { id: true, type: true },
  });

  if (!dossier) {
    journal.warn({ session: reference }, "Encaissement sans dossier");
    return { dossierId: null, paye: false };
  }

  const nature = natureDuDossier(dossier.type);

  if (nature === "comptes") return confirmerLeReglementDesComptes(reference, dossier.id);
  if (nature === "cessation") return confirmerLeReglementDeLaCessation(reference, dossier.id);
  if (nature === "fermeture") return confirmerLeReglementDeLaFermeture(reference, dossier.id);
  if (nature === "modification") return confirmerModification(reference, dossier.id);
  if (nature === "creation") return confirmerLeReglementDeLaCreation(reference, dossier.id);

  /*
   * Le repli reste l'auto-entreprise, mais il est désormais le seul cas non reconnu.
   * Un type que personne n'a prévu s'y arrête, et la ligne de journal le dira.
   */
  if (nature !== "auto-entrepreneur") {
    journal.warn(
      { dossier: dossier.id, type: dossier.type },
      "Encaissement d'un dossier de type inconnu, confirmé comme auto-entreprise"
    );
  }
  return confirmerAutoEntreprise(reference, dossier.id);
}
