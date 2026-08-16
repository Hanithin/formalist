import { describe, it, expect } from "vitest";
import {
  cadreCouvrant,
  nonConfirmes,
  suivreLesChangements,
} from "@/domain/modification/suivi";
import { reperage, recherchesPour, retouchesProposees, situerToutes } from "@/domain/modification/edition";
import type { Mot, Retouche, Zone } from "@/domain/modification/edition";

/**
 * Le suivi de l'avocat.
 *
 * Le panneau comptait des cadres : « 2 sur 2 remplacements posés » s'affichait à côté
 * d'une durée qui n'était pas faite et d'une dénomination couverte à un endroit sur
 * quatorze.
 */

const mot = (texte: string, page: number, y: number, x = 60): Mot => ({
  page,
  texte,
  x,
  y,
  largeur: texte.length * 6,
  hauteur: 11,
});

/** Des statuts qui nomment la société sur trois pages, comme tout acte réel. */
function statuts(): Mot[] {
  return [
    ...["FIFTEEN", "HOLDING"].map((t, i) => mot(t, 1, 100, 60 + i * 60)),
    ...["La", "société", "FIFTEEN", "HOLDING", "est", "constituée"].map((t, i) =>
      mot(t, 2, 200, 60 + i * 50)
    ),
    ...["durée", "de", "99", "années"].map((t, i) => mot(t, 2, 300, 60 + i * 40)),
    ...["Pour", "FIFTEEN", "HOLDING"].map((t, i) => mot(t, 3, 700, 60 + i * 50)),
  ];
}

const recherches = recherchesPour(
  ["denomination", "prorogation"],
  {
    nouvelleDenomination: "NEW NEW",
    dureeActuelle: "99",
    nouvelleDuree: "50",
  },
  { denomination: "FIFTEEN HOLDING" }
);

describe("toutes les occurrences, non la première", () => {
  it("une dénomination est repérée partout où elle figure", () => {
    /*
     * N'en couvrir qu'une laissait l'ancien nom partout ailleurs, dans un document qui
     * part au greffe, pendant que l'écran annonçait « posé ».
     */
    expect(situerToutes(statuts(), "FIFTEEN HOLDING")).toHaveLength(3);

    const { zones } = reperage(statuts(), recherches);
    const nom = zones.filter((z) => z.cle === "denomination");
    expect(nom).toHaveLength(3);
    expect(nom.map((z) => z.occurrence)).toEqual([1, 2, 3]);
    expect(nom.map((z) => z.rectangles[0].page)).toEqual([1, 2, 3]);
  });

  it("les occurrences ne se chevauchent pas", () => {
    // « ans ans ans » rendrait sinon des passages qui se recouvrent, et deux cadres
    // se poseraient l'un sur l'autre.
    const repetition = ["ans", "ans", "ans", "ans"].map((t, i) => mot(t, 1, 100, 60 + i * 30));
    expect(situerToutes(repetition, "ans ans")).toHaveLength(2);
  });

  it("le nombre seul ne sert plus de repli pour une durée", () => {
    /*
     * « 99 » concordait avec n'importe quel nombre du document - un numéro d'article,
     * un montant - et poserait des rectangles blancs sur des clauses étrangères.
     */
    const duree = recherches.find((r) => r.cle === "prorogation")!;
    expect(duree.variantes).not.toContain("99");
  });
});

describe("l'avancement se compte par changement", () => {
  const { zones, introuvables } = reperage(statuts(), recherches);
  const proposees = retouchesProposees(zones);

  it("chaque cadre proposé sait à quel changement il sert", () => {
    // Sans cette clé, le panneau rattachait un cadre à son changement en comparant les
    // textes : la correspondance cassait au premier mot écrit.
    expect(proposees.every((r) => !!r.cle)).toBe(true);
    expect(proposees.filter((r) => r.cle === "denomination")).toHaveLength(3);
  });

  it("compte les emplacements, non les cadres", () => {
    const suivi = suivreLesChangements(zones, introuvables, proposees);
    const nom = suivi.find((c) => c.cle === "denomination")!;

    expect(nom.titre).toBe("Dénomination");
    expect(nom.ancien).toBe("FIFTEEN HOLDING");
    expect(nom.nouveau).toBe("NEW NEW");
    expect(nom.emplacements).toHaveLength(3);
    expect(nom.couverts).toBe(3);
    expect(nom.etat).toBe("couvert");
  });

  it("un cadre supprimé fait retomber le changement en cours", () => {
    /*
     * C'est le cas qui trompait : on supprime un cadre posé au mauvais endroit, on le
     * repose ailleurs, et un emplacement reste découvert sans que rien ne le dise.
     */
    const amputees = proposees.filter((r) => r.page !== 3);
    const suivi = suivreLesChangements(zones, introuvables, amputees);
    const nom = suivi.find((c) => c.cle === "denomination")!;

    expect(nom.couverts).toBe(2);
    expect(nom.etat).toBe("partiel");
    expect(nom.emplacements.filter((e) => !e.couvert).map((e) => e.page)).toEqual([3]);
  });

  it("un cadre déplacé de quelques points couvre toujours", () => {
    // Exiger le recouvrement exact ferait refaire un emplacement déjà traité.
    const decalees: Retouche[] = proposees.map((r) => ({ ...r, y: r.y + 2 }));
    const suivi = suivreLesChangements(zones, introuvables, decalees);
    expect(suivi.find((c) => c.cle === "denomination")!.couverts).toBe(3);
  });

  it("la coche est celle de l'avocat, pas de la machine", () => {
    /*
     * Cocher tout seul dès que les cadres sont posés donnerait une assurance fausse :
     * le repérage peut manquer une occurrence écrite autrement.
     */
    const couvert = suivreLesChangements(zones, introuvables, proposees);
    expect(couvert.find((c) => c.cle === "denomination")!.confirme).toBe(false);
    expect(nonConfirmes(couvert)).toHaveLength(couvert.length);

    const confirme = suivreLesChangements(zones, introuvables, proposees, ["denomination"]);
    expect(confirme.find((c) => c.cle === "denomination")!.etat).toBe("confirme");
    expect(nonConfirmes(confirme).map((c) => c.cle)).toEqual(["prorogation"]);
  });

  it("un changement introuvable se distingue d'un changement non couvert", () => {
    const introuvable = suivreLesChangements([] as Zone[], introuvables, []);
    for (const changement of introuvable) {
      expect(changement.situe).toBe(false);
      expect(changement.etat).toBe("a_placer");
    }
  });

  it("le cadre qui couvre un emplacement se retrouve par son rang", () => {
    const suivi = suivreLesChangements(zones, introuvables, proposees);
    const troisieme = suivi.find((c) => c.cle === "denomination")!.emplacements[2];

    const rang = cadreCouvrant(proposees, troisieme);
    expect(rang).toBeGreaterThanOrEqual(0);
    expect(proposees[rang].page).toBe(3);
  });
});
