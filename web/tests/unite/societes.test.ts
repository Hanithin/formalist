import { describe, it, expect } from "vitest";
import {
  etatDeLaSociete,
  libelleDuPortefeuille,
  nomDeLaSociete,
  regrouperEnSocietes,
  type DossierDeSociete,
} from "@/domain/societe/portefeuille";
import { dateEtHeure } from "@/domain/formalite/journal";

/**
 * Le portefeuille de sociétés.
 *
 * Il n'existe pas en base : il se reconstitue à partir des dossiers. Tout se joue donc
 * sur le regroupement - deux dossiers de la même société doivent se rejoindre, et deux
 * sociétés distinctes ne jamais se confondre.
 */

function dossier(sur: Partial<DossierDeSociete> = {}): DossierDeSociete {
  return {
    id: 1,
    type: "creation",
    societe: "ATELIER MARCHAND",
    forme: "SAS",
    siren: null,
    status: "en_cours",
    offre: "business",
    etapeAffichee: 1,
    majLe: new Date("2026-08-01T10:00:00Z"),
    ...sur,
  };
}

describe("regrouper les dossiers en sociétés", () => {
  it("rassemble sous un même SIREN, quel que soit le libellé du dossier", () => {
    /*
     * Les parcours suffixent le libellé pour distinguer leurs dossiers : « - clôture »,
     * « - exercice 2025 ». Le suffixe dit la formalité, non la société.
     */
    const societes = regrouperEnSocietes([
      dossier({ id: 1, siren: "552100554", societe: "ATELIER MARCHAND - dissolution" }),
      dossier({ id: 2, siren: "552 100 554", societe: "ATELIER MARCHAND", type: "comptes" }),
    ]);

    expect(societes).toHaveLength(1);
    expect(societes[0].cle).toBe("552100554");
    expect(societes[0].denomination).toBe("ATELIER MARCHAND");
    expect(societes[0].dossiers).toHaveLength(2);
  });

  it("se rabat sur le nom quand le SIREN n'existe pas encore", () => {
    // Pendant une création, la société n'a pas de SIREN : deux dossiers du même nom
    // sont bien le même projet.
    const societes = regrouperEnSocietes([
      dossier({ id: 1, societe: "Studio Kern" }),
      dossier({ id: 2, societe: "STUDIO KERN", type: "modification" }),
    ]);

    expect(societes).toHaveLength(1);
    expect(societes[0].siren).toBeNull();
  });

  it("ne confond pas deux sociétés distinctes", () => {
    const societes = regrouperEnSocietes([
      dossier({ id: 1, siren: "552100554", societe: "ALPHA" }),
      dossier({ id: 2, siren: "902345678", societe: "BETA" }),
    ]);

    expect(societes).toHaveLength(2);
  });

  it("retient le renseignement le plus récent", () => {
    /*
     * Une société change de nom et de forme. Le dossier le plus récent dit ce qu'elle
     * est aujourd'hui ; l'ancien, ce qu'elle était.
     */
    const societes = regrouperEnSocietes([
      dossier({
        id: 1,
        siren: "552100554",
        societe: "ANCIEN NOM",
        forme: "SARL",
        majLe: new Date("2025-01-01T00:00:00Z"),
      }),
      dossier({
        id: 2,
        siren: "552100554",
        societe: "NOUVEAU NOM",
        forme: "SAS",
        majLe: new Date("2026-06-01T00:00:00Z"),
      }),
    ]);

    expect(societes[0].denomination).toBe("NOUVEAU NOM");
    expect(societes[0].forme).toBe("SAS");
    // Et le plus récent est en tête de ses dossiers.
    expect(societes[0].dossiers[0].id).toBe(2);
  });

  it("compte ce qui est en cours, non ce qui est fini", () => {
    const societes = regrouperEnSocietes([
      dossier({ id: 1, siren: "552100554", status: "terminee" }),
      dossier({ id: 2, siren: "552100554", status: "en_cours" }),
      dossier({ id: 3, siren: "552100554", status: "archive" }),
    ]);

    expect(societes[0].dossiers).toHaveLength(3);
    expect(societes[0].enCours).toBe(1);
  });

  it("écarte les dossiers sans nom", () => {
    expect(regrouperEnSocietes([dossier({ societe: "" })])).toEqual([]);
  });

  it("range les sociétés de la plus récemment touchée à la plus ancienne", () => {
    const societes = regrouperEnSocietes([
      dossier({ id: 1, siren: "111111111", majLe: new Date("2025-01-01T00:00:00Z") }),
      dossier({ id: 2, siren: "222222222", majLe: new Date("2026-08-01T00:00:00Z") }),
    ]);

    expect(societes.map((s) => s.cle)).toEqual(["222222222", "111111111"]);
  });
});

