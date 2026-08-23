import { describe, it, expect } from "vitest";
import { nouvelleAdresse, ANCIENNES_ADRESSES } from "@/domain/navigation/anciennes-adresses";

const params = (s = "") => new URLSearchParams(s);

describe("anciennes adresses", () => {
  it("chaque page a sa nouvelle adresse, sans .html", () => {
    for (const [ancienne, nouvelle] of Object.entries(ANCIENNES_ADRESSES)) {
      expect(ancienne.endsWith(".html"), ancienne).toBe(true);
      expect(nouvelle.includes(".html"), nouvelle).toBe(false);
    }
  });

  it("redirige les pages connues", () => {
    expect(nouvelleAdresse("/dashboard.html", params())).toBe("/tableau-de-bord");
    expect(nouvelleAdresse("/admin.html", params())).toBe("/administration");
    // La vitrine est sur un autre site : ce qui y menait aboutit à la connexion.
    expect(nouvelleAdresse("/index.html", params())).toBe("/connexion");
    expect(nouvelleAdresse("/blog.html", params())).toBe("/connexion");
    expect(nouvelleAdresse("/contact.html", params())).toBe("/connexion");
  });

  it("ne redirige pas une adresse inconnue", () => {
    expect(nouvelleAdresse("/page-inventee.html", params())).toBeNull();
    expect(nouvelleAdresse("/tableau-de-bord", params())).toBeNull();
  });

  it("l'identifiant de dossier suit le changement de nom", () => {
    // Les liens reçus par email portent ?id= : ils doivent ouvrir le bon dossier.
    expect(nouvelleAdresse("/creation.html", params("id=42"))).toBe("/creation?dossier=42");
  });

  it("les paramètres devenus inutiles sont écartés", () => {
    expect(nouvelleAdresse("/creation.html", params("new=1&type=creation"))).toBe(
      "/creation?type=creation"
    );
  });

  it("les autres paramètres sont conservés", () => {
    expect(nouvelleAdresse("/messagerie.html", params("dossier=7"))).toBe("/messagerie?dossier=7");
  });
});
