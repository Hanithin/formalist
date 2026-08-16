import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirModification,
  completerModification,
} from "@/infrastructure/db/depots/modifications";
import { lireDocumentProduit, deposerPdfProduit } from "@/infrastructure/documents/depot";
import {
  lireLesStatuts,
  appliquerLesRetouches,
  StatutsIllisibles,
} from "@/infrastructure/documents/statuts";
import {
  reperage,
  recherchesPour,
  retouchesProposees,
  RetoucheInvalide,
} from "@/domain/modification/edition";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";
import { TITRE_STATUTS } from "../statuts/route";

/**
 * La retouche des statuts, article par article.
 *
 * En lecture : on repère dans le document les passages à changer et on les propose,
 * avec le texte suggéré. En écriture : on applique ce qui a été validé et l'on produit
 * les statuts à jour.
 *
 * Rien ne s'applique sans validation. Un repérage automatique peut tomber à côté -
 * les statuts formulent librement, et une numérisation se lit mal - et un rectangle
 * blanc posé au mauvais endroit efface une clause dans un document qui part au greffe.
 */

export const TITRE_A_JOUR = "Statuts mis à jour";

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const dossierId = Number(new URL(requete.url).searchParams.get("dossier"));
  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }

  const { modification } = await ouvrirModification(utilisateur, dossierId);

  const statuts = await lireDocumentProduit(dossierId, TITRE_STATUTS);
  if (!statuts) {
    return NextResponse.json({ error: "Les statuts en vigueur ne sont pas au dossier" }, { status: 409 });
  }

  try {
    const lecture = await lireLesStatuts(statuts);
    const { zones, introuvables } = reperage(
      lecture.mots,
      recherchesPour(modification.codes, modification.valeurs, modification.societe)
    );

    return NextResponse.json({
      pages: lecture.pages,
      /*
       * Ce qui n'a pas été retrouvé compte autant que ce qui l'a été : sans cette
       * liste, l'avocat croit avoir tout remplacé et un article reste à l'ancienne
       * valeur dans un document qui part au greffe.
       */
      introuvables,
      // Une lecture par reconnaissance de caractères est approximative : l'écran le
      // dit, pour que l'avocat vérifie au lieu de faire confiance.
      reconnus: lecture.reconnus,
      zones,
      // Les retouches déjà validées l'emportent sur la proposition : reprendre
      // l'écran ne doit pas défaire un ajustement fait à la main.
      retouches: modification.retouches?.length
        ? modification.retouches
        : retouchesProposees(zones),
    });
  } catch (e) {
    if (e instanceof StatutsIllisibles) {
      return NextResponse.json({ error: e.message }, { status: e.statut });
    }
    throw e;
  }
});

const RETOUCHE = z.object({
  page: z.number().int().min(1).max(60),
  x: z.number().min(0).max(2000),
  y: z.number().min(0).max(2000),
  largeur: z.number().min(1).max(2000),
  hauteur: z.number().min(1).max(2000),
  texte: z.string().max(2000),
  taille: z.number().min(1).max(72),
  police: z.enum(["serif", "sans", "mono"]).optional(),
  gras: z.boolean().optional(),
  italique: z.boolean().optional(),
});

const APPLICATION = z.object({
  dossier: schemas.identifiant,
  retouches: z.array(RETOUCHE).max(200),
});

/**
 * Le brouillon des retouches, conservé au fil de la saisie.
 *
 * Elles ne vivaient qu'en mémoire jusqu'au clic sur « Appliquer » : un
 * rafraîchissement, un onglet fermé, un retour en arrière, et tout le travail de
 * placement était perdu sans un mot. On les enregistre donc au fil de l'eau, sans
 * produire de document - produire à chaque frappe ferait un PDF par lettre.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier: dossierId, retouches } = await validerCorps(APPLICATION, requete);

  await completerModification(utilisateur, dossierId, { retouches });
  return NextResponse.json({ ok: true, retouches: retouches.length });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier: dossierId, retouches } = await validerCorps(APPLICATION, requete);

  await ouvrirModification(utilisateur, dossierId);

  const statuts = await lireDocumentProduit(dossierId, TITRE_STATUTS);
  if (!statuts) {
    return NextResponse.json({ error: "Les statuts en vigueur ne sont pas au dossier" }, { status: 409 });
  }

  try {
    const produit = await appliquerLesRetouches(statuts, retouches);
    await deposerPdfProduit(dossierId, TITRE_A_JOUR, produit);
    await completerModification(utilisateur, dossierId, { retouches, statutsAJour: true });

    return NextResponse.json({ ok: true, retouches: retouches.length }, { status: 201 });
  } catch (e) {
    if (e instanceof StatutsIllisibles || e instanceof RetoucheInvalide) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