describe("le nom d'une société", () => {
  it("se lit sans le suffixe que le dossier lui ajoute", () => {
    expect(nomDeLaSociete("ATELIER MARCHAND - dissolution")).toBe("ATELIER MARCHAND");
    expect(nomDeLaSociete("ATELIER MARCHAND")).toBe("ATELIER MARCHAND");
  });
});

describe("l'état d'une société", () => {
  const societeDe = (dossiers: DossierDeSociete[]) => regrouperEnSocietes(dossiers)[0];

  it("est en création tant que sa création n'est pas finie", () => {
    expect(etatDeLaSociete(societeDe([dossier({ type: "creation" })])).etat).toBe("en-creation");
  });

  it("est active une fois créée, et pendant ses autres formalités", () => {
    const active = societeDe([
      dossier({ id: 1, siren: "552100554", type: "creation", status: "terminee" }),
      dossier({ id: 2, siren: "552100554", type: "modification", status: "en_cours" }),
    ]);
    expect(etatDeLaSociete(active).etat).toBe("active");
  });

  it("est en fermeture dès qu'une fermeture est ouverte", () => {
    const sortante = societeDe([
      dossier({ id: 1, siren: "552100554", type: "creation", status: "terminee" }),
      dossier({ id: 2, siren: "552100554", type: "fermeture", status: "en_cours" }),
    ]);
    expect(etatDeLaSociete(sortante).etat).toBe("en-fermeture");
  });

  it("est radiée quand sa fermeture est terminée", () => {
    /*
     * Une fermeture terminée l'emporte sur tout le reste : la société n'existe plus,
     * quels que soient les dossiers qui traînent encore.
     */
    const radiee = societeDe([
      dossier({ id: 1, siren: "552100554", type: "fermeture", status: "terminee" }),
      dossier({ id: 2, siren: "552100554", type: "modification", status: "en_cours" }),
    ]);
    expect(etatDeLaSociete(radiee).etat).toBe("radiee");
  });
});

describe("l'intitulé du portefeuille", () => {
  it("se met au singulier pour une seule société", () => {
    expect(libelleDuPortefeuille(1)).toBe("Ma société");
    expect(libelleDuPortefeuille(0)).toBe("Mes sociétés");
    expect(libelleDuPortefeuille(4)).toBe("Mes sociétés");
  });
});

describe("l'historique porte l'heure", () => {
  /*
   * Dans un fil d'activité, « 16 août » suffit. Dans l'historique d'une société, on
   * cherche l'ordre des événements d'une même journée : deux lignes datées du même jour
   * ne disaient pas laquelle est venue avant l'autre.
   */
  const maintenant = new Date("2026-08-23T12:00:00Z");

  it("au-delà de la veille, la date reçoit son heure", () => {
    expect(dateEtHeure(new Date("2026-08-16T06:43:00Z"), maintenant)).toMatch(
      /^16 août à \d{2}h\d{2}$/
    );
  });

  it("hier garde son mot, et gagne l'heure", () => {
    expect(dateEtHeure(new Date("2026-08-22T06:43:00Z"), maintenant)).toMatch(
      /^hier à \d{2}h\d{2}$/
    );
  });

  it("en deçà d'une journée, le relatif se suffit", () => {
    // « il y a 30 min à 11h30 » n'apprendrait rien de plus.
    expect(dateEtHeure(new Date("2026-08-23T11:30:00Z"), maintenant)).toBe("il y a 30 min");
    expect(dateEtHeure(new Date("2026-08-23T06:00:00Z"), maintenant)).toBe("il y a 6 h");
  });
});
