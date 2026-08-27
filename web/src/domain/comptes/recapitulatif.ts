/**
 * Ce que le cabinet lit d'un dépôt des comptes.
 *
 * L'onglet « Le dossier » n'avait qu'une lecture : celle d'une création. Un dépôt des
 * comptes s'y affichait donc en huit lignes vides - Dénomination, Forme juridique,
 * Activité, Capital social, tous à « - », sous « Le client n'a encore rien renseigné ».
 * La société existe pourtant : elle est immatriculée depuis des années, et c'est son
 * exercice qu'on approuve.
 *
 * Écrit sur le modèle de recapitulatifDeModification, et rendu par le même composant.
 */

import type { SectionDuDossier } from "@/domain/modification/recapitulatif";
import { fonctionDuDirigeant } from "@/domain/formalite/formes";
import type { ContexteComptes } from "./gabarit";

/** Un dossier de dépôt des comptes, tel que data_json le porte. */
export type DossierDeComptes = Partial<ContexteComptes>;

function texte(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

/** « 15 000 euros », ou rien du tout : une ligne sans valeur ne s'affiche pas. */
function euros(valeur: unknown): string {
  const lu = Number(texte(valeur).replace(",", "."));
  if (!Number.isFinite(lu) || texte(valeur) === "") return "";
  return lu.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[  ]/g, " ") + " euros";
}

/** Les centimes de l'affectation, lus en euros. */
function centimesEnEuros(centimes: number): string {
  return (centimes / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2 }).replace(
    /[  ]/g,
    " "
  );
}

/**
 * La date du formulaire se relit en toutes lettres.
 *
 * Elle arrive au format ISO, celui du champ de saisie : « 2025-12-31 » dans une page
 * qui écrit ses dates en français partout ailleurs.
 */
function date(valeur: unknown): string {
  const brut = texte(valeur);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(brut)) return brut;
  const [annee, mois, jour] = brut.split("-").map(Number);
  return new Date(annee, mois - 1, jour).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Les lignes vides sont écartées : elles n'apprennent rien au cabinet. */
function section(titre: string, faits: { libelle: string; valeur: string }[]): SectionDuDossier[] {
  const retenus = faits.filter((f) => f.valeur);
  return retenus.length > 0 ? [{ titre, faits: retenus }] : [];
}

export function recapitulatifDesComptes(donnees: DossierDeComptes): SectionDuDossier[] {
  const societe = donnees.societe ?? {};
  const valeurs = donnees.valeurs ?? {};
  const affectation = donnees.affectation;

  /*
   * Le code postal et la ville ne se recollent que s'ils manquent.
   *
   * L'adresse saisie les porte souvent déjà - « 34 rue Laugier 75017 Paris » - et le
   * siège se lisait « 34 rue Laugier 75017 Paris, 75017, Paris ».
   */
  const rue = texte(societe.adresse);
  const dejaDedans = (part: string) =>
    !part || rue.toLowerCase().includes(part.toLowerCase());
  const adresse = [
    rue,
    dejaDedans(texte(societe.codePostal)) ? "" : texte(societe.codePostal),
    dejaDedans(texte(societe.ville)) ? "" : texte(societe.ville),
  ]
    .filter(Boolean)
    .join(", ");

  return [
    ...section("La société", [
      { libelle: "Dénomination", valeur: texte(societe.denomination) },
      { libelle: "Forme juridique", valeur: texte(societe.forme) },
      { libelle: "SIREN", valeur: texte(societe.siren) },
      { libelle: "Siège social", valeur: adresse },
      { libelle: "Capital social", valeur: euros(societe.capital) },
      { libelle: "Greffe", valeur: texte(societe.villeRcs) },
    ]),

    ...section("L'exercice approuvé", [
      { libelle: "Ouvert le", valeur: date(valeurs.dateOuverture) },
      { libelle: "Clos le", valeur: date(valeurs.dateCloture) },
      { libelle: "Résultat", valeur: euros(valeurs.resultat) },
      { libelle: "Report antérieur", valeur: euros(valeurs.reportAnterieur) },
      { libelle: "Chiffre d'affaires", valeur: euros(valeurs.chiffreAffaires) },
      { libelle: "Total du bilan", valeur: euros(valeurs.totalBilan) },
      { libelle: "Effectif", valeur: texte(valeurs.effectif) },
    ]),

    ...section("L'assemblée", [
      { libelle: "Tenue le", valeur: date(valeurs.dateAssemblee) },
      { libelle: "À", valeur: texte(valeurs.heureAssemblee) },
      { libelle: "Lieu", valeur: texte(valeurs.lieuAssemblee) },
      {
        /*
         * Le formulaire saisit le prénom et le nom séparément, et compose
         * « dirigeantNom » plus loin : le récapitulatif n'affichait donc que la
         * civilité, « Monsieur » seul sur sa ligne.
         */
        libelle: "Signataire",
        valeur: [
          texte(valeurs.dirigeantCivilite),
          texte(valeurs.dirigeantPrenom),
          texte(valeurs.dirigeantNomFamille) || texte(valeurs.dirigeantNom),
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        /*
         * Le titre corrigé de ce que la forme interdit - le même que l'acte porte.
         *
         * Un dossier réglé avant que l'écran ne restreigne les choix garde le sien :
         * cette société d'exercice libéral par actions simplifiée avait « Gérant »
         * enregistré. L'acte écrit « Président » ; le récapitulatif que l'avocat relit
         * avant de l'envoyer doit dire la même chose.
         */
        libelle: "En qualité de",
        valeur: texte(valeurs.dirigeantFonction)
          ? fonctionDuDirigeant(texte(societe.forme), texte(valeurs.dirigeantFonction))
          : "",
      },
      {
        libelle: "Associés présents",
        valeur: donnees.associes?.length ? String(donnees.associes.length) : "",
      },
    ]),

    ...(affectation
      ? section("L'affectation du résultat", [
          {
            libelle: "À la réserve légale",
            valeur: affectation.reserveLegaleCentimes
              ? centimesEnEuros(affectation.reserveLegaleCentimes) + " euros"
              : "",
          },
          {
            libelle: "Aux autres réserves",
            valeur: affectation.autresReservesCentimes
              ? centimesEnEuros(affectation.autresReservesCentimes) + " euros"
              : "",
          },
          {
            libelle: "En dividendes",
            valeur: affectation.dividendesCentimes
              ? centimesEnEuros(affectation.dividendesCentimes) + " euros"
              : "",
          },
          {
            libelle: "En report à nouveau",
            valeur: affectation.reportANouveauCentimes
              ? centimesEnEuros(affectation.reportANouveauCentimes) + " euros"
              : "",
          },
        ])
      : []),

    ...section("Les conventions réglementées", [
      {
        libelle: "Déclarées",
        valeur: donnees.conventions?.length ? String(donnees.conventions.length) : "",
      },
    ]),
  ];
}
