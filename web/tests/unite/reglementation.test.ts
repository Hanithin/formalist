import { describe, it, expect } from "vitest";
import {
  ACTIVITES_REGLEMENTEES,
  REPONSES,
  activiteReglementee,
  reponseValide,
  qualificationExigee,
  verificationAttendue,
  reponseIncomplete,
} from "@/domain/auto-entrepreneur/reglementation";

describe("la liste des activités réglementées", () => {
  it("porte les neuf activités de l'article L121-1", () => {
    /*
     * Huit alinéas du code de l'artisanat, plus la coiffure au titre de la loi du
     * 23 mai 1946. La liste n'est pas décorative : c'est elle qui décide de la pièce
     * réclamée, et un oubli fait refuser un dossier au guichet.
     */
    expect(ACTIVITES_REGLEMENTEES).toHaveLength(9);

    const codes = ACTIVITES_REGLEMENTEES.map((a) => a.code);
    expect(codes).toEqual([
      "vehicules",
      "batiment",
      "fluides",
      "ramonage",
      "esthetique",
      "protheses",
      "alimentaire",
      "marechal",
      "coiffure",
    ]);
  });

  it("chaque activité porte son intitulé légal et des métiers reconnaissables", () => {
    // L'intitulé légal seul ne parle à personne : « la mise en place, l'entretien et
    // la réparation des réseaux utilisant les fluides » se reconnaît par « plombier ».
    for (const activite of ACTIVITES_REGLEMENTEES) {
      expect(activite.intitule.length).toBeGreaterThan(10);
      expect(activite.exemples.length).toBeGreaterThan(0);
    }
  });

  it("une activité inconnue ne rend rien", () => {
    expect(activiteReglementee("astronaute")).toBeNull();
    expect(activiteReglementee(null)).toBeNull();
    expect(activiteReglementee("coiffure")?.exemples[0]).toBe("Coiffeur en salon");
  });
});

describe("les trois réponses", () => {
  it("« je ne sais pas » en est une, et pas une absence", () => {
    /*
     * Sans elle il ne reste que deux issues fausses : cocher à tort et réclamer un
     * diplôme inutile, ou ne rien cocher et se faire refuser au guichet.
     */
    expect(REPONSES.map((r) => r.valeur)).toEqual(["oui", "non", "incertain"]);
    expect(reponseValide("incertain")).toBe("incertain");
  });

  it("une réponse inventée n'en est pas une", () => {
    expect(reponseValide("peut-etre")).toBeNull();
    expect(reponseValide(undefined)).toBeNull();
  });

  it("chaque réponse dit ce qu'elle entraîne", () => {
    for (const reponse of REPONSES) {
      expect(reponse.explication.length).toBeGreaterThan(20);
    }
  });
});

describe("ce que la réponse entraîne", () => {
  it("seul un métier reconnu réclame un justificatif", () => {
    expect(qualificationExigee("oui")).toBe(true);
    expect(qualificationExigee("non")).toBe(false);
    // Exiger un diplôme sur un doute ferait renoncer quelqu'un qui n'en a pas besoin.
    expect(qualificationExigee("incertain")).toBe(false);
  });

  it("le doute appelle un avis, non une pièce", () => {
    expect(verificationAttendue("incertain")).toBe(true);
    expect(verificationAttendue("oui")).toBe(false);
    expect(verificationAttendue("non")).toBe(false);
  });

  it("« oui » sans métier désigné ne dit rien", () => {
    // On ne sait pas quelle pièce demander tant que la catégorie n'est pas nommée.
    expect(reponseIncomplete("oui", undefined)).toBe(true);
    expect(reponseIncomplete("oui", "inventé")).toBe(true);
    expect(reponseIncomplete("oui", "batiment")).toBe(false);
  });

  it("les autres réponses n'attendent aucune précision", () => {
    expect(reponseIncomplete("non", undefined)).toBe(false);
    expect(reponseIncomplete("incertain", undefined)).toBe(false);
  });
});
