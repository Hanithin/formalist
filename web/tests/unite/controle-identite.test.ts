import { describe, it, expect } from "vitest";
import {
  lireLaMrz,
  validiteDeLaPiece,
  controler,
  estUnePieceDIdentite,
  lireLeControle,
  lesMesuresSuffisentARefuser,
  enPieceDeposee,
  type LectureDeLaPiece,
  type MesuresDeLaPiece,
} from "@/domain/formalite/controle-identite";

/*
 * Les zones lisibles par machine sont de vraies zones, aux clés calculées.
 *
 * Elles ne sont pas recopiées d'un document réel - on ne met pas la carte de quelqu'un
 * dans un dépôt de code - mais composées selon la disposition de l'OACI, avec leurs
 * clés de contrôle justes. C'est ce qui compte ici : ce qu'on éprouve est que le calcul
 * accepte une zone valable et rejette une zone abîmée.
 */

/** Passeport, expire le 18 avril 2031, né le 12 juin 1985. */
const PASSEPORT = [
  "P<FRADUPONT<<MARIE<CLAIRE<<<<<<<<<<<<<<<<<<<",
  "12AA345676FRA8506128F3104183<<<<<<<<<<<<<<02",
];

/** Carte d'identité au format actuel, expire le 2 septembre 2031, né le 14 mars 1990. */
const CARTE = [
  "IDFRAD1X9F2A812<<<<<<<<<<<<<<<",
  "9003141M3109029FRA<<<<<<<<<<<8",
  "MARTIN<<PAUL<<<<<<<<<<<<<<<<<<",
];

/** La même, périmée le 5 janvier 2019. */
const CARTE_PERIMEE = [
  "IDFRAD1X9F2A812<<<<<<<<<<<<<<<",
  "9003141M1901056FRA<<<<<<<<<<<0",
  "MARTIN<<PAUL<<<<<<<<<<<<<<<<<<",
];

/** Ancienne carte française : sa zone lisible ne porte pas de date de validité. */
const CARTE_ANCIENNE = [
  "IDFRA" + "MARTIN".padEnd(31, "<"),
  "940175912345".padEnd(13, "<") + "PAUL".padEnd(23, "<"),
];

const LE_JOUR = new Date("2026-09-14T10:00:00Z");

function lecture(surcharge: Partial<LectureDeLaPiece> = {}): LectureDeLaPiece {
  return {
    estUnePieceDIdentite: true,
    type: "cni",
    mrz: null,
    finDeValidite: null,
    delivreeLe: null,
    nom: null,
    prenoms: null,
    bordsCoupes: false,
    champsIllisibles: [],
    refletOuOmbre: false,
    ...surcharge,
  };
}

function mesures(surcharge: Partial<MesuresDeLaPiece> = {}): MesuresDeLaPiece {
  return {
    cote: 2000,
    nettete: 30,
    luminance: 140,
    contraste: 50,
    octets: 900_000,
    ...surcharge,
  };
}

function codes(constats: { code: string }[]): string[] {
  return constats.map((c) => c.code);
}

