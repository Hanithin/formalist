import { prisma } from "../client";
import { Interdit } from "../utilisateur-courant";
import {
  definitionContrat,
  verifierContrat,
  transitionPermise,
  type Anomalie,
} from "@/domain/contrat/catalogue";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Contrats.
 *
 * Même règle que partout : l'utilisateur est le premier argument, et il n'existe
 * aucune fonction qui charge un contrat par identifiant seul.
 */

export class ContratRefuse extends Error {
  readonly statut = 400;
  readonly anomalies: Anomalie[];
  constructor(anomalies: Anomalie[]) {
    super(anomalies[0]?.message ?? "Contrat incomplet");
    this.name = "ContratRefuse";
    this.anomalies = anomalies;
  }
}

function lireValeurs(dataJson: string | null): Record<string, string | number> {
  if (!dataJson) return {};
  try {
    const analyse: unknown = JSON.parse(dataJson);
    return analyse && typeof analyse === "object"
      ? (analyse as Record<string, string | number>)
      : {};
  } catch {
    return {};
  }
}

export async function lireContrat(utilisateur: UtilisateurConnecte, id: number) {
  const contrat = await prisma.contrats.findUnique({ where: { id } });
  if (!contrat) return null;

  const autorise =
    contrat.user_id === utilisateur.id ||
    contrat.assigned_avocat_id === utilisateur.id ||
    utilisateur.roles.includes("admin");

  // On ne distingue pas « inexistant » de « interdit », comme pour les dossiers.
  if (!autorise) return null;

  return { ...contrat, valeurs: lireValeurs(contrat.data_json) };
}

export async function exigerContrat(utilisateur: UtilisateurConnecte, id: number) {
  const contrat = await lireContrat(utilisateur, id);
  if (!contrat) throw new Interdit("Ce contrat n'existe pas ou ne vous est pas accessible");
  return contrat;
}

export async function creerContrat(utilisateur: UtilisateurConnecte, type: string, titre: string) {
  const definition = definitionContrat(type);
  if (!definition) throw new ContratRefuse([{ champ: "type", message: "Type de contrat inconnu" }]);

  const contrat = await prisma.contrats.create({
    data: {
      user_id: utilisateur.id,
      type: definition.code,
      titre: titre.trim() || definition.libelle,
      status: "brouillon",
      data_json: "{}",
    },
  });

  return contrat;
}

export async function enregistrerContrat(
  utilisateur: UtilisateurConnecte,
  id: number,
  valeurs: Record<string, string | number>
) {
  const contrat = await exigerContrat(utilisateur, id);

  // Un contrat signé engage les parties : le modifier après coup n'aurait
  // aucune valeur, et brouillerait la trace de ce qui a été signé.
  if (contrat.status === "signe") {
    throw new Interdit("Un contrat signé ne peut plus être modifié");
  }

  const fusionne = { ...contrat.valeurs, ...valeurs };

  await prisma.contrats.update({
    where: { id },
    data: { data_json: JSON.stringify(fusionne), updated_at: new Date() },
  });

  return fusionne;
}

/** Fait avancer un contrat, si la transition est permise. */
export async function changerEtat(utilisateur: UtilisateurConnecte, id: number, vers: string) {
  const contrat = await exigerContrat(utilisateur, id);

  if (!transitionPermise(contrat.status, vers)) {
    throw new Interdit(
      "Ce contrat ne peut pas passer de « " + contrat.status + " » à « " + vers + " »"
    );
  }

  // On ne génère pas un contrat troué : il partirait à la signature en l'état.
  if (vers === "genere") {
    const anomalies = verifierContrat(contrat.type, contrat.valeurs);
    if (anomalies.length > 0) throw new ContratRefuse(anomalies);
  }

  return prisma.contrats.update({
    where: { id },
    data: { status: vers, updated_at: new Date() },
  });
}
