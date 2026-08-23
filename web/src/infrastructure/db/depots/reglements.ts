import { prisma } from "../client";
import { confirmerLeReglement as confirmerAutoEntreprise } from "./auto-entrepreneur";
import { confirmerLeReglement as confirmerModification } from "./modifications";
import { confirmerLeReglementDesComptes } from "./comptes";
import { confirmerLeReglementDeLaFermeture } from "./fermeture";
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

  if (dossier.type === "comptes") {
    return confirmerLeReglementDesComptes(reference, dossier.id);
  }
  if (dossier.type === "fermeture") {
    return confirmerLeReglementDeLaFermeture(reference, dossier.id);
  }
  if (dossier.type === "modification") {
    return confirmerModification(reference, dossier.id);
  }
  return confirmerAutoEntreprise(reference, dossier.id);
}
