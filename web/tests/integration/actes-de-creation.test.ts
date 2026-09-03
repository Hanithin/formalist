import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { genererDocument } from "@/infrastructure/documents/generation";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";

/**
 * Ce que porte le texte des actes d'une création.
 *
 * Deux défauts s'y voyaient à l'œil nu et à personne d'autre. « Monsieur Jean Dupont,
 * né(e) le 12 avril 1980 » : la règle qui accorde le participe cherchait un « é »
 * composé, là où les statuts de SAS portent la forme décomposée - dix mentions par jeu.
 * Et la passe typographique, appliquée sur tous les autres parcours, ne l'était pas sur
 * la création : un capital pouvait se couper entre « 20 » et « 000 » au bas d'une page.
 */
const brouillon = {
  forme: "SAS",
  denomination: "ATELIER MERIDIEN",
  capital: 20000,
  partsTotales: 2000,
  objet: "la conception et la vente de mobilier contemporain",
  adresse: "12 rue Vauban",
  codePostal: "69006",
  ville: "Lyon",
  associes: [
    {
      type: "physique" as const,
      parts: 1400,
      personne: {
        civilite: "Monsieur", prenom: "Jean", nom: "Dupont",
        dateDeNaissance: "1980-04-12", villeDeNaissance: "Lyon",
        nomDuPere: "Paul Dupont", nomDeLaMere: "Anne Berger", nationalite: "Française",
        adresse: "5 rue de la Paix", codePostal: "69001", ville: "Lyon",
      },
    },
    {
      type: "physique" as const,
      parts: 600,
      personne: {
        civilite: "Madame", prenom: "Claire", nom: "Martin",
        dateDeNaissance: "1986-09-03", villeDeNaissance: "Grenoble",
        nomDuPere: "Louis Martin", nomDeLaMere: "Sylvie Roche", nationalite: "Française",
        adresse: "22 cours Vitton", codePostal: "69006", ville: "Lyon",
      },
    },
  ],
  dirigeants: [{ associe: 0 }],
};

function texteDesStatuts(typographie: boolean): string {
  const donnees = donneesDeGabarit(brouillon as never, { villeRcs: "Lyon" } as never);
  const brut = genererDocument("sas-statuts.docx", donnees);
  const docx = typographie ? typographierLeDocument(brut) : brut;
  return new PizZip(docx).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "");
}

describe("les statuts d'une SAS", () => {
  it("accorde le participe sur la civilité de chacun", () => {
    const texte = texteDesStatuts(false);
    expect(texte).not.toContain("né(e)");
    expect(texte).toContain("Monsieur Jean DUPONT, né le");
    expect(texte).toContain("Madame Claire MARTIN, née le");
  });

  it("ne laisse pas un montant se couper en fin de ligne", () => {
    const texte = texteDesStatuts(true);
    /* Un groupe de milliers séparé par une espace ordinaire se coupe : il n'en reste aucun. */
    expect(texte).not.toMatch(/\d \d{3}\b/);
    expect(texte).not.toMatch(/\d euros/);
    expect(texte).not.toMatch(/\b[LR]\. \d/);
  });
});

/**
 * Une associée unique lit un acte qui parle d'elle.
 *
 * Les gabarits écrivent « L'ASSOCIÉ UNIQUE SOUSSIGNÉ », « né le » et « QU'IL A DÉCIDÉ
 * DE CONSTITUER » en toutes lettres, hors de portée des variables. Une femme seule à
 * constituer sa société lisait donc son acte au masculin, du titre à la formule de
 * constitution, dans des statuts déposés au greffe.
 */
