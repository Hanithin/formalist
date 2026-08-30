import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { rendreLeTraiteDApport } from "@/infrastructure/documents/modeles-cabinet";
import { donneesDuTraite, auFilDeLaPhrase } from "@/domain/modification/traite-apport";
import { donneesDuGabarit, actesAProduire, MODELE_TRAITE } from "@/domain/modification/gabarit";
import type { Valeurs } from "@/domain/modification/types";

/**
 * Le traité d'apport de titres, et le procès-verbal qui l'approuve.
 *
 * Le premier gabarit était tiré d'un traité réel, dont les valeurs avaient été
 * remplacées une à une par des variables ; le modèle universel du cabinet l'a
 * remplacé. Le risque, lui, n'a pas changé : une valeur restée en dur - le montant
 * d'un autre dossier dans le vôtre - et une section conditionnelle qui ne se referme
 * pas, laissant apparaître une augmentation de capital qui n'a pas lieu ou une
 * dispense qu'on n'a pas prise. Aucune des deux ne se voit à la génération.
 *
 * Ces tests lisent donc le texte produit, non sa taille. Le détail du traité - sa
 * numérotation, ses renvois, ses contrôles - est vérifié dans traite-apport-rendu.
 */

function texteDu(docx: Buffer): string {
  const xml = new PizZip(docx).file("word/document.xml")?.asText() ?? "";
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const SOCIETE = {
  denomination: "HOLDING ESSAI",
  forme: "SASU",
  siren: "552100554",
  adresse: "4 rue des Lilas",
  codePostal: "95370",
  ville: "Montigny-lès-Cormeilles",
  capital: 500,
  villeRcs: "Pontoise",
  dateStatuts: "2025-10-15",
};

const BASE: Valeurs = {
  apporteeDenomination: "CIBLE ESSAI",
  apporteeForme: "SAS",
  apporteeSiren: "512345678",
  apporteeSiege: "12 rue Paul Vaillant Couturier, 95100 Argenteuil",
  apporteeRcs: "Pontoise",
  apporteeCapital: 1000,
  apporteeNbTitres: 100,
  apporteeNominale: 10,
  apporteeDateStatuts: "2020-09-22",
  apportNbTitres: 50,
  apportValeur: 15000,
  apportMethodeValorisation: "Actif net comptable",
  apportNominaleBeneficiaire: 1,
  apportNumeraire: 15000,
  apportCommissaire: "Non, dispense décidée à l'unanimité",
  apporteurNomComplet: "Monsieur Jean ESSAI",
  apporteurNeLe: "1984-01-11",
  apporteurNeA: "Rouen (76)",
  apporteurNationalite: "française",
  apporteurAdresse: "4 rue des Lilas, 95370 Montigny-lès-Cormeilles",
  apporteurQualite: "Associé unique et représentant légal",
  apportControle: "Oui",
  apportOrigineTitres: "Souscription à la constitution",
  apportNumerotation: "1 à 50",
  apportDateEffet: "2026-10-01",
  apportDateLimiteCondition: "2026-12-31",
  apportLieuSignature: "Pontoise",
  apportDateSignature: "2026-09-20",
  beneficiaireObjet: "la prise de participation dans toutes sociétés",
};

function produire(valeurs: Valeurs, gabarit = MODELE_TRAITE): string {
  const codes = ["apport_titres"];
  const acte = actesAProduire(codes, SOCIETE.forme, valeurs, 1).find((a) => a.gabarit === gabarit);
  if (!acte) throw new Error("acte introuvable : " + gabarit);

  const contexte = { societe: SOCIETE, assemblee: {}, codes, valeurs };
  /* Le traité passe par le modèle du cabinet ; le procès-verbal unipersonnel non. */
  if (acte.gabarit === MODELE_TRAITE) {
    return texteDu(rendreLeTraiteDApport(donneesDuTraite(contexte)));
  }
  return texteDu(genererDocument(acte.gabarit, donneesDuGabarit(contexte)));
}

describe("le traité d'apport de titres", () => {
  it("ne porte aucune valeur du dossier dont le modèle est tiré", () => {
    /*
     * Le modèle venait d'un dossier réel. Une valeur oubliée s'y lirait comme une
     * clause du présent traité - un tiers nommé partie, un siège qui n'est pas le bon.
     */
    const texte = produire(BASE);

    /*
     * Les deux SIREN du dossier d'origine restent dans la liste : le jeu d'essai en
     * emploie d'autres, et c'est précisément ce qui rend le contrôle utile.
     */
    for (const trace of [
      "RHERBAOUI",
      "RSJR",
      "RJSR",
      "RH GESTION",
      "992 453 720",
      "890 404 601",
      "Eaubonne",
      "Frette",
      "22 octobre 2025",
      "31 décembre 2025",
    ]) {
      expect(texte, "trace du modèle : " + trace).not.toContain(trace);
    }
  });

  it("porte les valeurs du dossier, y compris celles qui se calculent", () => {
    const texte = produire(BASE);

    expect(texte).toContain("HOLDING ESSAI");
    expect(texte).toContain("CIBLE ESSAI");
    expect(texte).toContain("Monsieur Jean ESSAI");

    // 50 titres sur 100 : la part du capital apporté se déduit, elle ne se saisit pas.
    expect(texte).toContain("représentant 50 % du capital social");
    // 500 + 15 000 + 15 000, à chaque étape.
    expect(texte).toContain("15 500");
    expect(texte).toContain("30 500");
    // 15 000 € rémunérés par des titres de 1 € : quinze mille titres émis.
    expect(texte).toContain("15 000");
  });

  it("annonce les seuils de remploi de 2026, non ceux d'avant", () => {
    const texte = produire(BASE);

    expect(texte).toContain("au moins 70 % du produit de cession");
    expect(texte).toContain("dans un délai de trois ans à compter de la cession");
    expect(texte).toContain("conservés pendant au moins cinq ans");
    expect(texte).toContain("à compter du 21 février 2026");
    expect(texte).not.toContain("60 %");
    expect(texte).not.toContain("soixante pour cent");
    expect(texte).not.toContain("vingt-quatre (24) mois");
    expect(texte).not.toContain("dix-huit (18) mois");
  });

  it("retire l'augmentation en numéraire quand il n'y en a pas", () => {
    const texte = produire({ ...BASE, apportNumeraire: 0 });

    expect(texte).not.toContain("Augmentation de capital en numéraire");
    expect(texte).not.toContain("Actions Nouvelles en Numéraire");
    // L'apport lui-même reste, et prend le rang que le numéraire laisse libre.
    expect(texte).toContain("Titre II. Apport en nature des titres");
  });

  it("remplace la dispense par le rapport quand un commissaire intervient", () => {
    const texte = produire({
      ...BASE,
      apportCommissaire: "Oui",
      apportCommissaireNom: "Cabinet ESSAI, commissaire aux apports",
    });

    expect(texte).toContain("Cabinet ESSAI");
    expect(texte).not.toContain("de ne pas recourir à un commissaire aux apports");
  });

  it("le procès-verbal porte les résolutions de l'apport", () => {
    /*
     * Le traité est le contrat ; le procès-verbal est la décision qui l'approuve et
     * qui augmente le capital. Sans lui, le greffe reçoit un contrat que rien n'a
     * autorisé, et les statuts changent sans acte qui le décide.
     */
    const texte = produire(BASE, "modif-pv-transfert-siege-sasu.docx");

    expect(texte).toContain("APPROBATION DU TRAITÉ D'APPORT");
    expect(texte).toContain("AUGMENTATION DE CAPITAL EN NUMÉRAIRE");
    expect(texte).toContain("AUGMENTATION DE CAPITAL PAR APPORT EN NATURE");
    expect(texte).toContain("CIBLE ESSAI");
    // Les deux marches du capital, dans l'ordre.
    expect(texte).toContain("15 500");
    expect(texte).toContain("30 500");
    expect(texte).toContain("150-0 B ter");
  });

  it("le procès-verbal tait l'augmentation en numéraire quand il n'y en a pas", () => {
    const texte = produire(
      { ...BASE, apportNumeraire: 0 },
      "modif-pv-transfert-siege-sasu.docx"
    );

    expect(texte).toContain("AUGMENTATION DE CAPITAL PAR APPORT EN NATURE");
    expect(texte).not.toContain("AUGMENTATION DE CAPITAL EN NUMÉRAIRE");
  });

  it("écrit le sursis, non le report, quand l'apporteur ne contrôle pas la bénéficiaire", () => {
    /*
     * Les deux régimes sont couramment confondus. Écrire « report » là où c'est un
     * sursis annonce au signataire un suivi déclaratif et une obligation de remploi
     * qui ne le concernent pas - et l'inverse lui en cache.
     */
    const texte = produire({ ...BASE, apportControle: "Non" });

    expect(texte).toContain("sursis d'imposition prévu à l'article 150-0 B du code général des impôts");
    expect(texte).not.toContain("Événements mettant fin au report");
    expect(texte).not.toContain("150-0 B ter");
  });
});

describe("le texte saisi, inséré au fil d'une phrase", () => {
  /*
   * Le traité écrit « La Société Bénéficiaire a notamment pour objet {objet}. » : le
   * texte arrivait avec sa majuscule et son point final, et l'on lisait « pour objet La
   * prise de participation … du groupe.. » dans un acte présenté à l'enregistrement.
   */
  it("perd sa majuscule et son point", () => {
    expect(auFilDeLaPhrase("La prise de participation dans toutes sociétés.")).toBe(
      "la prise de participation dans toutes sociétés"
    );
    expect(auFilDeLaPhrase("L'animation du groupe...")).toBe("l'animation du groupe");
  });

  /* Un nom propre garde la sienne : « SCI Marchand » n'est pas une phrase. */
  it("garde la majuscule d'un nom", () => {
    expect(auFilDeLaPhrase("SCI Marchand et gestion immobilière.")).toBe(
      "SCI Marchand et gestion immobilière"
    );
  });

  it("rend le vide sur le vide", () => {
    expect(auFilDeLaPhrase("   ")).toBe("");
  });
});
