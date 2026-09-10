import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { relancerSignature, SignatureRetenue } from "@/infrastructure/db/depots/signatures";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Renvoyer le lien de signature à une personne.
 *
 * Il n'y avait aucun moyen de le faire. Un message perdu, une adresse mal orthographiée,
 * une boîte pleine : le seul recours était de rouvrir tout le circuit, ce qui supprime
 * les demandes non signées et invalide donc les jetons de tous ceux qui n'ont pas encore
 * signé - pour en renvoyer un seul.
 *
 * Ici le jeton ne bouge pas : relancer, c'est faire revenir le message, pas casser un
 * lien qui est peut-être déjà ouvert dans un onglet.
 */
const RELANCE = z.object({
  demande: schemas.identifiant,
  /* L'adresse se corrige au moment de relancer : c'est le geste qu'on fait quand rien
     n'est arrivé, et une faute de frappe en est la première cause. */
  email: schemas.email.optional(),
});

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { demande, email } = await validerCorps(RELANCE, requete);

  let envoi: Awaited<ReturnType<typeof relancerSignature>>;
  try {
    envoi = await relancerSignature(utilisateur, demande, email);
  } catch (e) {
    /* Déjà signée, ou relancée il y a dix secondes : ce n'est pas une erreur du client,
       c'est l'ordre des choses. */
    if (e instanceof SignatureRetenue) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  if (!envoi) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  /* Le jeton ne sort pas d'ici : il part par courriel, pas dans une réponse que le
     navigateur conserve. Ce qui sort, c'est ce qu'on peut dire à l'écran. */
  return NextResponse.json({ ok: true, parti: envoi.parti, simule: envoi.simule });
});