describe("l'accord en genre des statuts", () => {
  const seule = (civilite: "Madame" | "Monsieur") => ({
    forme: "SASU",
    denomination: "ROSEBERRY CAPITAL",
    activite: "Le conseil",
    adresse: "34 Rue Laugier",
    codePostal: "75017",
    ville: "Paris",
    banque: "Qonto",
    capital: 1000,
    capitalLibere: 1000,
    partsTotales: 100,
    dureeDeVie: 99,
    dateCloturePremierExercice: "2027-12-31",
    associes: [
      {
        type: "physique",
        parts: 100,
        versement: 1000,
        personne: {
          civilite,
          prenom: "Amel",
          nom: "Belouafi",
          dateDeNaissance: "1996-01-27",
          villeDeNaissance: "Argenteuil",
          nationalite: "Française",
          situationMatrimoniale: "Marié(e)",
          adresse: "34 Rue Laugier",
          codePostal: "75017",
          ville: "Paris",
        },
      },
    ],
    dirigeants: [{ associe: 0 }],
  });

  const statuts = (civilite: "Madame" | "Monsieur") =>
    new PizZip(genererDocument("sasu-statuts.docx", donneesDeGabarit(seule(civilite) as never)))
      .file("word/document.xml")!
      .asText()
      .replace(/<[^>]+>/g, "");

  it("accorde le titre, la naissance et la formule de constitution", () => {
    const texte = statuts("Madame");

    expect(texte).toContain("L’ASSOCIÉE UNIQUE SOUSSIGNÉE");
    expect(texte).toContain("née le 27 janvier 1996");
    expect(texte).toContain("QU’ELLE A DÉCIDÉ DE CONSTITUER");
    /* La nationalité est un adjectif au milieu d'une phrase, non une entrée de menu. */
    expect(texte).toContain("de nationalité française");
    expect(texte).not.toContain("de nationalité Française");
  });

  /* Le masculin l'emporte dès qu'un homme signe : il ne faut pas accorder à tort. */
  it("laisse le masculin quand un homme signe", () => {
    const texte = statuts("Monsieur");

    expect(texte).toContain("L’ASSOCIÉ UNIQUE SOUSSIGNÉ");
    expect(texte).toContain("né le 27 janvier 1996");
    expect(texte).toContain("QU’IL A DÉCIDÉ DE CONSTITUER");
  });
});

/**
 * Les autres actes du jeu, quand toutes les signataires sont des femmes.
 *
 * Les statuts s'accordaient déjà - leurs mots sont en capitales suivies d'espaces. Nulle
 * part ailleurs : en JavaScript, « \b » se définit sur [A-Za-z0-9_], et « soussigné\b »
 * exigeait donc une lettre après le « é ». Devant une espace ou un point - c'est-à-dire
 * partout - la règle ne s'appliquait jamais. La liste des souscripteurs ouvrait sur
 * « L'associé unique soussigné » et le procès-verbal sur « le soussigné », pour une
 * femme seule à signer.
 *
 * L'accord ne peut pas porter sur un mot isolé : « présent » désigne une personne dans
 * « est présent au siège » et un acte dans « le présent procès-verbal », et le
 * « Président » des articles de statuts est un organe, non celle qui l'occupe.
 */
