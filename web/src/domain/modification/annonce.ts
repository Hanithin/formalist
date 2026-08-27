import { natureDeLaForme } from "@/domain/formalite/formes";
import { dateEnFrancais } from "@/domain/formalite/lettres";
import { changeDeRessort } from "./formalites";
import type { Valeurs } from "./types";
import type { SocieteModifiee } from "./gabarit";

/**
 * L'avis de modification, rédigé.
 *
 * C'est le cabinet qui publie, et un support habilité facture au caractère : le
 * texte doit donc être juste du premier coup, et court. L'avocat n'a qu'à le
 * copier dans le formulaire du journal.
 *
 * Rien n'est deviné ici. La création compose son avis en essayant une douzaine de
 * noms de champs hérités de versions successives du formulaire ; une modification
 * range ses données proprement, et l'avis se déduit de ce qui est décidé.
 *
 * Un transfert hors ressort donne deux avis, non deux copies du même : celui du
 * ressort de départ annonce la radiation, celui d'arrivée l'immatriculation. Publier
 * deux fois le même texte est la faute courante, et le greffe la relève.
 */

export interface Avis {
  /** Le ressort où l'avis doit paraître. */
  ressort: string;
  /** Ce que l'avis annonce, en une ligne, pour le distinguer de l'autre. */
  objet: string;
  /** Le texte à copier dans le formulaire du support habilité. */
  texte: string;
}

export interface ContexteAvis {
  societe: SocieteModifiee;
  codes: string[];
  valeurs: Valeurs;
  /** Date de l'assemblée qui décide, en ISO. */
  dateAssemblee?: string | null;
  /** Ville du RCS actuel, résolue depuis le code postal par l'appelant. */
  ressortActuel?: string | null;
  /** Ville du RCS du nouveau siège, en cas de transfert. */
  ressortNouveau?: string | null;
}

function texte(valeur: string | number | null | undefined): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

function montant(valeur: string | number | null | undefined): string {
  const brut = texte(valeur);
  const lu = Number(brut.replace(",", "."));
  if (!Number.isFinite(lu)) return brut;
  return lu.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ");
}

