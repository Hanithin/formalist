import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { completerModification, ouvrirModification } from "@/infrastructure/db/depots/modifications";
import { deposerPdfProduit } from "@/infrastructure/documents/depot";
import { verifierDepot, DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";
import { TITRE_STATUTS } from "../route";

/**
 * Le dépôt des statuts par le client.
 *
 * Trois chemins y mènent : le registre ne publie aucun acte, il ne répond pas, ou le
 * client dispose d'une version plus récente que le dernier dépôt. Le troisième est le
 * plus important - c'est celui d'une société qui a modifié ses statuts sans les
 * déposer, et le registre montrerait alors une version périmée.
 *
 * Seul le PDF est accepté : la retouche article par article travaille sur des pages,
 * et un Word n'a pas de pages tant qu'il n'est pas rendu.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const formulaire = await requete.formData();
  const dossierId = Number(formulaire.get("dossier"));
  const fichier = formulaire.get("fichier");

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  await ouvrirModification(utilisateur, dossierId);

  const contenu = Buffer.from(await fichier.arrayBuffer());
  try {
    verifierDepot(fichier.name, contenu, ["pdf"]);
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  await deposerPdfProduit(dossierId, TITRE_STATUTS, contenu);

  await completerModification(utilisateur, dossierId, {
    statuts: {
      source: "depot",
      fichier: fichier.name,
      confirmeLe: new Date().toISOString(),
    },
    // Les retouches d'un document remplacé n'ont plus de sens : leurs coordonnées
    // désignent des passages d'un autre fichier, et les appliquer poserait des
    // rectangles blancs au hasard sur les nouveaux statuts.
    retouches: [],
    statutsAJour: false,
  });

  return NextResponse.json({ ok: true, fichier: fichier.name }, { status: 201 });
});
