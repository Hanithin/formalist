import { natureDeLaForme } from "@/domain/formalite/formes";
import type { Obligation } from "./obligations";

/**
 * Ce qu'un apport de titres laisse derrière lui, et pour quand.
 *
 * Les obligations de la fiche se déduisaient de la société seule : sa forme et la
 * clôture de son exercice. Celles-ci naissent d'un acte. Un apport signé le 1er octobre
 * ouvre deux horloges de trente jours et une déclaration annuelle qui court des années,
 * et rien dans l'application ne les portait : le dossier se refermait sur le dépôt au
 * guichet, et le reste tenait dans la mémoire de celui qui avait signé.
 *
 * Le registre des bénéficiaires effectifs est le plus coûteux à oublier. Ce n'est pas
 * une amende lointaine : un registre qui n'est pas à jour vaut une mise en demeure du
 * greffe, et les banques y regardent avant de laisser passer un virement.
 *
 * Rien n'est annoncé avant que l'apport ait eu lieu. Une échéance qui court depuis une
 * date à venir se lirait comme un retard qu'on n'a pas.
 */

export interface ApportDuDossier {
  /** La date à laquelle l'apport prend effet : c'est d'elle que partent les délais. */
  dateEffet: string | null;
  apporteeForme: string | null;
  apporteeDenomination: string | null;
  /**
   * L'apporteur contrôle-t-il la holding après l'apport ?
   *
   * C'est cette réponse, et elle seule, qui décide du régime : report d'imposition avec
   * contrôle, sursis sans lui. Le sursis ne se déclare pas chaque année ; le report si.
   */
  sousControle: boolean;
}

/** Le jour, en ISO, sans l'heure : les échéances se comparent comme des chaînes. */
function jour(quand: Date): string {
  return quand.toISOString().slice(0, 10);
}

function plusDeJours(iso: string, jours: number): string | null {
  const date = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + jours);
  return jour(date);
}

function plusDUnMois(iso: string): string | null {
  const date = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return null;
  const quantieme = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + 1);
  /* Le 31 janvier plus un mois n'est pas le 3 mars : on retombe sur la fin du mois. */
  if (date.getUTCDate() !== quantieme) date.setUTCDate(0);
  return jour(date);
}

/**
 * Les échéances qu'un apport ouvre pour la société qui a reçu les titres.
 *
 * Elles sont portées par sa fiche et non par celle de la société apportée, pour une
 * raison de fait : cette dernière n'entre au portefeuille qu'une fois son propre dossier
 * ouvert, et ce sont justement ces lignes qui rappellent de l'ouvrir. Chacune nomme la
 * société qu'elle concerne, pour qu'on ne dépose pas au greffe de l'une ce qui appartient
 * à l'autre.
 */
export function suitesDeLApport(
  apports: ApportDuDossier[],
  cleSociete: string,
  aujourdHui: Date = new Date()
): Obligation[] {
  const obligations: Obligation[] = [];
  const maintenant = jour(aujourdHui);

  apports.forEach((apport, rang) => {
    const effet = (apport.dateEffet ?? "").trim();
    /* Sans date, ou tant qu'elle n'est pas passée, il n'y a rien à annoncer. */
    if (!effet || effet > maintenant) return;

    const suffixe = cleSociete + "-" + rang;
    const nom = (apport.apporteeDenomination ?? "").trim() || "la société apportée";
    const trenteJours = plusDeJours(effet, 30);

    obligations.push({
      cle: "rbe-holding-" + suffixe,
      nature: "beneficiaires-effectifs",
      intitule: "Déclarer les bénéficiaires effectifs après l'apport",
      intituleCourt: "Bénéficiaires effectifs",
      limite: trenteJours,
      explication:
        "L'apport a changé qui détient quoi : la déclaration doit le dire, avec la chaîne de détention et les pourcentages. Un registre qui n'est pas à jour vaut une mise en demeure du greffe, et les banques y regardent.",
      fondement: "Article R. 561-1 du code monétaire et financier - trente jours.",
      bouton: "Voir le dossier",
      lien: "/formalites",
    });

    obligations.push({
      cle: "rbe-apportee-" + suffixe,
      nature: "beneficiaires-effectifs",
      intitule: "Déclarer les bénéficiaires effectifs de " + nom,
      intituleCourt: "Bénéficiaires effectifs de " + nom,
      limite: trenteJours,
      explication:
        "L'apporteur ne détient plus " +
        nom +
        " directement : il la détient par cette société. Sa déclaration change aussi, et c'est à elle de la faire.",
      fondement: "Article R. 561-1 du code monétaire et financier - trente jours.",
      bouton: "Voir le dossier",
      lien: "/formalites",
    });

    /*
     * Les statuts de la société apportée, quand ses titres sont des parts.
     *
     * Dans une société par actions, les actionnaires ne figurent pas aux statuts : il
     * n'y a rien à redéposer, et l'annoncer ferait faire une démarche qui n'existe pas.
     */
    if (natureDeLaForme(apport.apporteeForme).titres === "parts sociales") {
      obligations.push({
        cle: "statuts-apportee-" + suffixe,
        nature: "statuts-societe-apportee",
        intitule: "Déposer les statuts de " + nom + " au guichet unique",
        intituleCourt: "Statuts de " + nom,
        limite: plusDUnMois(effet),
        explication:
          "La répartition des parts est une mention des statuts : celle de " +
          nom +
          " a changé, et c'est le dépôt des statuts à jour qui rend le changement opposable aux tiers.",
        fondement:
          "Le changement d'associé se déclare au guichet unique dans le mois de la décision.",
        bouton: "Ouvrir le dossier",
        lien: "/formalites",
      });
    }

    /*
     * La déclaration annuelle du report, sans date.
     *
     * Elle suit la déclaration de revenus, dont la date change chaque année et selon le
     * département. En inventer une ferait annoncer un retard qui n'en est pas un ; le
     * modèle admet une obligation sans limite, comme l'approbation des comptes d'une
     * société civile, que seuls les statuts datent.
     */
    if (apport.sousControle) {
      obligations.push({
        cle: "report-imposition-" + suffixe,
        nature: "report-imposition",
        intitule: "Rappeler le report d'imposition sur la déclaration de revenus",
        intituleCourt: "Report d'imposition",
        limite: null,
        /* Elle suit la déclaration de revenus, dont la date change chaque année. */
        quandSansDate: "Chaque année, avec la déclaration de revenus",
        explication:
          "L'impôt sur le gain est reporté, non effacé. Tant que le report dure, l'apporteur le reprend chaque année sur le formulaire 2074-I et dans sa déclaration de revenus. L'oublier fait perdre le report.",
        fondement: "Article 150-0 B ter du code général des impôts.",
        bouton: "Voir le dossier",
        lien: "/formalites",
      });
    }
  });

  return obligations;
}
