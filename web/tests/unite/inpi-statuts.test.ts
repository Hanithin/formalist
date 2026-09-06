import { describe, it, expect } from "vitest";
import { estDesStatuts } from "@/infrastructure/inpi/actes";

/**
 * Reconnaître les statuts dans ce que le registre diffuse.
 *
 * L'écran de l'étape 5 dépend entièrement de cette fonction : ce qu'elle ne reconnaît
 * pas, le client le redépose à la main alors que nous l'avions déjà.
 */
describe("les statuts au registre national", () => {
  it("reconnaît les libellés du registre", () => {
    for (const nature of [
      "Statuts constitutifs",
      "Statuts mis à jour",
      "Statuts à jour",
      "Statuts",
      "Acte, Statuts mis à jour",
      "Procès-verbal d'assemblée générale extraordinaire, Statuts mis à jour",
    ]) {
      expect(estDesStatuts(nature), nature).toBe(true);
    }
  });

  /*
   * Le registre reprend parfois le nom du fichier déposé, tel qu'il était sur la
   * machine du déposant. BLUE SHARK ADVISORY diffusait ainsi ses statuts sous
   * « 1Status_… », et l'étape répondait qu'elle ne les avait pas trouvés.
   */
  it("reconnaît un dépôt nommé par son fichier, faute d'orthographe comprise", () => {
    expect(estDesStatuts("1Status_Blue_Shark_Advisory_2026-01-27T18-42-40-754Z")).toBe(true);
    expect(estDesStatuts("Statuts_SARL_ATELIER.pdf")).toBe(true);
  });

  it("écarte ce qui n'est pas des statuts déposés", () => {
    for (const nature of [
      "Projet de statuts",
      "Projet de statuts mis à jour",
      "Procès-verbal d'assemblée générale extraordinaire",
      "11Nomination_Blue_Shark_Advisory_2026-01-27T18-42-40-371Z",
      "5Capital_Blue_Shark_Advisory_2026-01-27T18-42-39-706Z",
      "4certificat_de_depot_6_1",
    ]) {
      expect(estDesStatuts(nature), nature).toBe(false);
    }
  });
});
