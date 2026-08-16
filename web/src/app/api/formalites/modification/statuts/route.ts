import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirModification,
  completerModification,
} from "@/infrastructure/db/depots/modifications";
import { actesDe, dernierDepotDeStatuts, telechargerActe } from "@/infrastructure/inpi/actes";
import { RegistreIndisponible } from "@/infrastructure/inpi/registre";
import { deposerPdfProduit } from "@/infrastructure/documents/depot";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Les statuts en vigueur, repris au registre national.
 *
 * Le client n'a pas à retrouver un PDF déposé il y a six ans : l'INPI diffuse les
 * actes publics d'une société, statuts compris. On les lui montre, avec leur date de
 * dépôt, et on lui demande de confirmer.
 *
 * Cette confirmation n'est pas une formalité. La date de dépôt ne prouve pas que les
 * statuts sont à jour : une modification décidée et jamais déposée les périme. C'est
 * donc le client qui affirme, et son affirmation est datée dans le dossier - l'avocat
 * saura qui a dit quoi.
 *
 * Un registre muet n'est pas une panne : une société peut n'avoir aucun acte public.
 * On le dit, et l'on passe au dépôt manuel.
 */

export const TITRE_STATUTS = "Statuts en vigueur";

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const dossierId = Number(new URL(requete.url).searchParams.get("dossier"));
  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }

  const { modification } = await ouvrirModification(utilisateur, dossierId);
  const siren = (modification.societe.siren ?? "").replace(/\s/g, "");

  if (!siren) {
    return NextResponse.json({ error: "Le SIREN de la société n'est pas renseigné" }, { status: 400 });
  }

  try {
    const actes = await actesDe(siren);
    const statuts = dernierDepotDeStatuts(actes);

    return NextResponse.json({
      // Le nombre d'actes dit au client pourquoi la liste est vide : « aucun acte
      // public » et « aucun acte de statuts » ne se corrigent pas de la même façon.
      actes: actes.length,
      statuts,
    });
  } catch (e) {
    if (e instanceof RegistreIndisponible) {
      return NextResponse.json({ error: e.message, registre: false }, { status: e.statut });
    }
    throw e;
  }
});

const CONFIRMATION = z.object({
  dossier: schemas.identifiant,
  acte: z.string().trim().max(64),
});

/**
 * Le client confirme que l'acte du registre est bien la version en vigueur.
 *
 * On télécharge alors le PDF et on le joint au dossier : la suite du parcours - la
 * retouche article par article - travaille sur ce fichier, et il doit rester le même
 * que celui qui a été montré.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier: dossierId, acte } = await validerCorps(CONFIRMATION, requete);

  const { modification } = await ouvrirModification(utilisateur, dossierId);
  const siren = (modification.societe.siren ?? "").replace(/\s/g, "");
  if (!siren) {
    return NextResponse.json({ error: "Le SIREN de la société n'est pas renseigné" }, { status: 400 });
  }

  try {
    // L'identifiant est revérifié auprès du registre : accepter celui du corps de la
    // requête ferait de cette route un relais vers n'importe quel acte de l'INPI.
    const actes = await actesDe(siren);
    const choisi = actes.find((a) => a.id === acte);
    if (!choisi) {
      return NextResponse.json({ error: "Cet acte n'est pas au dossier de la société" }, { status: 400 });
    }

    const pdf = await telechargerActe(choisi.id);
    await deposerPdfProduit(dossierId, TITRE_STATUTS, pdf);

    await completerModification(utilisateur, dossierId, {
      statuts: {
        source: "inpi",
        acteId: choisi.id,
        deposeLe: choisi.deposeLe,
        nature: choisi.nature,
        confirmeLe: new Date().toISOString(),
      },
    });

    return NextResponse.json({ ok: true, nature: choisi.nature, deposeLe: choisi.deposeLe });
  } catch (e) {
    if (e instanceof RegistreIndisponible) {
      return NextResponse.json({ error: e.message, registre: false }, { status: e.statut });
    }
    throw e;
  }
});
