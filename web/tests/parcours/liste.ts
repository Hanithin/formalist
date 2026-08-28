import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Choisir dans une liste, qui n'est plus un `<select>`.
 *
 * Le menu natif était dessiné par le système et rien ne l'habillait ; il a été remplacé
 * par un composant écrit - voir ChampChoix, et le calendrier avant lui. `selectOption()`
 * ne s'applique donc plus : on ouvre la liste, et l'on clique le choix.
 *
 * Le geste reste celui d'un utilisateur, ce qui est le propre d'un test de parcours :
 * on ne pose pas la valeur, on la choisit.
 */
export async function choisir(champ: Locator, option: string | RegExp) {
  await champ.click();
  const menu = champ.page().getByRole("listbox");
  await expect(menu).toBeVisible();
  await menu.getByRole("option", { name: option, exact: typeof option === "string" }).click();
  await expect(menu).toHaveCount(0);
}

/**
 * La même chose, désignée par le libellé du champ.
 *
 * Le libellé est pris au mot près : « Cédant » désignait aussi « Comment le cédant a
 * obtenu ses parts », ajouté depuis, et le clic ne savait plus lequel viser.
 */
export async function choisirDans(page: Page, libelle: string | RegExp, option: string | RegExp) {
  await choisir(
    page.getByLabel(libelle, typeof libelle === "string" ? { exact: true } : undefined),
    option
  );
}