describe("la zone lisible par machine", () => {
  it("lit la validité d'un passeport", () => {
    const mrz = lireLaMrz(PASSEPORT);
    expect(mrz?.format).toBe("TD3");
    expect(mrz?.finDeValidite).toBe("2031-04-18");
    expect(mrz?.naissance).toBe("1985-06-12");
    expect(mrz?.verifiee).toBe(true);
  });

  it("lit la validité d'une carte d'identité au format actuel", () => {
    const mrz = lireLaMrz(CARTE);
    expect(mrz?.format).toBe("TD1");
    expect(mrz?.finDeValidite).toBe("2031-09-02");
    expect(mrz?.naissance).toBe("1990-03-14");
  });

  it("rend la date à null quand la clé de contrôle ne tombe pas", () => {
    /*
     * C'est tout l'intérêt de la clé : une transcription fautive se détecte au lieu de
     * se croire. Un chiffre changé dans la date, et la lecture se tait plutôt que de
     * faire périmer une carte valable - ou l'inverse.
     */
    const abimee = [CARTE[0], CARTE[1].replace("3109029", "3109039"), CARTE[2]];
    const mrz = lireLaMrz(abimee);
    expect(mrz?.format).toBe("TD1");
    expect(mrz?.finDeValidite).toBeNull();
    expect(mrz?.verifiee).toBe(false);
  });

  it("reconnaît l'ancienne carte française sans lui inventer de validité", () => {
    /*
     * Sa disposition nationale ne porte pas de date de fin de validité : elle se déduit
     * de la délivrance. Rendre null ici n'est pas un demi-échec, c'est le bon résultat.
     */
    const ancienne = [
      "IDFRA".padEnd(5) + "DUPONT".padEnd(31, "<"),
      "940175912345".padEnd(13, "<") + "MARIE".padEnd(23, "<"),
    ];
    expect(ancienne.every((l) => l.length === 36)).toBe(true);
    const mrz = lireLaMrz(ancienne);
    expect(mrz?.format).toBe("CNI_FR_ANCIENNE");
    expect(mrz?.finDeValidite).toBeNull();
  });

  it("ne rend rien d'une zone absente ou d'une longueur inattendue", () => {
    expect(lireLaMrz(null)).toBeNull();
    expect(lireLaMrz([])).toBeNull();
    expect(lireLaMrz(["IDFRA", "TROP<COURT"])).toBeNull();
  });

  it("supporte les espaces et les chevrons mal transcrits", () => {
    const mrz = lireLaMrz([" " + CARTE[0] + " ", CARTE[1], CARTE[2].replace("<", "«")]);
    expect(mrz?.finDeValidite).toBe("2031-09-02");
  });
});

describe("la prorogation des cartes d'identité", () => {
  it("prolonge de cinq ans une carte de majeur délivrée entre 2004 et 2013", () => {
    /*
     * La carte porte dix ans, elle en vaut quinze, et rien ne le dit dessus. Refuser sur
     * la date imprimée renverrait le client refaire une carte dont il n'a pas besoin.
     */
    const validite = validiteDeLaPiece("2022-06-30", {
      type: "cni",
      naissance: "1980-01-01",
      maintenant: LE_JOUR,
    });
    expect(validite.prorogee).toBe(true);
    expect(validite.fin).toBe("2027-06-30");
    expect(validite.perimee).toBe(false);
  });

  it("ne proroge pas un passeport", () => {
    const validite = validiteDeLaPiece("2021-06-30", { type: "passeport", maintenant: LE_JOUR });
    expect(validite.prorogee).toBe(false);
    expect(validite.perimee).toBe(true);
  });

  it("ne proroge pas une carte délivrée à un mineur", () => {
    const validite = validiteDeLaPiece("2021-06-30", {
      type: "cni",
      naissance: "2005-05-01",
      maintenant: LE_JOUR,
    });
    expect(validite.prorogee).toBe(false);
    expect(validite.perimee).toBe(true);
  });

  it("ne proroge pas une carte délivrée hors de la fenêtre", () => {
    /* Délivrée en 2016 : la prorogation ne concerne que 2004 à 2013. */
    const validite = validiteDeLaPiece("2026-03-01", { type: "cni", maintenant: LE_JOUR });
    expect(validite.prorogee).toBe(false);
  });

  it("périme quand même une carte prorogée dont les quinze ans sont passés", () => {
    const validite = validiteDeLaPiece("2015-02-01", { type: "cni", maintenant: LE_JOUR });
    expect(validite.prorogee).toBe(true);
    expect(validite.fin).toBe("2020-02-01");
    expect(validite.perimee).toBe(true);
  });

  it("signale une échéance proche sans la tenir pour passée", () => {
    const validite = validiteDeLaPiece("2026-10-20", { type: "passeport", maintenant: LE_JOUR });
    expect(validite.perimee).toBe(false);
    expect(validite.proche).toBe(true);
  });
});

