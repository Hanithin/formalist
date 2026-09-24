import { natureDeLaForme } from "@/domain/formalite/formes";
import { agrementDeDroit } from "./cession";

/**
 * Ce que doit la société dont les titres sont apportés.
 *
 * Le parcours d'apport ne parlait que de la holding : son capital augmente, ses statuts
 * changent, son avis paraît, son dossier part au guichet. De l'autre société, celle dont
 * les titres sont apportés, il ne disait rien - alors qu'elle change d'associé, et que
 * c'est elle qui porte les gestes sans lesquels l'apport n'est opposable à personne.
 *
 * L'opération se terminait donc sur une holding au capital augmenté et une société dont
 * les registres nommaient toujours l'apporteur. Le traité disait le contraire de ce que
 * les livres de la société attestaient.
 *
 * Deux régimes, et ils n'ont presque rien en commun.
 *
 * Dans une société à parts sociales - SARL, société civile, société en nom collectif -
 * la holding est un tiers : les associés doivent l'agréer avant que les parts lui soient
 * transmises, la répartition des parts figure aux statuts, et les statuts se redéposent.
 * Dans une société par actions, les actionnaires ne figurent nulle part aux statuts :
 * c'est l'inscription en compte qui transfère la propriété, et il n'y a rien à déposer.
 *
 * Une obligation traverse les deux, et c'est celle qu'on oublie : le registre des
 * bénéficiaires effectifs. L'apporteur y passe d'une détention directe à une détention
 * par la holding, et les deux sociétés doivent le déclarer.
 */

/**
 * Quand la démarche se fait, et c'est tout l'enjeu.
 *
 * L'agrément donné après coup ne répare rien : l'apport reste attaquable. Le mettre dans
 * la même liste que ce qui suit l'apport laisserait croire qu'on peut l'y faire.
 */
export type MomentDeLaDemarche = "avant" | "le-jour" | "trente-jours" | "un-mois";

export const MOMENTS: { cle: MomentDeLaDemarche; libelle: string; detail: string }[] = [
  {
    cle: "avant",
    libelle: "Avant de signer le traité",
    detail: "Ce qui doit être acquis avant l'apport, sous peine de le fragiliser.",
  },
  {
    cle: "le-jour",
    libelle: "Le jour de l'apport",
    detail: "Ce qui rend l'apport effectif, à la date où l'assemblée l'approuve.",
  },
  {
    cle: "trente-jours",
    libelle: "Dans les trente jours",
    detail: "Le délai du registre des bénéficiaires effectifs.",
  },
  {
    cle: "un-mois",
    libelle: "Dans le mois",
    detail: "Le délai de dépôt au guichet unique.",
  },
];

/** Qui tient la plume : nous, ou le client. */
export type PorteurDeLaDemarche = "cabinet" | "client";

export interface DemarcheDeLApport {
  cle: string;
  moment: MomentDeLaDemarche;
  /** Ce qu'il y a à faire, en une ligne. */
  intitule: string;
  /** Pourquoi, et ce qui arrive si on ne le fait pas. */
  explication: string;
  /** Le texte qui l'impose, quand il y en a un. */
  fondement: string | null;
  porteur: PorteurDeLaDemarche;
  /**
   * La société concernée : celle dont les titres partent, ou celle qui les reçoit.
   *
   * Les deux ont des démarches, et les confondre serait pire que de n'en montrer
   * aucune : on irait déposer au greffe de l'une ce qui appartient à l'autre.
   */
  societe: "apportee" | "holding";
}

export interface ContexteDeLApport {
  /** La forme de la société dont les titres sont apportés. */
  apporteeForme?: string | null;
  apporteeDenomination?: string | null;
  /** Le nombre de titres apportés, et le nombre total : ils disent si elle devient unipersonnelle. */
  apportNbTitres?: string | number | null;
  apporteeNbTitres?: string | number | null;
}

function texte(valeur: unknown): string {
  if (typeof valeur === "number") return String(valeur);
  return typeof valeur === "string" ? valeur.trim() : "";
}

function nombre(valeur: unknown): number {
  if (typeof valeur === "number") return valeur;
  const lu = Number(String(valeur ?? "").replace(",", "."));
  return Number.isFinite(lu) ? lu : 0;
}

/** Le nom de la société apportée, ou de quoi la désigner quand elle n'est pas encore nommée. */
export function nomDeLaSocieteApportee(contexte: ContexteDeLApport): string {
  return texte(contexte.apporteeDenomination) || "la société dont les titres sont apportés";
}

