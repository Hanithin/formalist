import { describe, it, expect } from "vitest";
import { natureDuDepot, retenuDAvance } from "@/domain/modification/nature-accord";

/**
 * Reconnaître ce qu'on vient de déposer.
 *
 * Le dépôt acceptait tout PDF et n'en disait rien : un relevé bancaire entrait dans la
 * liste des accords avec ses quatre champs vides, exactement comme un contrat qu'on
 * n'avait pas su lire. Rien ne distinguait « je n'ai pas réussi à lire ce contrat » de
 * « ceci n'est pas un contrat », et c'est pourtant la différence entre une saisie à
 * faire à la main et un fichier à retirer.
 */

/* Des extraits réels des deux gabarits, avec leurs défauts. */
const ANGLAIS = `FAST INVESTMENT AGREEMENT (BSA AIR)
LEND ONCHAIN, a simplified joint-stock company with a share capital of 1,000 euros,
registered under number 940 577 380, represented by its President, hereinafter referred
to as the "Company". AND: FINANCIERE BM 26, hereinafter referred to as the "AIR Investor".
The AIR Investor has expressed interest in investing a total amount of €15 000 euros
through the subscription of a BSA AIR issued by the Company. Post-money Valuation: means
the valuation of the Company after taking into account the total amount raised under this
fundraising, contractually set at 3,500,000 euros. In Paris, on 10/09/2025`;

const FRANCAIS = `ENTRE LES SOUSSIGNÉS : La société LEND ONCHAIN, Société par actions
simplifiée au capital de mille euros (1.000 €), ci-après désignée la « Société ». ET : La
société SFDI, Société à responsabilité limitée, ci-après désignée l'« Investisseur ».
L'Investisseur s'est déclaré désireux de participer à l'Opération de Levée de Fonds par la
souscription d'un BSA AIR pour un montant total de cent mille euros (100.000 €). Les
parties sont convenues que la valorisation post-money de la Société, aux fins du calcul du
nombre d'actions, serait fixée à deux millions d'euros (2.000.000 €).`;

describe("la reconnaissance d'un accord BSA AIR", () => {
  it("reconnaît le gabarit anglais", () => {
    const vu = natureDuDepot(ANGLAIS);
    expect(vu.nature).toBe("air");
    expect(vu.indices.length).toBeGreaterThan(0);
  });

  it("reconnaît le gabarit français", () => {
    expect(natureDuDepot(FRANCAIS).nature).toBe("air");
  });

  it("dit sur quoi elle s'appuie", () => {
    /* Un verdict sans motif ne se discute pas : celui qui voit « Sans rapport » sur un
       contrat qu'il sait être un accord doit pouvoir comprendre d'où vient l'erreur. */
    expect(natureDuDepot(ANGLAIS).indices).toContain("la mention « BSA AIR »");
  });
});

describe("les documents qui parlent d'investissement sans être des AIR", () => {
  it("situe un bulletin de souscription sans l'identifier", () => {
    /*
     * Ce n'est pas le gabarit que la lecture sait dépouiller, mais le document a sa
     * place au dossier : crier au fichier égaré ferait retirer un contrat légitime.
     */
    const vu = natureDuDepot(
      "BULLETIN DE SOUSCRIPTION. Le soussigné déclare souscrire à l'augmentation de capital " +
        "de la société décidée par l'assemblée générale extraordinaire, pour un montant de " +
        "cinquante mille euros, et verser ce montant au compte de la société ouvert à cet effet."
    );
    expect(vu.nature).toBe("autre_accord");
  });

  it("situe des obligations convertibles", () => {
    const vu = natureDuDepot(
      "CONTRAT D'ÉMISSION D'OBLIGATIONS CONVERTIBLES EN ACTIONS. La société émet au profit " +
        "du souscripteur des obligations convertibles d'une valeur nominale de mille euros " +
        "chacune, remboursables ou convertibles au gré du porteur dans les conditions ci-après."
    );
    expect(vu.nature).toBe("autre_accord");
  });
});

describe("les fichiers qui n'ont rien à voir", () => {
  it("nomme ce qu'il croit reconnaître", () => {
    /* « Sans rapport » est un verdict pauvre : nommer le document fait comprendre
       l'erreur en une seconde - on s'est trompé de fichier dans le sélecteur. */
    const vu = natureDuDepot(
      "EXTRAIT KBIS. Greffe du Tribunal de commerce de Paris. Immatriculation au RCS. " +
        "Dénomination sociale, forme juridique, capital social, adresse du siège social, " +
        "activité principale déclarée, date de commencement d'activité, durée de la personne morale."
    );
    expect(vu.nature).toBe("hors_sujet");
    expect(vu.libelle).toContain("extrait Kbis");
  });

  it("se contente d'une phrase générale quand il ne reconnaît rien", () => {
    const vu = natureDuDepot(
      "Compte rendu de la réunion du comité de pilotage du douze septembre. Étaient présents " +
        "les responsables des trois ateliers. L'ordre du jour portait sur le calendrier de " +
        "livraison, les congés d'été et le renouvellement du parc de machines-outils."
    );
    expect(vu.nature).toBe("hors_sujet");
    expect(vu.libelle).toBe("Ce document ne ressemble pas à un accord");
  });
});

describe("un document sans couche texte", () => {
  it("se dit illisible, non hors sujet", () => {
    /*
     * On ne dit pas d'un PDF numérisé qu'il est hors sujet : on n'en sait rien. La
     * distinction porte : l'un demande une saisie à la main, l'autre un retrait.
     */
    expect(natureDuDepot("").nature).toBe("illisible");
    expect(natureDuDepot(null).nature).toBe("illisible");
    expect(natureDuDepot("   \n  \n ").nature).toBe("illisible");
  });

  it("tient quelques mots pour une lecture manquée", () => {
    /* Une page numérisée rend parfois trois mots de tampon : trop peu pour conclure
       quoi que ce soit du document. */
    expect(natureDuDepot("Bon pour accord").nature).toBe("illisible");
  });
});

describe("ce qui est retenu d'avance", () => {
  it("coche un accord reconnu et un document illisible", () => {
    /* Un contrat numérisé reste un contrat : le décocher ajouterait un geste à chaque
       dépôt pour un cas fréquent et parfaitement légitime. */
    expect(retenuDAvance("air")).toBe(true);
    expect(retenuDAvance("autre_accord")).toBe(true);
    expect(retenuDAvance("illisible")).toBe(true);
  });

  it("décoche ce qui ne ressemble pas à un accord, sans le refuser", () => {
    /* La reconnaissance peut se tromper sur un gabarit qu'on n'a jamais vu : bloquer
       arrêterait un dossier légitime, décocher demande seulement un geste conscient. */
    expect(retenuDAvance("hors_sujet")).toBe(false);
  });
});