describe("le verdict", () => {
  it("accepte une pièce nette et valable, sans rien dire", () => {
    const controle = controler({
      lecture: lecture({ mrz: CARTE, nom: "MARTIN" }),
      mesures: mesures(),
      nomAttendu: "Martin",
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("acceptee");
    expect(controle.constats).toEqual([]);
    expect(controle.finDeValidite).toBe("2031-09-02");
  });

  it("refuse une pièce périmée, en disant depuis quand", () => {
    const controle = controler({
      lecture: lecture({ mrz: CARTE_PERIMEE }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("refusee");
    expect(codes(controle.constats)).toContain("perimee");
    /*
     * La date annoncée est celle qui fait foi, non celle qui est imprimée : cette carte
     * porte le 5 janvier 2019, donc une délivrance de 2009, donc la prorogation - qui
     * la mène au 5 janvier 2024, passé lui aussi. Annoncer la date imprimée ferait
     * discuter le client sur cinq ans qu'on lui a déjà comptés.
     */
    expect(controle.resume).toContain("5 janvier 2024");
  });

  it("laisse passer une carte prorogée, avec la réserve qui l'explique", () => {
    const controle = controler({
      lecture: lecture({
        mrz: CARTE_ANCIENNE,
        finDeValidite: "2022-06-30",
        delivreeLe: "2012-07-01",
      }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("reserve");
    expect(controle.prorogee).toBe(true);
    expect(codes(controle.constats)).toEqual(["prorogee"]);
  });

  it("refuse ce qui n'est pas une pièce d'identité", () => {
    const controle = controler({
      lecture: lecture({ estUnePieceDIdentite: false, type: null }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("refusee");
    expect(codes(controle.constats)).toContain("pas-une-piece");
  });

  it("refuse un document rogné ou dont des mentions ne se lisent pas", () => {
    const rognee = controler({
      lecture: lecture({ mrz: CARTE, bordsCoupes: true }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(rognee.gravite).toBe("refusee");

    const illisible = controler({
      lecture: lecture({ mrz: CARTE, champsIllisibles: ["date de validité"] }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(illisible.gravite).toBe("refusee");
    expect(illisible.resume).toContain("date de validité");
  });

  it("refuse une image floue ou trop petite", () => {
    const floue = controler({
      lecture: lecture({ mrz: CARTE }),
      mesures: mesures({ nettete: 3 }),
      maintenant: LE_JOUR,
    });
    expect(floue.gravite).toBe("refusee");
    expect(codes(floue.constats)).toContain("flou");

    const petite = controler({
      lecture: lecture({ mrz: CARTE }),
      mesures: mesures({ cote: 600 }),
      maintenant: LE_JOUR,
    });
    expect(petite.gravite).toBe("refusee");
    expect(codes(petite.constats)).toContain("definition");
  });

  it("ne dit pas deux fois la même chose d'une image sombre", () => {
    /* Une image sous-exposée a mécaniquement peu de contraste : un seul constat. */
    const controle = controler({
      lecture: lecture({ mrz: CARTE }),
      mesures: mesures({ luminance: 40, contraste: 12 }),
      maintenant: LE_JOUR,
    });
    expect(codes(controle.constats)).toEqual(["sombre"]);
  });

  it("signale un nom qui ne correspond pas, sans bloquer", () => {
    const controle = controler({
      lecture: lecture({ mrz: CARTE, nom: "MARTIN" }),
      mesures: mesures(),
      nomAttendu: "Bertrand",
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("reserve");
    expect(codes(controle.constats)).toContain("nom-different");
  });

  it("ne s'arrête pas à une orthographe", () => {
    /*
     * Un nom composé se saisit de dix façons. Opposer une orthographe à quelqu'un
     * reviendrait à refuser sa pièce parce qu'il a écrit « Le Gall » là où sa carte
     * porte « LEGALL ».
     */
    for (const [lu, saisi] of [
      ["LEGALL", "Le Gall"],
      ["MARTIN", "martin"],
      ["DUPONT", "Marie Dupont"],
      ["CHÊNEVERT", "Chenevert"],
    ]) {
      const controle = controler({
        lecture: lecture({ mrz: CARTE, nom: lu }),
        mesures: mesures(),
        nomAttendu: saisi,
        maintenant: LE_JOUR,
      });
      expect(codes(controle.constats), lu + " / " + saisi).not.toContain("nom-different");
    }
  });

  it("ne refuse jamais faute d'avoir pu lire la pièce", () => {
    /*
     * Une panne de notre côté ne doit pas se payer d'un refus : le client redéposerait
     * indéfiniment une carte parfaite sans comprendre ce qu'on lui reproche.
     */
    const controle = controler({ lecture: null, mesures: mesures(), maintenant: LE_JOUR });
    expect(controle.gravite).toBe("acceptee");
    expect(controle.lectureIndisponible).toBe(true);
    expect(controle.resume).toContain("vérifiée par l'avocat");
  });

  it("laisse les mesures décider quand la lecture manque", () => {
    const controle = controler({
      lecture: null,
      mesures: mesures({ nettete: 2 }),
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("refusee");
    expect(controle.lectureIndisponible).toBe(true);
  });

  it("signale une validité qu'on n'a pas pu lire", () => {
    const controle = controler({
      lecture: lecture({ mrz: null, finDeValidite: null }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("reserve");
    expect(codes(controle.constats)).toContain("validite-inconnue");
  });

  it("préfère la zone lisible par machine à la date lue sur le recto", () => {
    /*
     * La zone porte ses clés de contrôle : sa date a été vérifiée par le calcul, celle
     * du recto a seulement été crue. Quand les deux divergent, c'est la première.
     */
    const controle = controler({
      lecture: lecture({ mrz: CARTE, finDeValidite: "2019-01-05" }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(controle.finDeValidite).toBe("2031-09-02");
    expect(controle.gravite).toBe("acceptee");
  });

  it("porte le motif bloquant dans son résumé, non un décompte", () => {
    const controle = controler({
      lecture: lecture({ mrz: CARTE_PERIMEE, refletOuOmbre: true }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(controle.resume).toContain("plus valable");
    expect(controle.resume).not.toContain("2 points");
  });
});

describe("ce qui protège d'une lecture douteuse", () => {
  it("reconnaît une zone transcrite à quelques remplissages près", () => {
    /*
     * Le caractère de remplissage ne porte aucune information : une transcription qui en
     * ajoute deux décrit le même document. Le modèle le fait - c'est ce qu'a rendu le
     * premier essai réel - et la date se perdait faute que la longueur tombe juste.
     */
    const mrz = lireLaMrz(CARTE.map((l) => l + "<<"));
    expect(mrz?.format).toBe("TD1");
    expect(mrz?.finDeValidite).toBe("2031-09-02");
  });

  it("ne refuse pas sur une date issue d'une transcription qui se contredit", () => {
    /*
     * Sur une carte floue, le modèle a transcrit une zone entièrement inventée, date
     * comprise. Les clés l'ont démasquée - mais la date lue sur le recto venait de la
     * même lecture. La refuser reviendrait à opposer au client une date que personne
     * n'a lue.
     */
    const inventee = [CARTE[0], CARTE[1].replace("3109029", "1901059"), CARTE[2]];
    const controle = controler({
      lecture: lecture({ mrz: inventee, finDeValidite: "2019-01-05" }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("reserve");
    expect(codes(controle.constats)).toContain("perimee");
    expect(controle.resume).toContain("incertaine");
  });

  it("refuse en revanche sur une date que les clés confirment", () => {
    const controle = controler({
      lecture: lecture({ mrz: CARTE_PERIMEE }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(controle.gravite).toBe("refusee");
  });

  it("signale une carte dont la bande du bas n'a pas été lue", () => {
    /*
     * Toute carte et tout passeport en portent une. Son absence dit qu'elle sort du
     * cadre ou ne se lit pas - et c'est la seule partie du document qui se vérifie.
     */
    const controle = controler({
      lecture: lecture({ mrz: null, finDeValidite: "2031-09-02" }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(codes(controle.constats)).toContain("zone-machine-absente");
    expect(controle.gravite).toBe("reserve");
  });

  it("ne reproche pas deux fois la même petite image", () => {
    /* Une image peu définie pèse peu : les deux constats décrivaient le même défaut. */
    const controle = controler({
      lecture: lecture({ mrz: CARTE }),
      mesures: mesures({ cote: 1100, octets: 20_000 }),
      maintenant: LE_JOUR,
    });
    expect(codes(controle.constats)).toEqual(["definition-juste"]);
  });
});

describe("ce que le contrôle couvre", () => {
  it("reconnaît les pièces d'identité de tous les parcours", () => {
    for (const piece of ["identite", "identite-recto", "identite-verso", "identite-dirigeant"]) {
      expect(estUnePieceDIdentite(piece), piece).toBe(true);
    }
    for (const autre of ["depot-capital", "domicile", "cabinet-kbis"]) {
      expect(estUnePieceDIdentite(autre), autre).toBe(false);
    }
  });
});

describe("le verdict gardé en base", () => {
  it("fait l'aller-retour", () => {
    const controle = controler({
      lecture: lecture({ mrz: CARTE_PERIMEE }),
      mesures: mesures(),
      maintenant: LE_JOUR,
    });
    expect(lireLeControle(JSON.stringify(controle))).toEqual(controle);
  });

  it("ne casse pas sur un JSON abîmé ou absent", () => {
    /* Une pièce sans verdict lisible s'affiche sans verdict ; elle ne casse pas la page. */
    expect(lireLeControle(null)).toBeNull();
    expect(lireLeControle("")).toBeNull();
    expect(lireLeControle("{pas du json")).toBeNull();
    expect(lireLeControle('{"autre":"chose"}')).toBeNull();
  });

  it("ramène une ligne de document à ce que l'écran affiche", () => {
    expect(
      enPieceDeposee({
        type: "identite",
        name: "carte.jpg",
        rejection_reason: "Cette pièce n'est plus valable",
        controle_json: null,
      })
    ).toEqual({
      type: "identite",
      nom: "carte.jpg",
      motifRejet: "Cette pièce n'est plus valable",
      controle: null,
    });

    expect(enPieceDeposee({ type: "domicile", name: "facture.pdf" })).toEqual({
      type: "domicile",
      nom: "facture.pdf",
      motifRejet: null,
      controle: null,
    });
  });
});

/**
 * Ce que les mesures suffisent à trancher, sans rien lire.
 *
 * Une image de trois cents pixels de large, ou floue à n'y distinguer aucun caractère,
 * est refusée quoi que le modèle en rapporte : l'y envoyer coûte un appel payant et
 * quelques secondes d'attente devant la carte de dépôt, pour aboutir au même refus
 * formulé moins bien - « ce document ne ressemble pas à une pièce d'identité » quand
 * le vrai motif est qu'on n'y voit rien.
 */
describe("la lecture qu'on s'épargne", () => {
  it("se passe de lire une image que les mesures refusent", () => {
    expect(lesMesuresSuffisentARefuser(mesures({ cote: 320 }))).toBe(true);
    expect(lesMesuresSuffisentARefuser(mesures({ nettete: 2 }))).toBe(true);
  });

  it("lit tout le reste, réserves comprises", () => {
    /* Une réserve ne refuse rien : la pièce peut être parfaitement valable, et c'est
       la lecture qui le dira. */
    expect(lesMesuresSuffisentARefuser(mesures())).toBe(false);
    expect(lesMesuresSuffisentARefuser(mesures({ contraste: 12 }))).toBe(false);
  });

  it("lit quand rien n'a pu être mesuré", () => {
    // Un PDF n'a pas de côté en pixels : ne pas mesurer n'est pas un motif de refus.
    expect(lesMesuresSuffisentARefuser(null)).toBe(false);
  });

  it("ne fait pas passer la lecture épargnée pour une panne", () => {
    /*
     * « La validité n'a pas pu être vérifiée » s'adresse à qui a déposé une pièce
     * peut-être parfaite pendant que le service manquait. Sur une image illisible, la
     * phrase inquiète pour rien : la validité n'a aucune importance.
     */
    const epargnee = controler({ lecture: null, mesures: mesures({ cote: 320 }), lectureInutile: true });
    expect(epargnee.gravite).toBe("refusee");
    expect(epargnee.lectureIndisponible).toBe(false);

    const panne = controler({ lecture: null, mesures: mesures() });
    expect(panne.lectureIndisponible).toBe(true);
  });
});
