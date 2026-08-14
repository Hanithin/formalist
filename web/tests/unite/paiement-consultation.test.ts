import { describe, it, expect } from "vitest";
import {
  etatPaiement,
  EN_BASE,
  reservationExpiree,
  RESERVATION_TENUE_MINUTES,
  remboursementAutomatique,
  remboursable,
  DELAI_REMBOURSEMENT_HEURES,
} from "@/domain/consultation/paiement";

const maintenant = new Date("2026-08-14T12:00:00Z");
const minutesAvant = (n: number) => new Date(maintenant.getTime() - n * 60_000);

describe("l'état d'un paiement", () => {
  it("traduit les valeurs stockées", () => {
    expect(etatPaiement("paid")).toBe("paye");
    expect(etatPaiement("refunded")).toBe("rembourse");
    expect(etatPaiement("failed")).toBe("echoue");
    expect(etatPaiement("pending")).toBe("attente");
  });

  it("une valeur absente ou inconnue vaut « en attente »", () => {
    // Un paiement dont on ne sait rien n'est pas un paiement reçu.
    expect(etatPaiement(null)).toBe("attente");
    expect(etatPaiement(undefined)).toBe("attente");
    expect(etatPaiement("n-importe-quoi")).toBe("attente");
  });

  it("le retour en base est réversible", () => {
    for (const [etat, brut] of Object.entries(EN_BASE)) {
      expect(etatPaiement(brut)).toBe(etat);
    }
  });
});

describe("le créneau tenu par une réservation impayée", () => {
  it("est tenu pendant le temps du paiement", () => {
    expect(
      reservationExpiree({ etatPaiement: "attente", creeLe: minutesAvant(5) }, maintenant)
    ).toBe(false);
  });

  it("est rendu passé le délai", () => {
    expect(
      reservationExpiree(
        { etatPaiement: "attente", creeLe: minutesAvant(RESERVATION_TENUE_MINUTES + 1) },
        maintenant
      )
    ).toBe(true);
  });

  it("une consultation payée tient son créneau sans limite", () => {
    /*
     * Le délai ne vise que les paniers abandonnés. Une consultation payée réservée
     * il y a trois semaines doit rester réservée.
     */
    expect(
      reservationExpiree({ etatPaiement: "paye", creeLe: minutesAvant(30_000) }, maintenant)
    ).toBe(false);
  });

  it("un paiement refusé ne tient pas le créneau au-delà, mais n'est pas non plus rendu deux fois", () => {
    // Refusé : la ligne est annulée par le webhook, elle ne relève plus du délai.
    expect(
      reservationExpiree({ etatPaiement: "echoue", creeLe: minutesAvant(120) }, maintenant)
    ).toBe(false);
  });
});

describe("le remboursement d'une annulation", () => {
  const dans = (heures: number) => new Date(maintenant.getTime() + heures * 3_600_000);

  it("est automatique au-delà du délai annoncé", () => {
    expect(remboursementAutomatique(dans(DELAI_REMBOURSEMENT_HEURES + 1), maintenant)).toBe(true);
    expect(remboursementAutomatique(dans(72), maintenant)).toBe(true);
  });

  it("ne l'est plus en deçà", () => {
    expect(remboursementAutomatique(dans(23), maintenant)).toBe(false);
    expect(remboursementAutomatique(dans(1), maintenant)).toBe(false);
  });

  it("le délai exact ouvre encore droit au remboursement", () => {
    // « jusqu'à 24 h avant » inclut la 24e heure : la limite profite au client.
    expect(remboursementAutomatique(dans(DELAI_REMBOURSEMENT_HEURES), maintenant)).toBe(true);
  });

  it("un rendez-vous passé n'y ouvre pas droit", () => {
    expect(remboursementAutomatique(dans(-2), maintenant)).toBe(false);
  });

  it("seul un paiement encaissé se rembourse", () => {
    expect(remboursable("paye")).toBe(true);
    expect(remboursable("attente")).toBe(false);
    expect(remboursable("rembourse")).toBe(false);
    expect(remboursable("echoue")).toBe(false);
  });
});
