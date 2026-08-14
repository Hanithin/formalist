/**
 * Le paiement d'une consultation, et ce qu'il autorise.
 *
 * La consultation est créée avant d'être payée : c'est ce qui retire le créneau des
 * disponibilités pendant que le client est sur la page de paiement. Sans cela, deux
 * clients paieraient le même horaire et l'un des deux serait remboursé après coup.
 *
 * Le revers est qu'un paiement abandonné laisse une ligne qui occupe un créneau.
 * D'où la règle ci-dessous : une réservation impayée ne le tient qu'un temps.
 */

export type EtatPaiement = "attente" | "paye" | "rembourse" | "echoue";

/** Les valeurs telles qu'elles sont écrites en base ; l'inconnu vaut « en attente ». */
export function etatPaiement(brut: string | null | undefined): EtatPaiement {
  if (brut === "paid") return "paye";
  if (brut === "refunded") return "rembourse";
  if (brut === "failed") return "echoue";
  return "attente";
}

export const EN_BASE: Record<EtatPaiement, string> = {
  attente: "pending",
  paye: "paid",
  rembourse: "refunded",
  echoue: "failed",
};

/**
 * Combien de temps la session de paiement reste ouverte.
 *
 * Trente minutes : assez pour saisir une carte et passer une authentification
 * bancaire, assez peu pour qu'un abandon ne bloque pas le créneau toute la journée.
 * C'est aussi le minimum que Stripe accepte pour une session.
 */
export const PAIEMENT_OUVERT_MINUTES = 30;

/**
 * Combien de temps une réservation impayée tient son créneau.
 *
 * Volontairement plus long que la session de paiement, et c'est tout l'intérêt du
 * chiffre : la session meurt donc toujours avant que le créneau soit rendu. Si les
 * deux délais tombaient ensemble, un paiement pourrait aboutir dans la seconde qui
 * suit la libération du créneau - le client aurait payé un horaire attribué à
 * quelqu'un d'autre, et il faudrait le rembourser en s'excusant.
 *
 * Le sens de la marge compte : un créneau tenu cinq minutes de trop ne coûte qu'une
 * attente, l'inverse coûte un double rendez-vous.
 */
export const RESERVATION_TENUE_MINUTES = PAIEMENT_OUVERT_MINUTES + 5;

export interface ReservationEnAttente {
  etatPaiement: EtatPaiement;
  creeLe: Date;
}

/**
 * Cette réservation a-t-elle cessé de tenir son créneau ?
 *
 * Seule une réservation en attente expire. Une consultation payée tient son créneau
 * sans limite, et une annulée ne le tient plus du tout.
 */
export function reservationExpiree(
  reservation: ReservationEnAttente,
  maintenant: Date = new Date()
): boolean {
  if (reservation.etatPaiement !== "attente") return false;

  const tenueMs = RESERVATION_TENUE_MINUTES * 60_000;
  return maintenant.getTime() - reservation.creeLe.getTime() >= tenueMs;
}

/* ---------- Le remboursement ---------- */

/**
 * Le délai annoncé au client, dans le panneau de détail : « annulez jusqu'à 24 h
 * avant, la consultation vous est remboursée ». Le chiffre vit ici pour que la
 * phrase affichée et la décision de rembourser ne puissent pas diverger.
 */
export const DELAI_REMBOURSEMENT_HEURES = 24;

/**
 * L'annulation ouvre-t-elle droit au remboursement automatique ?
 *
 * Au-delà du délai, l'avocat a réservé son temps et l'annulation reste possible mais
 * n'est pas remboursée d'office. L'interface le dit avant d'annuler, plutôt que de
 * promettre un remboursement qui n'arriverait pas.
 */
export function remboursementAutomatique(debut: Date, maintenant: Date = new Date()): boolean {
  const restantMs = debut.getTime() - maintenant.getTime();
  return restantMs >= DELAI_REMBOURSEMENT_HEURES * 3_600_000;
}

/** Un paiement ne se rembourse que s'il a été encaissé. */
export function remboursable(etat: EtatPaiement): boolean {
  return etat === "paye";
}
