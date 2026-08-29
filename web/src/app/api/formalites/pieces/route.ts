import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon } from "@/infrastructure/db/depots/brouillons";
import { deposerPiece } from "@/infrastructure/documents/depot";
import { produireLesActes, DossierIncomplet } from "@/infrastructure/documents/actes";
import { TYPE_ATTESTATION_CAPITAL } from "@/infrastructure/db/depots/suivi";
import { piecesAttendues } from "@/domain/formalite/documents";
import { piecesDeclaration } from "@/domain/auto-entrepreneur/declaration";
import { piecesAFournir } from "@/domain/modification/formalites";
import { lireModification } from "@/infrastructure/db/depots/modifications";
import { lireDeclaration } from "@/infrastructure/db/depots/auto-entrepreneur";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const formulaire = await requete.formData();
  const dossierId = Number(formulaire.get("dossier"));
  const identifiant = String(formulaire.get("piece") ?? "");
  const fichier = formulaire.get("fichier");

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  /*
   * La pièce doit être l'une de celles attendues pour ce dossier : on n'accepte pas un
   * identifiant libre, qui deviendrait un fourre-tout.
   *
   * Les deux parcours n'attendent pas les mêmes. Une auto-entreprise rend le recto et
   * le verso de sa pièce d'identité et, si son métier l'exige, sa qualification ; une
   * société rend une attestation de dépôt de capital et une parution d'annonce. Lire
   * la liste de la création pour un dossier d'auto-entreprise refusait tout dépôt.
   */
  const { dossier: ligne, brouillon } = await ouvrirBrouillon(utilisateur, dossierId);

  /*
   * La modification a sa propre liste, et elle dépend de ce qui est décidé.
   *
   * Un transfert de siège appelle le justificatif de jouissance du nouveau local, une
   * nomination la pièce d'identité du dirigeant, une augmentation en numéraire
   * l'attestation de dépôt des fonds. Faute de cette branche, un dossier de
   * modification était mesuré à l'aune de la liste de la création : tout dépôt s'y
   * voyait répondre « cette pièce n'est pas attendue ».
   */
  const attendues =
    ligne.type === "auto-entrepreneur"
      ? piecesDeclaration(lireDeclaration(ligne.data_json))
      : ligne.type === "modification"
        ? (() => {
            const modification = lireModification(ligne.data_json);
            return piecesAFournir(modification.codes ?? [], modification.valeurs ?? {}).map((p) => ({
              identifiant: p.identifiant,
              titre: p.titre,
              formats: p.formats,
            }));
          })()
        : piecesAttendues(brouillon.forme);

  const attendue = attendues.find((p) => p.identifiant === identifiant);
  if (!attendue) {
    return NextResponse.json({ error: "Cette pièce n'est pas attendue" }, { status: 400 });
  }

  try {
    const depose = await deposerPiece(
      utilisateur,
      dossierId,
      { identifiant: attendue.identifiant, titre: attendue.titre },
      fichier,
      attendue.formats
    );

    /*
     * L'attestation de dépôt de capital re-date les actes.
     *
     * La banque la délivre après le versement, et c'est ce jour-là qu'on signe les
     * statuts. Attendre une régénération manuelle laisserait des actes datés du jour
     * de leur production - c'est-à-dire d'avant l'existence du capital.
     *
     * Un dossier encore incomplet ne bloque pas le dépôt : la pièce est reçue, les
     * actes se produiront quand le reste sera là.
     */
    let redates = false;
    if (attendue.identifiant === TYPE_ATTESTATION_CAPITAL && ligne.type !== "auto-entrepreneur") {
      try {
        /*
         * Re-datés, les actes repassent devant l'avocat.
         *
         * Ce ne sont plus les mêmes documents : ils portent une autre date, celle du
         * jour où l'attestation a été déposée ici. Les laisser à disposition
         * remettrait au client, sans relecture, des statuts qu'il pourrait signer
         * aussitôt. C'est cette seconde validation qui ouvre la mise en signature.
         *
         * Avant la transmission, il n'y a pas d'avocat : les actes restent alors ce
         * qu'ils sont, une lecture de travail.
         */
        await produireLesActes(utilisateur, dossierId, {
          forcerLaRelecture: ligne.status !== "en_cours",
        });
        redates = true;
      } catch (e) {
        if (!(e instanceof DossierIncomplet)) throw e;
      }
    }

    return NextResponse.json({ ok: true, document: depose, redates }, { status: 201 });
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