/**
 * La holding prend-elle la totalité des titres ?
 *
 * Elle devient alors seule associée, et la société change de visage au registre : une
 * SARL y devient une SARL à associé unique, une SAS une société par actions simplifiée
 * à associé unique. Ce n'est pas une formalité de plus par excès de zèle - le registre
 * porte le nombre d'associés, et un extrait qui l'ignore ne correspond plus à la réalité.
 *
 * Le calcul ne vaut que si les deux nombres sont connus : deviner l'unipersonnalité
 * d'une société sur un champ vide annoncerait une démarche qui n'existe pas.
 */
export function devientUnipersonnelle(contexte: ContexteDeLApport): boolean {
  const apportes = nombre(contexte.apportNbTitres);
  const total = nombre(contexte.apporteeNbTitres);
  return apportes > 0 && total > 0 && apportes >= total;
}

/**
 * Tout ce que l'apport appelle, des deux côtés, dans l'ordre du temps.
 *
 * Rendu comme une liste de démarches et non comme un paragraphe : la fiche de la
 * société, l'écran de l'avocat et le rappel du parcours en ont besoin sous trois formes
 * différentes, et trois rédactions divergeraient au premier changement de loi.
 */
export function demarchesDeLApport(contexte: ContexteDeLApport): DemarcheDeLApport[] {
  const forme = texte(contexte.apporteeForme);
  if (!forme) return [];

  const nature = natureDeLaForme(forme);
  const aDesParts = nature.titres === "parts sociales";
  const nom = nomDeLaSocieteApportee(contexte);
  const demarches: DemarcheDeLApport[] = [];

  /* ------------------------------------------------------------------ Avant */

  /*
   * L'agrément, et il se donne avant.
   *
   * La holding n'est pas l'apporteur : c'est une personne morale distincte, donc un
   * tiers pour la société dont les titres sont apportés. Dans les formes où la loi
   * commande l'entrée d'un tiers, son agrément conditionne la transmission - et recueilli
   * après la signature, il ne rattrape rien.
   *
   * La règle est celle qui sert déjà aux cessions de parts : une seule écriture, un seul
   * fondement cité, et les deux parcours ne peuvent pas se contredire.
   */
  const agrement = agrementDeDroit(forme, "tiers");
  if (agrement.requis) {
    demarches.push({
      cle: "agrement",
      moment: "avant",
      intitule: "Faire agréer la holding par les associés de " + nom,
      explication:
        "La holding est une personne distincte de l'apporteur : pour " +
        nom +
        ", c'est un tiers. Les " +
        nature.associesPluriel +
        " doivent l'agréer avant que les titres lui soient transmis. Un agrément donné après la signature ne répare rien : l'apport reste attaquable.",
      fondement: agrement.motif,
      porteur: "cabinet",
      societe: "apportee",
    });
  } else {
    demarches.push({
      cle: "agrement-statutaire",
      moment: "avant",
      intitule: "Relire les clauses de " + nom + " sur l'entrée d'un nouvel actionnaire",
      explication:
        "La loi n'impose pas d'agrément dans cette forme, mais les statuts le font souvent, avec une préemption ou une inaliénabilité par-dessus. Ces clauses sont fréquentes et se lisent statuts en main, avant de signer.",
      fondement:
        "Dans une société par actions, l'agrément ne vaut que si une clause des statuts le prévoit.",
      porteur: "cabinet",
      societe: "apportee",
    });
  }

  /*
   * Le conjoint, quand les titres ne sont pas négociables.
   *
   * L'article 1832-2 du code civil vise l'emploi de biens communs pour faire un apport à
   * une société dont les parts ne sont pas négociables. Il n'a pas d'équivalent pour les
   * actions, qui le sont. La nullité se demande pendant deux ans.
   */
  if (aDesParts) {
    demarches.push({
      cle: "conjoint",
      moment: "avant",
      intitule: "Avertir le conjoint si les titres sont des biens communs",
      explication:
        "Des parts acquises pendant le mariage sous le régime de la communauté sont des biens communs. Le conjoint doit être averti de l'apport, et l'acte doit en porter la mention : sans cela, il peut en demander la nullité pendant deux ans.",
      fondement: "Article 1832-2 du code civil.",
      porteur: "client",
      societe: "apportee",
    });
  }

  /* --------------------------------------------------------------- Le jour */

  if (aDesParts) {
    demarches.push({
      cle: "statuts-apportee",
      moment: "le-jour",
      intitule: "Mettre à jour les statuts de " + nom,
      explication:
        "La répartition des parts entre " +
        nature.associesPluriel +
        " est une mention obligatoire des statuts. L'article des apports doit désormais nommer la holding à la place de l'apporteur.",
      fondement: "Article L. 223-7 du code de commerce pour la SARL.",
      porteur: "cabinet",
      societe: "apportee",
    });
  } else {
    /*
     * Ce geste-ci n'est pas une formalité : c'est le transfert lui-même.
     *
     * Dans une société par actions, la propriété résulte de l'inscription au compte de
     * l'acquéreur. Tant qu'elle n'est pas portée, la holding n'est actionnaire de rien,
     * quoi qu'en dise le traité signé le même jour.
     */
    demarches.push({
      cle: "registre-mouvements",
      moment: "le-jour",
      intitule: "Inscrire le mouvement au registre des titres de " + nom,
      explication:
        "C'est cette inscription, et elle seule, qui transfère la propriété des actions : un ordre de mouvement, une écriture au registre des mouvements de titres, et le compte de l'actionnaire mis à jour. Tant qu'elle n'est pas portée, la holding n'est actionnaire de rien.",
      fondement: "Article L. 228-1 du code de commerce.",
      porteur: "cabinet",
      societe: "apportee",
    });
  }

  /* --------------------------------------------------------- Trente jours */

  /*
   * Le registre des bénéficiaires effectifs, des deux côtés.
   *
   * C'est la démarche la plus oubliée de l'opération, et la plus coûteuse à oublier :
   * les banques suspendent comptes et virements sur un registre qui n'est pas à jour, et
   * le greffe peut radier d'office après mise en demeure.
   *
   * Les deux sociétés changent : l'apporteur cesse de détenir directement la première et
   * devient bénéficiaire effectif de la seconde, qui détient la première pour lui.
   */
  demarches.push({
    cle: "rbe-apportee",
    moment: "trente-jours",
    intitule: "Déclarer les bénéficiaires effectifs de " + nom,
    explication:
      "L'apporteur ne détient plus directement : il détient par la holding. La déclaration doit le dire, avec la chaîne de détention et les pourcentages. Un registre qui n'est pas à jour expose à une mise en demeure du greffe, et les banques y regardent.",
    fondement: "Article R. 561-1 du code monétaire et financier - trente jours.",
    porteur: "cabinet",
    societe: "apportee",
  });

  demarches.push({
    cle: "rbe-holding",
    moment: "trente-jours",
    intitule: "Déclarer les bénéficiaires effectifs de la holding",
    explication:
      "La holding a un nouveau bénéficiaire effectif, ou de nouveaux pourcentages : l'apporteur y détient désormais les titres qu'il a reçus en échange.",
    fondement: "Article R. 561-1 du code monétaire et financier - trente jours.",
    porteur: "cabinet",
    societe: "holding",
  });

  /* -------------------------------------------------------------- Un mois */

  if (aDesParts) {
    demarches.push({
      cle: "depot-statuts-apportee",
      moment: "un-mois",
      intitule: "Déposer les statuts de " + nom + " au guichet unique",
      explication:
        "Les statuts à jour et la décision qui les modifie se déposent au guichet unique, qui les transmet au registre du commerce. C'est ce dépôt qui rend le changement opposable aux tiers.",
      fondement: null,
      porteur: "cabinet",
      societe: "apportee",
    });
  }

  if (devientUnipersonnelle(contexte)) {
    demarches.push({
      cle: "unipersonnelle",
      moment: "un-mois",
      intitule: "Déclarer que " + nom + " n'a plus qu'un associé",
      explication:
        "La holding prend la totalité des titres : " +
        nom +
        " devient " +
        (aDesParts
          ? "une société à associé unique"
          : "une société par actions simplifiée à associé unique") +
        ". Le registre porte le nombre d'" +
        nature.associesPluriel +
        " : un extrait qui l'ignore ne correspond plus à la réalité.",
      fondement: null,
      porteur: "cabinet",
      societe: "apportee",
    });
  }

  return demarches;
}

/**
 * Ce qui n'est pas dû, et qu'on croit devoir.
 *
 * Dire ce qu'on ne doit pas fait partie du conseil : les sites qui vendent des annonces
 * légales affirment qu'une cession de parts en appelle une, et un client qui les lit en
 * achète une pour rien. Le même raisonnement vaut pour les statuts d'une société par
 * actions, que personne n'a à rouvrir.
 */
export function ceQuiNEstPasDu(contexte: ContexteDeLApport): string[] {
  const forme = texte(contexte.apporteeForme);
  if (!forme) return [];

  const nature = natureDeLaForme(forme);
  const nom = nomDeLaSocieteApportee(contexte);

  if (nature.titres === "parts sociales") {
    return [
      "Aucune annonce légale n'est due pour " +
        nom +
        " : le changement d'associé ne touche aucune des mentions publiées.",
    ];
  }

  return [
    "Les statuts de " +
      nom +
      " ne changent pas : les actionnaires n'y figurent pas. Il n'y a ni annonce légale, ni dépôt au greffe à prévoir pour elle.",
  ];
}
