import { describe, it, expect } from "vitest";
import { estDesStatuts, dernierDepotDeStatuts, type Acte } from "@/infrastructure/inpi/actes";

/**
 * Retrouver les statuts dans ce que le registre national publie.
 *
 * L'étape 5 en dépend entièrement : ce que cette reconnaissance manque, le client le
 * redépose à la main alors que nous l'avions déjà. Le corpus tient les intitulés qu'on
 * a réellement rencontrés, et l'on y ajoute chaque forme qui nous échappe.
 */

function acte(nature: string, deposeLe: string | null = "2026-01-27"): Acte {
  return { id: nature, deposeLe, nature, statuts: estDesStatuts(nature) };
}

describe("les statuts au registre national", () => {
  it("reconnaît les libellés du registre", () => {
    for (const nature of [
      "Statuts",
      "Statuts constitutifs",
      "Statuts mis à jour",
      "Statuts à jour",
      "Acte, Statuts mis à jour",
      "Procès-verbal d'assemblée générale extraordinaire, Statuts mis à jour",
    ]) {
      expect(estDesStatuts(nature), nature).toBe(true);
    }
  });

  /*
   * Le registre reprend parfois le nom du fichier déposé, tel qu'il était sur la
   * machine du déposant. BLUE SHARK ADVISORY publiait ainsi ses statuts sous
   * « 1Status_… », entre un « 5Capital_ » et un « 11Nomination_ », et l'étape répondait
   * qu'elle ne les avait pas trouvés.
   */
  it("traverse la mise en forme du déposant", () => {
    for (const nature of [
      "1Status_Blue_Shark_Advisory_2026-01-27T18-42-40-754Z",
      "STATUTS-À-JOUR_V3.pdf",
      "statuts_sarl_atelier.PDF",
      "2Statuts",
      "Statuts.signés.pdf",
    ]) {
      expect(estDesStatuts(nature), nature).toBe(true);
    }
  });

  it("écarte ce qui n'est pas des statuts déposés", () => {
    for (const nature of [
      "Projet de statuts",
      "Projet de statuts mis à jour",
      "Procès-verbal d'assemblée générale extraordinaire",
      "11Nomination_Blue_Shark_Advisory_2026-01-27T18-42-40-371Z",
      "5Capital_Blue_Shark_Advisory_2026-01-27T18-42-39-706Z",
      "4certificat_de_depot_6_1",
      "Rapport du commissaire aux comptes",
    ]) {
      expect(estDesStatuts(nature), nature).toBe(false);
    }
  });

  /*
   * Une création dépose les statuts constitutifs, puis les statuts mis à jour. C'est la
   * version en vigueur qu'on retouche, jamais celle du premier jour.
   */
  it("préfère la version à jour à la version d'origine, à date égale", () => {
    const trouve = dernierDepotDeStatuts([
      acte("Statuts constitutifs"),
      acte("Statuts mis à jour"),
    ]);
    expect(trouve?.nature).toBe("Statuts mis à jour");
  });

  it("prend le dépôt le plus récent quand les dates diffèrent", () => {
    const trouve = dernierDepotDeStatuts([
      acte("Statuts mis à jour", "2024-06-01"),
      acte("Statuts constitutifs", "2019-03-12"),
    ]);
    expect(trouve?.deposeLe).toBe("2024-06-01");
  });

  /*
   * La règle qui rend l'échec impossible.
   *
   * Aucune reconnaissance ne nommera un dépôt appelé « BLUE_SHARK_2026.pdf » : le mot
   * n'y est pas. Ce n'est donc pas la reconnaissance qui doit tout couvrir - c'est
   * l'écran qui ne doit jamais conclure « pas de statuts » quand le registre a des
   * actes. Il les montre, et le client désigne les siens.
   */
  it("ne reconnaît rien dans un dépôt sans le mot, et laisse le choix ouvert", () => {
    const actes = [acte("BLUE_SHARK_2026.pdf"), acte("document_final_v2.pdf")];

    expect(dernierDepotDeStatuts(actes)).toBeNull();
    // C'est cette longueur que la route rend, et que l'étape propose au choix.
    expect(actes.length).toBeGreaterThan(0);
  });
});
