import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  mesConsultations,
  reserver,
  annuler,
  abandonnerReservation,
  attacherPaiement,
  avocatsDisponibles,
  CreneauIndisponible,
} from "@/infrastructure/db/depots/consultations";
import { ouvrirPaiement } from "@/infrastructure/paiement/stripe";
import { PRIX_TTC_CENTIMES, DUREE_MINUTES } from "@/domain/consultation/offre";
import { PAIEMENT_OUVERT_MINUTES } from "@/domain/consultation/paiement";
import { nomDeMatiere } from "@/domain/consultation/matieres";
import { PIECES_MAXIMUM } from "@/domain/consultation/pieces";
import { validerCorps, schemas } from "@/lib/valider";
import { adresseDeRetour } from "@/lib/site";
import { journal } from "@/lib/journal";
import { route } from "@/lib/reponses";

const RESERVATION = z.object({
  avocat: schemas.identifiant,
  debut: z.string().datetime({ offset: true }),
  matiere: z.string().trim().min(1, "Choisissez une matière"),
  // Dix caractères : la même exigence que l'assistant d'origine. Une description
  // vide ne permet pas à l'avocat de préparer quoi que ce soit.
  description: z.string().trim().min(10, "Décrivez votre besoin en quelques mots").max(2000),
  pieces: z
    .array(z.object({ fichier: z.string().min(1), nom: z.string().min(1) }))
    .max(PIECES_MAXIMUM)
    .optional(),
});

const ANNULATION = z.object({ consultation: schemas.identifiant });

export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  const [consultations, avocats] = await Promise.all([
    mesConsultations(utilisateur),
    avocatsDisponibles(),
  ]);
  return NextResponse.json({ consultations, avocats });
});

/**
 * Réserve un créneau et ouvre le paiement.
 *
 * Deux écritures dans l'ordre : la consultation d'abord, qui retire le créneau des
 * disponibilités, puis la session de paiement. Si Stripe échoue, la réservation est
 * abandonnée tout de suite - sinon un créneau resterait bloqué sans qu'aucun
 * paiement ne puisse le confirmer.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const demande = await validerCorps(RESERVATION, requete);

  let consultationId: number | null = null;
  try {
    const rendezVous = await reserver(utilisateur, {
      avocatId: demande.avocat,
      debut: new Date(demande.debut),
      matiere: demande.matiere,
      description: demande.description,
      pieces: demande.pieces ?? [],
    });
    consultationId = rendezVous.id;

    const paiement = await ouvrirPaiement({
      consultationId: rendezVous.id,
      intitule:
        "Consultation juridique - " +
        nomDeMatiere(demande.matiere) +
        " (" +
        DUREE_MINUTES +
        " min)",
      montantCentimes: PRIX_TTC_CENTIMES,
      email: utilisateur.email,
      retour: adresseDeRetour(requete, "/api/paiement/retour?session={SESSION}"),
      abandon: adresseDeRetour(requete, "/api/paiement/retour?abandon=" + rendezVous.id),
      expireDans: PAIEMENT_OUVERT_MINUTES * 60,
    });

    await attacherPaiement(rendezVous.id, paiement.reference);

    return NextResponse.json(
      { ok: true, consultation: { id: rendezVous.id }, paiement: paiement.adresse },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof CreneauIndisponible) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    // Le créneau a été pris pour un paiement qui n'existera pas : on le rend.
    if (consultationId !== null) {
      await abandonnerReservation(consultationId, utilisateur.id);
      journal.warn({ consultation: consultationId }, "Réservation rendue, paiement non ouvert");
    }
    throw e;
  }
});

export const DELETE = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { consultation } = await validerCorps(ANNULATION, requete);
  const resultat = await annuler(utilisateur, consultation);
  return NextResponse.json({ ok: true, ...resultat });
});