/** La valeur en nombre, pour ce qui s'additionne avant de s'écrire. */
function nombre(valeur: string | number | null | undefined): number {
  const lu = Number(texte(valeur).replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

function adresse(rue: string, codePostal: string, ville: string): string {
  const fin = [codePostal, ville].filter(Boolean).join(" ");
  return [rue, fin].filter(Boolean).join(", ");
}

/** « 899 979 934 » : le SIREN se lit par groupes de trois dans un avis. */
export function sirenLisible(siren: string | null | undefined): string {
  const chiffres = texte(siren).replace(/\s/g, "");
  if (chiffres.length !== 9) return chiffres;
  return chiffres.slice(0, 3) + " " + chiffres.slice(3, 6) + " " + chiffres.slice(6);
}

/** Le nom complet de la forme, tel qu'un avis l'écrit. */
/**
 * La même chaîne, avec sa première lettre en capitale.
 *
 * L'en-tête d'un acte annonce la forme sous le nom de la société : « société par
 * actions simplifiée au capital de 500 euros » y commençait en minuscule, au milieu
 * d'un bloc où chaque ligne commence par une capitale. Ailleurs la forme suit une
 * virgule - « La société X, société par actions simplifiée… » - et reste en bas de
 * casse : c'est l'emploi qui décide, non le mot.
 */
export function avecMajusculeInitiale(texte: string): string {
  const net = texte.trim();
  return net ? net.charAt(0).toUpperCase() + net.slice(1) : net;
}

export function formeEnToutesLettres(forme: string | null | undefined): string {
  const f = texte(forme).toUpperCase();

  /*
   * Sept formes étaient nommées ici, et les vingt autres sortaient sous leur sigle :
   * une déclaration de confidentialité écrivait « La société X, SELAS au capital de… »
   * là où le greffe attend « société d'exercice libéral par actions simplifiée ».
   *
   * Ces sept gardent leur formulation, qui figure déjà dans des actes déposés - « SAS
   * unipersonnelle » plutôt que « à associé unique ». Les autres viennent de la table
   * des formes, qui les nomme toutes.
   */
  const noms: Record<string, string> = {
    SAS: "Société par actions simplifiée",
    SASU: "Société par actions simplifiée unipersonnelle",
    SARL: "Société à responsabilité limitée",
    EURL: "Entreprise unipersonnelle à responsabilité limitée",
    SCI: "Société civile immobilière",
    SA: "Société anonyme",
    SNC: "Société en nom collectif",
  };
  if (noms[f]) return noms[f];

  const nature = natureDeLaForme(f);
  return nature.code ? avecMajusculeInitiale(nature.libelle) : f;
}

/**
 * Qui signe l'avis.
 *
 * « Pour avis » suivi de l'organe, non du nom : c'est l'usage, et cela évite qu'un
 * changement de dirigeant rende l'avis faux au moment où il paraît.
 */
export function signature(forme: string | null | undefined): string {
  /*
   * Quatre formes signaient « la Gérance » et une seule « le Conseil d'administration ».
   * Une SELARL, une SCP, une société civile de moyens signaient donc « le Président »,
   * un organe qu'elles n'ont pas, dans un avis publié au journal.
   */
  const nature = natureDeLaForme(forme);
  if (nature.regime === "sa") return "Pour avis, le Conseil d'administration.";
  if (nature.titreDirigeant === "Gérant") return "Pour avis, la Gérance.";
  return "Pour avis, le Président.";
}

/** L'en-tête : qui est la société, telle qu'elle est encore inscrite. */
function enTete(societe: SocieteModifiee): string {
  const lignes = [texte(societe.denomination).toUpperCase()];

  const forme = formeEnToutesLettres(societe.forme);
  const capital = typeof societe.capital === "number" ? montant(societe.capital) : "";
  lignes.push(capital ? forme + " au capital de " + capital + " euros" : forme);

  const siege = adresse(texte(societe.adresse), texte(societe.codePostal), texte(societe.ville));
  if (siege) lignes.push("Siège social : " + siege);

  const siren = sirenLisible(societe.siren);
  const rcs = texte(societe.villeRcs) || texte(societe.ville);
  if (siren) lignes.push(siren + (rcs ? " RCS " + rcs : ""));

  return lignes.join("\n");
}

/**
 * Ce que l'assemblée a décidé, une phrase par décision.
 *
 * La cession de parts n'y figure pas : elle ne modifie aucune mention publiée, et
 * n'appelle donc pas d'avis.
 */
function decisions(contexte: ContexteAvis): string[] {
  const { codes, valeurs, societe } = contexte;
  const phrases: string[] = [];

  if (codes.includes("transfert_siege")) {
    const ancien = adresse(texte(societe.adresse), texte(societe.codePostal), texte(societe.ville));
    const nouveau = adresse(
      texte(valeurs.nouvelleAdresse),
      texte(valeurs.nouveauCodePostal),
      texte(valeurs.nouvelleVille)
    );
    const effet = dateEnFrancais(texte(valeurs.dateEffetTransfert) || null);

    phrases.push(
      "le siège social a été transféré du " +
        ancien +
        " au " +
        nouveau +
        (effet !== "-" ? " à compter du " + effet : "") +
        ", et l'article des statuts relatif au siège social modifié en conséquence"
    );
  }

  if (codes.includes("denomination")) {
    const nouvelle = texte(valeurs.nouvelleDenomination);
    const sigle = texte(valeurs.sigle);
    phrases.push(
      "la dénomination sociale a été modifiée et devient « " +
        nouvelle +
        " »" +
        (sigle ? ", sigle « " + sigle + " »" : "")
    );
  }

  if (codes.includes("objet_social")) {
    phrases.push("l'objet social a été modifié et devient : « " + texte(valeurs.nouvelObjetSocial) + " »");
  }

  if (codes.includes("dirigeant")) {
    const fonction = texte(valeurs.fonctionDirigeant) || "dirigeant";
    const effet = dateEnFrancais(texte(valeurs.dateEffetDirigeant) || null);
    const depuis = effet !== "-" ? " à compter du " + effet : "";
    const nature = texte(valeurs.typeChangementDirigeant);

    if (nature === "Nomination") {
      const nom = [
        texte(valeurs.nouveauDirigeantCivilite),
        texte(valeurs.nouveauDirigeantPrenom),
        texte(valeurs.nouveauDirigeantNom),
      ]
        .filter(Boolean)
        .join(" ");
      const chezLui = texte(valeurs.nouveauDirigeantAdresse);
      phrases.push(
        nom +
          (chezLui ? ", demeurant " + chezLui : "") +
          ", a été nommé " +
          fonction.toLowerCase() +
          depuis
      );
    } else if (nature === "Révocation") {
      phrases.push(
        texte(valeurs.dirigeantRevoqueNom) +
          " a cessé ses fonctions de " +
          fonction.toLowerCase() +
          depuis
      );
    } else if (nature === "Démission") {
      phrases.push(
        texte(valeurs.dirigeantDemissionnaireNom) +
          ", " +
          fonction.toLowerCase() +
          ", a démissionné de ses fonctions" +
          depuis
      );
    }
  }

  if (codes.includes("augmentation_capital")) {
    const avant = montant(valeurs.capitalActuelAugm);
    const apres = montant(valeurs.nouveauCapitalAugm);
    phrases.push(
      "le capital social a été augmenté pour être porté de " +
        avant +
        " euros à " +
        apres +
        " euros" +
        (texte(valeurs.modeAugmentation)
          ? ", par " + texte(valeurs.modeAugmentation).toLowerCase()
          : "")
    );
  }

  if (codes.includes("reduction_capital")) {
    const avant = montant(valeurs.capitalActuelRed);
    const apres = montant(valeurs.nouveauCapitalRed);
    phrases.push(
      "le capital social a été réduit de " +
        avant +
        " euros à " +
        apres +
        " euros" +
        (texte(valeurs.motifReduction)
          ? ", motivée par " + texte(valeurs.motifReduction).toLowerCase()
          : "")
    );
  }

  if (codes.includes("prorogation")) {
    phrases.push(
      "la durée de la société a été prorogée et portée à " +
        texte(valeurs.nouvelleDuree) +
        " ans"
    );
  }

  /*
   * L'apport de titres, vu du support d'annonces.
   *
   * Ce que le lecteur d'un journal doit savoir tient au capital : de combien il monte
   * et par quoi. Le nom de l'apporteur, la valorisation et le régime fiscal ne
   * figurent pas dans un avis - ils sont dans le traité, qui n'est pas public.
   *
   * Les deux augmentations comptent pour une seule phrase : c'est une assemblée, un
   * capital d'arrivée, une inscription modificative. Les annoncer séparément ferait
   * croire à deux opérations.
   */
  if (codes.includes("apport_titres")) {
    const capital = nombre(societe.capital);
    const numeraire = nombre(valeurs.apportNumeraire);
    const apport = nombre(valeurs.apportValeur);

    const parQuoi =
      numeraire > 0
        ? "par apport en numéraire et par apport en nature de titres"
        : "par apport en nature de titres";

    phrases.push(
      "le capital social a été augmenté pour être porté de " +
        montant(capital) +
        " euros à " +
        montant(capital + numeraire + apport) +
        " euros, " +
        parQuoi +
        ", et l'article des statuts relatif au capital social modifié en conséquence"
    );
  }

  return phrases;
}

/** « a, b et c » : une énumération se lit mieux qu'une liste de points. */
function enumerer(phrases: string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  return phrases.slice(0, -1).join(", ") + " et " + phrases[phrases.length - 1];
}

/**
 * Les avis à publier, rédigés.
 *
 * Un seul avis porte toutes les décisions d'une même assemblée. Le transfert hors
 * ressort en impose deux, dont les mentions finales diffèrent.
 */
export function avisAPublier(contexte: ContexteAvis): Avis[] {
  const phrases = decisions(contexte);
  if (phrases.length === 0) return [];

  const tete = enTete(contexte.societe);
  const quand = dateEnFrancais(contexte.dateAssemblee ?? null);
  const organe =
    texte(contexte.societe.forme).toUpperCase() === "SCI"
      ? "des associés"
      : "de l'assemblée générale extraordinaire";

  const chapeau =
    "Aux termes d'une décision " +
    organe +
    (quand !== "-" ? " en date du " + quand : "") +
    ", il a été décidé que " +
    enumerer(phrases) +
    ".";

  const actuel = texte(contexte.ressortActuel) || texte(contexte.societe.ville) || "";
  const nouveau = texte(contexte.ressortNouveau);
  const horsRessort =
    contexte.codes.includes("transfert_siege") &&
    changeDeRessort(contexte.ressortActuel, contexte.ressortNouveau);

  const fin = signature(contexte.societe.forme);
  const mentionDepot =
    "Les statuts à jour seront déposés au greffe du tribunal de commerce de " +
    (horsRessort ? nouveau : actuel) +
    ".";

  if (!horsRessort) {
    return [
      {
        ressort: actuel,
        objet: "Avis de modification",
        texte: [tete, chapeau, mentionDepot, fin].filter(Boolean).join("\n\n"),
      },
    ];
  }

  /*
   * Deux avis, deux mentions finales.
   *
   * Publier deux fois le même texte est la faute courante : le greffe de départ
   * attend l'annonce de la radiation, celui d'arrivée celle de l'immatriculation.
   */
  return [
    {
      ressort: actuel,
      objet: "Avis de radiation - ressort de départ",
      texte: [
        tete,
        chapeau,
        "La société sera radiée du registre du commerce et des sociétés de " + actuel + ".",
        fin,
      ].join("\n\n"),
    },
    {
      ressort: nouveau,
      objet: "Avis d'immatriculation - ressort d'arrivée",
      texte: [
        tete,
        chapeau,
        "La société sera immatriculée au registre du commerce et des sociétés de " +
          nouveau +
          ", et les statuts à jour y seront déposés.",
        fin,
      ].join("\n\n"),
    },
  ];
}
