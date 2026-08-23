import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { completerComptes, ouvrirComptes } from "@/infrastructure/db/depots/comptes";
import { deposerPiece } from "@/infrastructure/documents/depot";
import { lireLeBilan, BilanIllisible } from "@/infrastructure/documents/lecture-bilan";
import { extraireLesChiffres } from "@/infrastructure/ia/bilan";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

/**
 * Le dépôt d'une liasse, et la lecture des chiffres qu'elle porte.
 *
 * Le fichier est conservé : c'est lui que l'avocat relira, et c'est lui qui justifie
 * les montants portés à l'acte. Les chiffres extraits sont renvoyés à l'écran, qui les
 * pose dans le formulaire et dit d'où ils viennent - ils restent modifiables un à un.
 *
 * On n'enregistre pas les valeurs ici. Un chiffre mal lu écrit d'autorité dans le
 * dossier serait plus dangereux qu'un champ vide : il aurait l'apparence d'une donnée
 * vérifiée. C'est l'écran qui les propose, et l'utilisateur qui les valide.
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

  // Le contrôle d'accès au dossier passe par là : ouvrirComptes refuse ce qui n'est
  // pas à nous, avant qu'un octet ne soit écrit.
  await ouvrirComptes(utilisateur, dossierId);

  try {
    await deposerPiece(
      utilisateur,
      dossierId,
      { identifiant: "bilan", titre: "Comptes annuels de l'exercice" },
      fichier,
      [".pdf"]
    );
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  let lu;
  try {
    lu = await lireLeBilan(Buffer.from(await fichier.arrayBuffer()));
  } catch (e) {
    if (e instanceof BilanIllisible) {
      return NextResponse.json(
        {
          error:
            "Le document a bien été déposé, mais ses chiffres n'ont pas pu être lus. Saisissez-les à la main.",
        },
        { status: 422 }
      );
    }
    throw e;
  }

  const chiffres = await extraireLesChiffres(lu.texte);

  await completerComptes(utilisateur, dossierId, {
    bilan: { fichier: fichier.name, deposeLe: new Date().toISOString() },
    extraits: chiffres.map((c) => c.champ),
  });

  return NextResponse.json({
    chiffres,
    /* « couche-texte » vaut mieux que « reconnaissance » : l'écran le dit, parce que
       la seconde peut confondre un 8 et un 3 dans un montant. */
    source: lu.source,
    pages: lu.pages,
  });
});
