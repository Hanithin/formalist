import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import {
  donneesDuTraite,
  verifierLeTraite,
  numerotationDuTraite,
  doubleRepresentation,
  fondementLegalDeLApport,
  fondementDeLaDispense,
  courDAppel,
} from "@/domain/modification/traite-apport";
import { rendreLeTraiteDApport } from "@/infrastructure/documents/modeles-cabinet";
import { verifierModification } from "@/domain/modification/verification";
import type { ContexteGabarit } from "@/domain/modification/gabarit";

/**
 * Le traité d'apport de titres, lu dans le document signé.
 *
 * Il se distingue du procès-verbal sur un point qui ne pardonne pas : il se renvoie à
 * lui-même. « les conditions suspensives prévues à l'Article {a_conditions} » est
 * écrit dans les définitions, à dix pages de l'article visé. Un article qui disparaît
 * - il n'y a pas toujours d'augmentation en numéraire, ni de double représentation -
 * décale tous les suivants, et le renvoi devient faux sans que rien ne le signale.
 *
 * On lit donc le document rendu, et l'on suit les renvois.
 */

function texteDu(docx: Buffer): string {
  return new PizZip(docx)
    .file("word/document.xml")!
    .asText()
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const BENEFICIAIRE = {
  denomination: "DURAND HOLDING",
  forme: "SAS",
  siren: "908221138",
  adresse: "10 rue de Penthièvre",
  codePostal: "75008",
  ville: "Paris",
  capital: 15500,
  villeRcs: "Paris",
};

const APPORT = {
  apporteeDenomination: "STORYFILMS",
  apporteeForme: "SAS",
  apporteeSiren: "841862907",
  apporteeSiege: "34 rue Laugier, 75017 Paris",
  apporteeRcs: "Paris",
  apporteeCapital: "5000",
  apporteeNbTitres: "500",
  apporteeNominale: "10",
  apporteeDateStatuts: "2019-03-12",
  apportNbTitres: "250",
  apportOrigineTitres: "Souscription à la constitution",
  apportNumerotation: "1 à 250",
  apportValeur: "125000",
  apportMethodeValorisation: "Actif net comptable corrigé",
  apportCommissaire: "Oui",
  apportCommissaireNom: "Monsieur Marc COMMISSAIRE",
  apportNominaleBeneficiaire: "10",
  apportNumeraire: "",
  beneficiaireObjet: "la prise de participation dans toutes sociétés et la gestion de ces participations",
  apporteurCivilite: "Monsieur",
  apporteurPrenom: "Bilal",
  apporteurNom: "KLEICHE",
  apporteurNeLe: "2003-07-09",
  apporteurNeA: "Le Chesnay-Rocquencourt (Yvelines)",
  apporteurNationalite: "Française",
  apporteurAdresse: "38 rue du Hameau, 78480 Verneuil-sur-Seine",
  apporteurQualite: "Associé unique et représentant légal",
  apportControle: "Oui",
  apportDateEffet: "2026-09-30",
  apportDateSignature: "2026-08-25",
  apportLieuSignature: "Paris",
  apportDateLimiteCondition: "2026-12-31",
};

function contexte(valeurs: Record<string, string> = {}): ContexteGabarit {
  return {
    societe: BENEFICIAIRE,
    assemblee: {
      date: "2026-08-25",
      totalParts: 1550,
      associes: [
        {
          nature: "physique",
          civilite: "Monsieur",
          prenom: "Bilal",
          nom: "KLEICHE",
          parts: 1550,
        },
      ],
    },
    codes: ["apport_titres"],
    valeurs: { ...APPORT, ...valeurs },
  } as unknown as ContexteGabarit;
}

/**
 * Tous les refus que le formulaire opposerait, d'où qu'ils viennent.
 *
 * Certains contrôles vivent dans la couche du traité, d'autres dans celle de l'apport
 * qui la précède. Le formulaire les affiche indistinctement sous la case fautive :
 * c'est donc là qu'il faut regarder, non dans l'une des deux couches.
 */
function refus(valeurs: Record<string, string> = {}) {
  const dossier = contexte(valeurs);
  return verifierModification(
    dossier.codes,
    dossier.valeurs,
    dossier.societe,
    dossier.assemblee,
    []
  );
}

function rendre(valeurs: Record<string, string> = {}): string {
  const dossier = contexte(valeurs);
  expect(verifierLeTraite(dossier).filter((a) => a.gravite === "bloquant")).toEqual([]);
  return texteDu(rendreLeTraiteDApport(donneesDuTraite(dossier)));
}

describe("la numérotation ne laisse aucun trou", () => {
  it("suit les titres et les articles présents, sans sauter de numéro", () => {
    const texte = rendre();

    const titres = [...texte.matchAll(/^Titre ([IVX]+)\./gm)].map((m) => m[1]);
    expect(titres).toEqual(["I", "II", "III", "IV", "V", "VI"]);

    const articles = [...texte.matchAll(/^Article (\d+)\./gm)].map((m) => Number(m[1]));
    expect(articles).toEqual(articles.map((_, rang) => rang + 1));
  });

  it("compte un titre et deux articles de plus avec une augmentation en numéraire", () => {
    const texte = rendre({ apportNumeraire: "120000" });

    expect(texte).toContain("Titre II. Augmentation de capital en numéraire");
    expect(texte).toContain("Titre III. Apport en nature des titres");

    const articles = [...texte.matchAll(/^Article (\d+)\./gm)].map((m) => Number(m[1]));
    expect(articles).toEqual(articles.map((_, rang) => rang + 1));
    expect(articles.at(-1)).toBe(26);
  });

  it("retire l'article 1161 quand une seule personne ne signe pas des deux côtés", () => {
    const seul = rendre();
    const separe = rendre({
      apporteurQualite: "Tiers entrant au capital",
      beneficiaireRepresentant: "Madame Claire MARTIN, en sa qualité de Présidente",
    });

    expect(seul).toContain("Déclaration au titre de l'article 1161 du code civil");
    expect(separe).not.toContain("article 1161");
    /* Un article de moins : tout ce qui suit remonte d'un rang. */
    expect(seul).toContain("Article 12. Conditions suspensives");
    expect(separe).toContain("Article 11. Conditions suspensives");
  });

  it("numérote les sous-articles du fiscal selon le régime retenu", () => {
    /*
     * Le report occupe les sous-articles 2 à 5 ; le sursis n'occupe que le 2. Les
     * droits d'enregistrement et la TVA suivent l'un ou l'autre : le document passait
     * de 15.2 à 15.6, sans 15.3 ni 15.4 ni 15.5.
     */
    const sursis = rendre({ apportControle: "Non" });

    expect(sursis).toContain("Sursis d'imposition (article 150-0 B du CGI)");
    expect(sursis).toMatch(/^(\d+)\.3\. Droits d'enregistrement/m);
    expect(sursis).toMatch(/^(\d+)\.4\. Taxe sur la valeur ajoutée/m);
    expect(sursis).not.toContain("Report d'imposition");
  });
});

describe("les renvois internes visent l'article qu'ils nomment", () => {
  it("renvoie aux conditions suspensives, où qu'elles se trouvent", () => {
    const cas: Record<string, string>[] = [{}, { apportNumeraire: "120000" }];
    for (const valeurs of cas) {
      const texte = rendre(valeurs);

      const renvoi = texte.match(/conditions suspensives prévues à l'Article (\d+)/)?.[1];
      const article = texte.match(/^Article (\d+)\. Conditions suspensives/m)?.[1];
      expect(renvoi, JSON.stringify(valeurs)).toBe(article);
    }
  });

  it("renvoie à la valorisation retenue, où qu'elle se trouve", () => {
    const texte = rendre({ apportNumeraire: "120000" });

    const renvoi = texte.match(/valorisation retenue à l'Article (\d+)\.1/)?.[1];
    const article = texte.match(/^Article (\d+)\. Valorisation de l'Apport/m)?.[1];
    expect(renvoi).toBe(article);
  });
});

describe("l'énumération de l'objet du traité", () => {
  it("commence à a), avec ou sans augmentation en numéraire", () => {
    /*
     * La première ligne - la souscription en numéraire - vit dans un bloc conditionnel,
     * et les deux suivantes portaient leur lettre en dur : sans numéraire, le traité
     * énumérait b) puis c), et le lecteur cherchait un a) qui n'existait pas.
     */
    const sans = rendre();
    expect(sans).toMatch(/^a\)\tl'Apporteur consent à apporter/m);
    expect(sans).toMatch(/^b\)\tla Société Bénéficiaire accepte/m);

    const avec = rendre({ apportNumeraire: "120000" });
    expect(avec).toMatch(/^a\)\tl'Apporteur s'engage à souscrire/m);
    expect(avec).toMatch(/^b\)\tl'Apporteur consent à apporter/m);
    expect(avec).toMatch(/^c\)\tla Société Bénéficiaire accepte/m);
  });
});

describe("ce que le traité dit des parties", () => {
  it("identifie l'apporteur par son état civil complet", () => {
    const texte = rendre();

    // « né le 9 juillet 2003, à Le Chesnay » se lit comme une faute de saisie.
    expect(texte).toContain(
      "né le 9 juillet 2003 au Chesnay-Rocquencourt (Yvelines), de nationalité française, demeurant 38 rue du Hameau, 78480 Verneuil-sur-Seine"
    );
  });

  it("ne répartit pas un capital détenu par une seule personne", () => {
    expect(rendre()).toContain("détenu en totalité par Monsieur Bilal KLEICHE");
    expect(rendre()).not.toContain("réparti entre Monsieur Bilal KLEICHE.");
  });

  it("accorde la formule d'habilitation sur la personne qui représente", () => {
    const madame = rendre({
      apporteurQualite: "Tiers entrant au capital",
      beneficiaireRepresentant: "Madame Claire MARTIN, en sa qualité de Présidente",
    });
    expect(madame).toContain("dûment habilitée à l'effet des présentes");
    expect(rendre()).toContain("dûment habilité à l'effet des présentes");
  });

  it("fait signer les deux qualités, même quand une seule main les trace", () => {
    const texte = rendre();
    expect(texte).toContain("L'Apporteur");
    expect(texte).toContain("La Société Bénéficiaire");
    expect(texte.match(/Monsieur Bilal KLEICHE/g)?.length).toBeGreaterThan(2);
  });
});

describe("les chiffres du traité s'accordent entre eux", () => {
  it("émet le nombre d'actions que le nominal donne, et porte le capital d'autant", () => {
    const texte = rendre();

    // 125 000 euros à 10 euros de nominal : 12 500 actions, capital de 15 500 à 140 500.
    expect(texte).toContain("douze mille cinq cents (12 500) Actions Nouvelles en Nature");
    expect(texte).toContain(
      "porté de quinze mille cinq cents euros (15 500 €) à cent quarante mille cinq cents euros (140 500 €)"
    );
  });

  it("chaîne le capital derrière l'augmentation en numéraire", () => {
    /*
     * Le numéraire précède l'apport : c'est le capital qu'il laisse qui sert de point
     * de départ à la rémunération, non le capital d'origine.
     */
    const texte = rendre({ apportNumeraire: "120000" });

    expect(texte).toContain("porté de cent trente-cinq mille cinq cents euros (135 500 €)");
    expect(texte).toContain("à deux cent soixante mille cinq cents euros (260 500 €)");
  });

  it("calcule le pourcentage du capital apporté", () => {
    expect(rendre()).toContain("représentant 50 % de son capital social");
  });
});

describe("la prime d'apport", () => {
  /*
   * Émettre moins de titres que la valeur nominale n'en donnerait est l'usage quand on
   * ne veut pas diluer les autres associés, ou quand le nominal de la holding ne divise
   * pas la valeur retenue. L'écart va en prime : en réserve, pas au capital.
   */
  it("n'en dégage aucune quand la valeur entre entièrement au capital", () => {
    expect(rendre()).toContain("sans prime d'apport");
  });

  it("chiffre la prime, globale et par titre, quand le nombre de titres la dégage", () => {
    // 125 000 apportés, 8 000 titres de 10 euros : 80 000 au capital, 45 000 en prime.
    const texte = rendre({ apportActionsEmises: "8000" });

    expect(texte).toContain("huit mille (8 000) Actions Nouvelles en Nature");
    expect(texte).toContain("d'un montant de quatre-vingt mille euros (80 000 €)");
    expect(texte).toContain("prime d'apport globale de 45 000 euros, soit 5,63 euros par titre");
    expect(texte).toContain("compte de prime d'apport au passif du bilan");
  });

  it("ne porte au capital que le nominal des titres émis", () => {
    const texte = rendre({ apportActionsEmises: "8000" });

    // 15 500 + 80 000, non 15 500 + 125 000 : la prime ne monte pas au capital.
    expect(texte).toContain("(15 500 €) à quatre-vingt-quinze mille cinq cents euros (95 500 €)");
  });

  it("permet un nominal qui ne divise pas la valeur, dès lors qu'il est assumé", () => {
    /*
     * Sans nombre de titres, un nominal de 30 est refusé - il laisserait un reste que
     * rien ne nomme. Avec un nombre de titres, le reste devient la prime, et l'acte le
     * dit. Un seul refus doit paraître, non deux sous la même case.
     */
    const sansNombre = refus({ apportNominaleBeneficiaire: "30" });
    expect(sansNombre.map((a) => a.champ)).toEqual(["apportNominaleBeneficiaire"]);
    expect(sansNombre[0].message).toContain("prime d'apport");

    expect(refus({ apportNominaleBeneficiaire: "30", apportActionsEmises: "4000" })).toEqual([]);
  });

  it("refuse d'émettre pour plus que la valeur apportée", () => {
    // 20 000 titres de 10 euros font 200 000 pour un apport de 125 000.
    const alertes = verifierLeTraite(contexte({ apportActionsEmises: "20000" }));

    expect(alertes.map((a) => a.champ)).toContain("apportActionsEmises");
    expect(alertes[0].message).toContain("libérés sans contrepartie");
  });

  it("refuse une fraction de titre", () => {
    const alertes = verifierLeTraite(contexte({ apportActionsEmises: "8000,5" }));
    expect(alertes.map((a) => a.champ)).toContain("apportActionsEmises");
  });
});

describe("les contrôles de cohérence du traité", () => {
  it("refuse d'apporter plus de titres que la société n'en compte", () => {
    expect(refus({ apportNbTitres: "900" }).map((a) => a.champ)).toEqual(["apportNbTitres"]);
  });

  it("refuse un commissaire aux apports partie à l'opération", () => {
    /*
     * Il engage sa responsabilité sur la valeur qu'il retient : le désigner parmi les
     * associés vide le rapport de son sens et la garantie avec.
     */
    const alertes = verifierLeTraite(
      contexte({ apportCommissaireNom: "Monsieur Bilal KLEICHE" })
    );

    expect(alertes.map((a) => a.message).join(" ")).toContain("indépendant");
  });

  it("refuse une dispense de commissaire que la loi n'ouvre pas", () => {
    /*
     * 125 000 euros dépassent le seuil de 30 000, et l'apport fait plus de la moitié
     * du capital final : le rapport est obligatoire, la dispense ne se décide pas.
     */
    const alertes = verifierLeTraite(
      contexte({ apportCommissaire: "Non, dispense décidée à l'unanimité" })
    );

    expect(alertes.map((a) => a.champ)).toContain("apportCommissaire");
  });

  it("laisse passer un dossier régulier", () => {
    expect(verifierLeTraite(contexte())).toEqual([]);
  });
});

describe("la terminologie découle des formes en présence", () => {
  it("fonde l'apport sur le texte de la bénéficiaire", () => {
    expect(fondementLegalDeLApport("SAS")).toContain("L. 227-1");
    expect(fondementLegalDeLApport("SARL")).toBe("l'article L. 223-33 du code de commerce");
    expect(fondementLegalDeLApport("SA")).toBe("l'article L. 225-147 du code de commerce");
  });

  it("fonde la dispense de commissaire sur le même texte", () => {
    expect(fondementDeLaDispense("SARL")).toBe("l'article L. 223-9 du code de commerce");
    expect(fondementDeLaDispense("SAS")).toContain("L. 227-1");
  });

  it("reconnaît la double représentation à la qualité déclarée", () => {
    expect(doubleRepresentation({ apporteurQualite: "Associé et représentant légal" })).toBe(true);
    expect(doubleRepresentation({ apporteurQualite: "Associé, sans mandat social" })).toBe(false);
    expect(doubleRepresentation({})).toBe(false);
  });

  it("nomme la cour d'appel, qui n'est pas toujours celle du registre", () => {
    /*
     * Le département décide, non la ville : Nanterre relève de Versailles, Bobigny de
     * Paris, Marseille d'Aix-en-Provence, et aucune des trois ne porte le nom de sa
     * cour.
     */
    expect(courDAppel("92000")).toBe("Versailles");
    expect(courDAppel("93000")).toBe("Paris");
    expect(courDAppel("13001")).toBe("Aix-en-Provence");
    expect(courDAppel("75008")).toBe("Paris");
    expect(courDAppel("69006")).toBe("Lyon");
    // Les deux départements corses relèvent de la même cour, et le code postal les confond.
    expect(courDAppel("20000")).toBe("Bastia");
    expect(courDAppel("20200")).toBe("Bastia");
    // L'outre-mer se lit sur trois chiffres.
    expect(courDAppel("97400")).toBe("Saint-Denis de La Réunion");
    expect(courDAppel("97200")).toBe("Fort-de-France");
    // Sans code postal, la ville est un pis-aller, non une réponse.
    expect(courDAppel("", "Lyon")).toBe("Lyon");
    // Sans rien du tout, un tiret : dans un acte, un blanc se lit comme un oubli.
    expect(courDAppel(null)).toBe("-");
  });

  it("couvre le territoire sans laisser de département sans cour", () => {
    /*
     * Une table de villes serait toujours incomplète - il y a cent trente greffes - et
     * rendrait une clause attributive fausse sans le dire. Une table de départements
     * se termine.
     */
    for (let numero = 1; numero <= 95; numero += 1) {
      const code = String(numero).padStart(2, "0") + "000";
      expect(courDAppel(code), "département " + code.slice(0, 2)).not.toBe("-");
    }
  });
});

describe("la numérotation, calculée hors du document", () => {
  it("compte les seuls éléments actifs", () => {
    const sans = numerotationDuTraite({ souscriptionNumeraire: false, doubleRepresentation: false });
    expect(sans.t_apport).toBe("II");
    expect(sans.t_numeraire).toBeUndefined();
    expect(sans.a_1161).toBeUndefined();
    /* Vingt-six articles au modèle, moins les deux du numéraire et celui de l'article 1161. */
    expect(sans.a_exemplaires).toBe("23");

    const avec = numerotationDuTraite({ souscriptionNumeraire: true, doubleRepresentation: true });
    expect(avec.t_numeraire).toBe("II");
    expect(avec.t_apport).toBe("III");
    expect(avec.a_exemplaires).toBe("26");
  });
});