describe("l'accord en genre des autres actes", () => {
  const jeu = (civilites: ("Madame" | "Monsieur")[], dirigeant = 0) => ({
    forme: civilites.length > 1 ? "SARL" : "SASU",
    denomination: "ROSEBERRY CAPITAL",
    activite: "Le conseil",
    adresse: "34 Rue Laugier",
    codePostal: "75017",
    ville: "Paris",
    modeDomiciliation: "Domicile personnel du dirigeant",
    occupationDomicile: "Propriétaire",
    banque: "Qonto",
    capital: 1000,
    partsTotales: 100,
    associes: civilites.map((civilite, rang) => ({
      type: "physique",
      parts: rang === 0 ? 60 : 40,
      versement: rang === 0 ? 600 : 400,
      personne: {
        civilite,
        prenom: rang === 0 ? "Amel" : "Karim",
        nom: rang === 0 ? "Belouafi" : "Nadir",
        dateDeNaissance: "1996-01-27",
        villeDeNaissance: "Argenteuil",
        nationalite: "Française",
        nomDuPere: "BELOUAFI Karim",
        nomDeLaMere: "SAADI Nadia",
        adresse: "34 Rue Laugier",
        codePostal: "75017",
        ville: "Paris",
      },
    })),
    dirigeants: [{ associe: dirigeant }],
  });

  const texte = (gabarit: string, brouillon: unknown) =>
    new PizZip(genererDocument(gabarit, donneesDeGabarit(brouillon as never)))
      .file("word/document.xml")!
      .asText()
      .replace(/<[^>]+>/g, "");

  it("ouvre la liste des souscripteurs au féminin", () => {
    expect(texte("sasu-liste-souscripteurs.docx", jeu(["Madame"]))).toContain(
      "L’associée unique soussignée"
    );
    expect(texte("sarl-liste-souscripteurs.docx", jeu(["Madame", "Madame"]))).toContain(
      "Les associées soussignées"
    );
    expect(texte("sas-liste-souscripteurs.docx", jeu(["Madame", "Madame"]))).toContain(
      "Les actionnaires soussignées"
    );
  });

  it("accorde la présence et le titre dans le procès-verbal", () => {
    const seule = texte("sasu-pv-nomination.docx", jeu(["Madame"]));
    expect(seule).toContain("est présente au siège de la société, la soussignée");
    expect(seule).toContain("présidente de cette assemblée");

    const deux = texte("sarl-pv-nomination.docx", jeu(["Madame", "Madame"]));
    expect(deux).toContain("sont présentes au siège de la société, les soussignées");
  });

  it("accorde l'attestation de domiciliation, jusqu'au titre sous la signature", () => {
    const attestation = texte("sarl-attestation-domicile.docx", jeu(["Madame", "Madame"]));
    expect(attestation).toContain("La soussignée");
    expect(attestation).toContain("résidente habituelle");
    expect(attestation).toContain("dont elle est gérante");
    expect(attestation).toMatch(/Madame Amel BELOUAFI\s*Gérante/);
  });

  /*
   * L'attestation est celle du dirigeant : c'est lui qui met son logement à disposition.
   * Elle se signait pourtant au nom du premier associé - ouverte au nom de l'un, signée
   * au nom de l'autre dès que le gérant n'était pas cet associé.
   */
  it("signe l'attestation au nom du dirigeant, pas du premier associé", () => {
    const attestation = texte(
      "sarl-attestation-domicile.docx",
      jeu(["Madame", "Monsieur"], 1)
    );
    expect(attestation).toContain("Le soussigné :Monsieur Karim NADIR");
    expect(attestation).toMatch(/Monsieur Karim NADIR\s*Gérant\b/);
    expect(attestation).not.toContain("Amel");
  });

  /* Le masculin l'emporte dès qu'un homme signe : ne rien accorder à tort. */
  it("laisse le masculin quand un homme signe", () => {
    const deux = texte("sarl-pv-nomination.docx", jeu(["Madame", "Monsieur"], 1));
    expect(deux).toContain("sont présents au siège de la société, les soussignés");
    expect(deux).toContain("président de cette assemblée");
    /* Chaque personne garde son propre participe : elle est née, il est né. */
    expect(deux).toContain("Madame Amel BELOUAFI, née le");
    expect(deux).toContain("Monsieur Karim NADIR, né le");
  });

  /*
   * Les articles des statuts décrivent un organe. « Le Président est nommé pour une
   * durée fixée par les associés » ne parle pas de celle qui l'occupe, et le code de
   * commerce l'écrit ainsi : l'accord s'arrête à ce qui désigne la signataire.
   */
  /*
   * Le titre suit la personne qui l'occupe, non la composition du capital : une gérante
   * préside l'assemblée de deux associés dont l'un est un homme.
   */
  it("accorde le titre sur la dirigeante, même en présence d'un associé", () => {
    const deux = texte("sarl-pv-nomination.docx", jeu(["Madame", "Monsieur"], 0));
    expect(deux).toContain("les soussignés");
    expect(deux).toContain("présidente de cette assemblée");
  });

  it("ne touche pas aux articles qui décrivent un organe", () => {
    const statuts = texte("sasu-statuts.docx", jeu(["Madame"]));
    expect(statuts).toContain("Le Président est nommé");
    expect(statuts).toContain("les présents statuts");
  });
});
