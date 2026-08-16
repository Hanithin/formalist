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
import {
  decrireLeChangement,
  inscrire,
  memeEtat,
  positionValide,
} from "@/domain/modification/historique";
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

    /*
     * L'état de départ, posé au dossier dès la première lecture.
     *
     * Les passages repérés n'étaient qu'affichés : le dossier, lui, restait vide. Le
     * premier geste de l'avocat se comparait donc au vide et s'inscrivait « cadre
     * ajouté » alors qu'il réécrivait un cadre déjà là - et l'on ne pouvait pas
     * revenir à la proposition d'origine, faute d'étape avant la sienne.
     *
     * L'auteur est le repérage, non l'avocat : il n'a rien fait à ce stade.
     */
    const proposees = retouchesProposees(zones);
    const deja = modification.retouches ?? [];
    const depart = deja.length > 0 ? deja : proposees;

    let historique = modification.historique ?? [];
    let position = modification.positionHistorique ?? historique.length - 1;

    if (historique.length === 0 && depart.length > 0) {
      const premiere = inscrire([], -1, {
        retouches: depart,
        pagesRetirees: modification.pagesRetirees ?? [],
        quand: new Date().toISOString(),
        qui: deja.length > 0 ? "État repris" : "Repérage automatique",
        libelle:
          deja.length > 0
            ? "État du dossier à l'ouverture du suivi"
            : proposees.length === 1
              ? "1 passage repéré"
              : proposees.length + " passages repérés",
      });
      await completerModification(utilisateur, dossierId, {
        retouches: depart,
        historique: premiere.historique,
        positionHistorique: premiere.position,
      });
      historique = premiere.historique;
      position = premiere.position;
    }

    return NextResponse.json({
      pages: lecture.pages,
      pagesRetirees: modification.pagesRetirees ?? [],
      historique,
      positionHistorique: position,
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
      retouches: depart,
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
  police: z
    .enum(["serif", "sans", "mono", "garamond", "lato", "calibri", "georgia"])
    .optional(),
  gras: z.boolean().optional(),
  italique: z.boolean().optional(),
  souligne: z.boolean().optional(),
  alignement: z.enum(["gauche", "centre", "droite"]).optional(),
  // Le texte découpé, quand il porte plusieurs mises en forme.
  fragments: z
    .array(
      z.object({
        texte: z.string().max(2000),
        gras: z.boolean().optional(),
        italique: z.boolean().optional(),
        souligne: z.boolean().optional(),
      })
    )
    .max(200)
    .optional(),
});

const APPLICATION = z.object({
  dossier: schemas.identifiant,
  retouches: z.array(RETOUCHE).max(200),
  /** Les pages écartées du document produit. L'original les garde. */
  pagesRetirees: z.array(z.number().int().min(1).max(60)).max(60).optional(),
});

/**
 * Le brouillon des retouches, conservé au fil de la saisie, et son historique.
 *
 * Elles ne vivaient qu'en mémoire jusqu'au clic sur « Appliquer » : un
 * rafraîchissement, un onglet fermé, un retour en arrière, et tout le travail de
 * placement était perdu sans un mot. On les enregistre donc au fil de l'eau, sans
 * produire de document - produire à chaque frappe ferait un PDF par lettre.
 *
 * Chaque enregistrement qui change quelque chose inscrit une étape, avec l'heure et
 * le nom du compte. Le nom est pris de la session, non du corps de la requête : c'est
 * une trace, et une trace qu'on peut se donner soi-même n'en est pas une.
 */
export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier: dossierId, retouches, pagesRetirees = [] } = await validerCorps(
    APPLICATION,
    requete
  );

  const { modification } = await ouvrirModification(utilisateur, dossierId);
  const avant = {
    retouches: modification.retouches ?? [],
    pagesRetirees: modification.pagesRetirees ?? [],
  };
  const apres = { retouches, pagesRetirees };

  // Un enregistrement qui ne change rien n'inscrit rien : la frappe en cours en
  // déclenche plusieurs, et l'historique se remplirait d'étapes identiques.
  if (memeEtat(avant, apres)) {
    return NextResponse.json({ ok: true, retouches: retouches.length, inscrit: false });
  }

  const historique = modification.historique ?? [];
  const position = modification.positionHistorique ?? historique.length - 1;

  const suite = inscrire(historique, position, {
    ...apres,
    quand: new Date().toISOString(),
    qui: utilisateur.nom,
    libelle: decrireLeChangement(avant, apres),
  });

  await completerModification(utilisateur, dossierId, {
    retouches,
    pagesRetirees,
    historique: suite.historique,
    positionHistorique: suite.position,
  });

  return NextResponse.json({ ok: true, retouches: retouches.length, inscrit: true, ...suite });
});

const RETOUR = z.object({
  dossier: schemas.identifiant,
  position: z.number().int().min(0).max(200),
});

/**
 * Le retour à une étape de l'historique.
 *
 * On remplace l'état par celui de l'étape choisie, sans rien inscrire : revenir en
 * arrière n'est pas un geste de plus, sans quoi l'on ne pourrait jamais revenir en
 * avant. La position demandée est ramenée dans les bornes - elle vient du réseau.
 */
export const PATCH = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier: dossierId, position } = await validerCorps(RETOUR, requete);

  const { modification } = await ouvrirModification(utilisateur, dossierId);
  const historique = modification.historique ?? [];
  if (historique.length === 0) {
    return NextResponse.json({ error: "Rien à reprendre" }, { status: 409 });
  }

  const retenue = positionValide(historique, position);
  const etape = historique[retenue];

  await completerModification(utilisateur, dossierId, {
    retouches: etape.retouches,
    pagesRetirees: etape.pagesRetirees,
    positionHistorique: retenue,
  });

  return NextResponse.json({
    ok: true,
    position: retenue,
    retouches: etape.retouches,
    pagesRetirees: etape.pagesRetirees,
  });
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier: dossierId, retouches, pagesRetirees = [] } = await validerCorps(
    APPLICATION,
    requete
  );

  await ouvrirModification(utilisateur, dossierId);

  const statuts = await lireDocumentProduit(dossierId, TITRE_STATUTS);
  if (!statuts) {
    return NextResponse.json({ error: "Les statuts en vigueur ne sont pas au dossier" }, { status: 409 });
  }

  try {
    /*
     * Les statuts en vigueur ne sont jamais touchés.
     *
     * La retouche part d'eux et produit un second document : le dossier porte donc
     * toujours l'original et la version à jour, et l'on peut recommencer autant de
     * fois qu'il faut sans jamais perdre le point de départ.
     */
    const produit = await appliquerLesRetouches(statuts, retouches, pagesRetirees);
    await deposerPdfProduit(dossierId, TITRE_A_JOUR, produit);
    await completerModification(utilisateur, dossierId, {
      retouches,
      pagesRetirees,
      statutsAJour: true,
    });

    return NextResponse.json({ ok: true, retouches: retouches.length }, { status: 201 });
  } catch (e) {
    if (e instanceof StatutsIllisibles || e instanceof RetoucheInvalide) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
