import { NextResponse } from "next/server";
import { exigerUtilisateur, Interdit } from "@/infrastructure/db/utilisateur-courant";
import {
  remplacerLeProjetDActe,
  ActeIntrouvable,
  ActeFige,
} from "@/infrastructure/documents/depot";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

/**
 * L'avocat redépose la version corrigée d'un projet d'acte.
 *
 * Le cabinet produit le procès-verbal en Word et le fige en PDF ; l'avocat n'avait que
 * le PDF, qu'on ne corrige pas. Il reprend maintenant le Word dans son traitement de
 * texte et le redépose ici : c'est sa version qui devient l'acte du dossier, et le PDF
 * remis au client en est refait.
 *
 * Le contrôle de ce qui peut être remplacé - un projet, jamais un acte relu ou signé -
 * appartient au dépôt, qui seul connaît l'état du document.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Réservé aux avocats");
  }

  const formulaire = await requete.formData();
  const documentId = Number(formulaire.get("document"));
  const fichier = formulaire.get("fichier");

  if (!Number.isInteger(documentId) || documentId <= 0) {
    return NextResponse.json({ error: "Document invalide" }, { status: 400 });
  }
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, document: await remplacerLeProjetDActe(utilisateur, documentId, fichier) });
  } catch (e) {
    if (e instanceof ActeIntrouvable || e instanceof ActeFige || e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: (e as { statut?: number }).statut ?? 400 });
    }
    throw e;
  }
});
