import { definitions, type TypeModification, type Valeurs } from "./types";
import { REMPLOI, reserveSurLaDispense } from "./apport";

/**
 * Ce qu'une modification oblige à faire au-delà du formulaire : publier, déposer,
 * fournir.
 *
 * Une seule assemblée peut décider plusieurs changements. C'est le cas courant -
 * on déménage et on change de gérant le même jour - et cela change les comptes :
 * un procès-verbal, une annonce légale, un dépôt. Facturer et publier trois fois
 * ce qui se fait une fois serait faux, et cher pour le client.
 */

/**
 * Le titre sous lequel les statuts en vigueur sont joints au dossier.
 *
 * Ils sont enregistrés comme document du dossier - c'est ainsi que l'éditeur de
 * retouches les relit page par page - mais ils ne sont pas un acte produit par le
 * cabinet : ils viennent du registre, ou du client. La liste des actes les écarte par
 * ce titre, sans quoi ils s'y affichaient « Relu, à votre disposition », comme si nous
 * les avions rédigés.
 */
export const TITRE_STATUTS_EN_VIGUEUR = "Statuts en vigueur";

/**
 * Le titre sous lequel les statuts retouchés sont joints au dossier.
 *
 * Ils sortent de l'éditeur de retouches, mais ne sont pas remis au client dans la
 * foulée : l'avocat les revoit avant qu'ils partent au greffe. Le titre est ici, et
 * non dans la route qui les produit, parce que le dépôt des actes doit le connaître
 * pour ne pas les emporter en régénérant le procès-verbal.
 */
export const TITRE_STATUTS_A_JOUR = "Statuts mis à jour";

/* ---------------------------------------------------------------- Publication */

export interface Publication {
  /** Où paraît l'avis : le ressort de l'ancien siège, ou celui du nouveau. */
  ressort: string;
  motif: string;
}

/**
 * Les types dont le changement figure sur l'extrait et appelle donc un avis.
 *
 * La cession de parts n'y est pas : elle ne modifie aucune des mentions publiées,
 * et exiger une annonce ferait payer une publication inutile. Elle impose en
 * revanche le dépôt des statuts à jour, ce que dit piecesAFournir.
 */
const AVIS_REQUIS: TypeModification[] = [
  "transfert_siege",
  "denomination",
  "dirigeant",
  "objet_social",
  "augmentation_capital",
  "reduction_capital",
  "prorogation",
  // L'apport de titres augmente le capital de la bénéficiaire : la mention publiée
  // change, donc un avis est dû, comme pour toute augmentation.
  "apport_titres",
];

/**
 * Le siège change-t-il de ressort ?
 *
 * On compare les villes de RCS, non les départements : le tribunal compétent n'est
 * pas toujours celui du département, et c'est le greffe destinataire qui décide du
 * nombre d'avis. Les deux ressorts sont calculés par l'appelant, qui seul a la
 * table des codes postaux.
 */
export function changeDeRessort(
  ressortActuel: string | null | undefined,
  ressortNouveau: string | null | undefined
): boolean {
  const a = (ressortActuel ?? "").trim().toLowerCase();
  const b = (ressortNouveau ?? "").trim().toLowerCase();
  if (!a || !b) return false;
  return a !== b;
}

export interface ContextePublication {
  codes: string[];
  ressortActuel?: string | null;
  ressortNouveau?: string | null;
}

/**
 * Les avis à publier.
 *
 * Un seul avis porte tous les changements d'une même assemblée : c'est l'usage, et
 * le support facture à l'avis. Le transfert hors ressort fait exception - l'article
 * R. 210-19 du code de commerce impose une parution dans le département de départ
 * et une dans celui d'arrivée, faute de quoi les tiers de l'ancien ressort
 * n'apprendraient jamais le déménagement.
 */
export function publicationsAPrevoir(contexte: ContextePublication): Publication[] {
  const concernes = definitions(contexte.codes).filter((d) => AVIS_REQUIS.includes(d.code));
  if (concernes.length === 0) return [];

  const motif = concernes.map((d) => d.libelle).join(", ");
  const actuel = contexte.ressortActuel?.trim() || "Ressort du siège";

  const transfert = contexte.codes.includes("transfert_siege");
  const horsRessort =
    transfert && changeDeRessort(contexte.ressortActuel, contexte.ressortNouveau);

  if (!horsRessort) return [{ ressort: actuel, motif }];

  return [
    { ressort: actuel, motif: motif + " - avis dans le ressort de départ" },
    {
      ressort: contexte.ressortNouveau!.trim(),
      motif: motif + " - avis dans le ressort d'arrivée",
    },
  ];
}

/* ------------------------------------------------------------------- Statuts */

/**
 * Les changements qui touchent au texte des statuts.
 *
 * Le changement de dirigeant n'y figure pas : sauf à ce que les statuts nomment le
 * gérant, ils n'ont pas à être retouchés. C'est pourquoi la retouche des statuts
 * est proposée et non imposée - c'est l'avocat qui tranche, statuts en main.
 */
const STATUTS_TOUCHES: TypeModification[] = [
  "transfert_siege",
  "denomination",
  "objet_social",
  "augmentation_capital",
  "reduction_capital",
  "cession_parts",
  "prorogation",
  "apport_titres",
];

export function statutsAMettreAJour(codes: string[]): boolean {
  return definitions(codes).some((d) => STATUTS_TOUCHES.includes(d.code));
}

/** L'article des statuts que ce changement vise, pour guider la retouche. */
export const ARTICLE_VISE: Partial<Record<TypeModification, string>> = {
  transfert_siege: "Siège social",
  denomination: "Dénomination sociale",
  objet_social: "Objet",
  augmentation_capital: "Capital social",
  reduction_capital: "Capital social",
  cession_parts: "Apports",
  prorogation: "Durée",
  apport_titres: "Capital social",
};

/* -------------------------------------------------------------------- Pièces */

export interface PieceAFournir {
  identifiant: string;
  titre: string;
  explication: string;
  obligatoire: boolean;
  formats: string[];
}

const PDF_OU_IMAGE = [".pdf", ".jpg", ".jpeg", ".png"];

/**
 * Les justificatifs, selon ce qui est décidé.
 *
 * Certains dépendent d'une valeur saisie et non du seul type : un apport en nature
 * appelle un commissaire aux apports, un apport en numéraire une attestation de
 * dépôt. Réclamer les deux à tout le monde ferait renoncer.
 */
export function piecesAFournir(codes: string[], valeurs: Valeurs = {}): PieceAFournir[] {
  const pieces: PieceAFournir[] = [];

  if (codes.includes("transfert_siege")) {
    /*
     * La pièce dit ce qu'on attend d'elle, selon le mode choisi.
     *
     * « Bail, contrat de domiciliation ou titre de propriété » laissait au client le
     * soin de deviner lequel des trois le concernait, et surtout ce que le sien devait
     * porter. Un contrat de domiciliation sans le numéro d'agrément préfectoral du
     * domiciliataire se fait refuser au dépôt : autant le dire au moment où on le
     * dépose.
     */
    const chezUnDomiciliataire = valeurs.nouveauModeDomiciliation === "Société de domiciliation";

    pieces.push({
      identifiant: "jouissance-locaux",
      titre: chezUnDomiciliataire
        ? "Contrat de domiciliation"
        : "Justificatif de jouissance du nouveau local",
      explication: chezUnDomiciliataire
        ? "Au nom de la société, en cours de validité, portant le numéro d'agrément préfectoral du domiciliataire - sans lui, le greffe refuse le transfert."
        : "Bail, contrat de domiciliation ou titre de propriété, au nom de la société et de moins de trois mois.",
      obligatoire: true,
      formats: PDF_OU_IMAGE,
    });
  }

  if (codes.includes("dirigeant") && valeurs.typeChangementDirigeant === "Nomination") {
    pieces.push({
      identifiant: "identite-dirigeant",
      titre: "Pièce d'identité du nouveau dirigeant",
      explication: "Carte d'identité ou passeport en cours de validité, recto et verso.",
      obligatoire: true,
      formats: PDF_OU_IMAGE,
    });
  }

  if (codes.includes("augmentation_capital")) {
    if (valeurs.modeAugmentation === "Apport en numéraire") {
      pieces.push({
        identifiant: "depot-fonds",
        titre: "Attestation de dépôt des fonds",
        explication: "Délivrée par la banque après le versement de l'augmentation.",
        obligatoire: true,
        formats: [".pdf"],
      });
    }
    /*
     * L'arrêté de compte d'une compensation de créances.
     *
     * La créance doit être liquide et exigible : c'est lui qui l'établit. Le mode
     * n'existait pas, donc la pièce n'était jamais réclamée.
     */
    if (valeurs.modeAugmentation === "Compensation de créances") {
      pieces.push({
        identifiant: "arrete-compte",
        titre: "Arrêté de compte de la créance",
        explication:
          "Il établit que la créance est liquide et exigible. Certifié par le commissaire aux comptes s'il en existe un, à défaut établi par l'expert-comptable.",
        obligatoire: true,
        formats: [".pdf"],
      });
    }

    /*
     * Le rapport du commissaire aux apports, sauf dispense.
     *
     * Les associés peuvent s'en dispenser à l'unanimité si aucun apport ne dépasse
     * 30 000 € et si le total des apports en nature reste sous la moitié du capital
     * (art. L. 223-33 renvoyant à L. 223-9, et art. D. 223-6-1). Le réclamer alors
     * bloquerait un dossier sur une pièce que la loi n'exige pas - au prix, il est
     * vrai, d'une responsabilité solidaire de cinq ans sur la valeur retenue.
     */
    if (
      valeurs.modeAugmentation === "Apport en nature" &&
      valeurs.dispenseCommissaire !== "Oui, à l'unanimité"
    ) {
      pieces.push({
        identifiant: "commissaire-apports",
        titre: "Rapport du commissaire aux apports",
        explication: "Il évalue le bien apporté. Sa désignation précède l'assemblée.",
        obligatoire: true,
        formats: [".pdf"],
      });
    }
  }

  /*
   * L'apport de titres : ce qui fonde la valeur retenue.
   *
   * Une pièce dans tous les cas, mais pas la même. Avec commissaire aux apports, son
   * rapport ; sans lui, l'attestation par laquelle les parties assument la valeur -
   * et la responsabilité solidaire de cinq ans qui va avec.
   *
   * Le dossier n'est jamais sans justificatif de valeur : c'est ce chiffre que le
   * report d'imposition prend pour base, et l'administration le contrôle des années
   * plus tard, quand plus personne n'a le détail du calcul en tête.
   */
  if (codes.includes("apport_titres")) {
    const avecCommissaire = valeurs.apportCommissaire === "Oui";

    pieces.push(
      avecCommissaire
        ? {
            identifiant: "apport-rapport-commissaire",
            titre: "Rapport du commissaire aux apports",
            explication:
              "Il évalue les titres apportés sous sa responsabilité. Sa désignation précède la décision d'augmentation de capital.",
            obligatoire: true,
            formats: [".pdf"],
          }
        : {
            identifiant: "apport-attestation-valeur",
            titre: "Attestation de valorisation des titres",
            explication:
              "Faute de commissaire aux apports, elle porte la méthode retenue et le calcul. Les associés répondent solidairement de cette valeur pendant cinq ans, et l'administration s'y reportera si elle vérifie le report d'imposition.",
            obligatoire: true,
            formats: [".pdf"],
          }
    );

    pieces.push({
      identifiant: "apport-comptes-societe",
      titre: "Derniers comptes de la société dont les titres sont apportés",
      explication:
        "Bilan et compte de résultat du dernier exercice clos. C'est sur eux que la valorisation s'appuie ; ils la rendent vérifiable.",
      obligatoire: false,
      formats: [".pdf"],
    });
  }

  return pieces;
}

/**
 * Le document que l'assemblée produit et que le greffe attend, en plus du dossier.
 *
 * La déclaration de non-condamnation n'est pas une pièce à téléverser mais un acte
 * que nous produisons : elle est ici pour mémoire de l'obligation.
 */
export function obligationsParticulieres(
  codes: string[],
  valeurs: Valeurs = {},
  /*
   * La forme de la société modifiée.
   *
   * Elle ne se lit pas dans les valeurs saisies, et pourtant elle décide : la dispense
   * de commissaire aux apports est écrite pour les SARL, contestée pour les sociétés
   * par actions. Sans elle, l'avertissement ne pourrait pas être posé au bon endroit,
   * ni tu au bon endroit.
   */
  forme?: string | null
): string[] {
  const dits: string[] = [];

  if (codes.includes("dirigeant") && valeurs.typeChangementDirigeant === "Nomination") {
    dits.push(
      "Le nouveau dirigeant signera une déclaration attestant qu'il n'a jamais été condamné et indiquant le nom de ses parents. Nous la préparons avec les actes, il n'a qu'à la signer."
    );
  }

  if (codes.includes("reduction_capital") && valeurs.motifReduction === "Remboursement aux associés") {
    dits.push(
      "Cette réduction rembourse les associés au lieu d'effacer des pertes : la loi laisse alors aux créanciers de la société un délai pour s'y opposer devant le tribunal. Le dépôt au guichet unique n'a lieu qu'une fois ce délai écoulé."
    );
  }

  /*
   * La dispense de commissaire aux apports se paie d'une responsabilité.
   *
   * Elle n'est pas gratuite : sans commissaire, les associés répondent solidairement de
   * la valeur retenue pendant cinq ans (art. L. 223-9). On le dit avant, non après.
   */
  if (
    codes.includes("augmentation_capital") &&
    valeurs.modeAugmentation === "Apport en nature" &&
    valeurs.dispenseCommissaire === "Oui, à l'unanimité"
  ) {
    dits.push(
      "Vous vous dispensez de commissaire aux apports : ce sont donc les associés qui garantissent la valeur donnée au bien apporté. Pendant cinq ans, si un tiers la conteste et obtient gain de cause, chacun d'eux peut être appelé à payer la différence, solidairement (article L. 223-9 du code de commerce)."
    );
  }

  /*
   * L'information du conjoint, et ce qu'elle engage.
   *
   * Ce n'est pas une formalité de plus : sans elle, le conjoint peut faire annuler
   * l'apport pendant deux ans, et il peut réclamer la moitié des parts souscrites - y
   * compris des années après, tant que la société n'est pas dissoute. Celui qui apporte
   * un bien commun doit le savoir avant de signer, non le découvrir sur assignation.
   */
  if (
    codes.includes("augmentation_capital") &&
    valeurs.apportBienCommun === "Oui : le bien apporté est un bien commun"
  ) {
    dits.push(
      "Le bien apporté étant un bien commun, votre conjoint doit en être averti avant la décision, et l'acte doit porter la mention de cet avertissement. Sans elle, il peut demander l'annulation de l'apport pendant deux ans à compter du jour où il l'apprend (article 1832-2 du code civil)."
    );

    if (valeurs.conjointRevendication === "Non : il renonce à la qualité d'associé") {
      dits.push(
        "Votre conjoint renonce aujourd'hui à la qualité d'associé, et le procès-verbal le constate. Il pourra toutefois la revendiquer plus tard pour la moitié des parts souscrites, tant que la société n'est pas dissoute : la renonciation notée dans l'acte est ce qui rend cette revendication difficile à soutenir."
      );
    } else if (valeurs.conjointRevendication === "Oui : il revendique la moitié des parts") {
      dits.push(
        "Votre conjoint revendiquant la qualité d'associé, la moitié des parts souscrites lui revient : la répartition du capital en tient compte, et il signe le procès-verbal au même titre que les autres associés."
      );
    }
  }

  if (codes.includes("cession_parts")) {
    dits.push(
      "Tant que les statuts à jour ne sont pas déposés au greffe, la cession ne vaut qu'entre vous : une banque ou un créancier peut continuer de traiter l'ancien associé comme propriétaire des parts. L'acte signé n'y suffit plus depuis le décret du 30 avril 2026 - c'est le dépôt qui compte."
    );
  }

  if (codes.includes("prorogation")) {
    dits.push(
      "La décision doit être prise avant la date de fin inscrite dans les statuts, et les associés consultés au moins un an avant cette date (article 1844-6 du code civil)."
    );
  }

  /*
   * L'apport de titres engage pour des années, pas pour une formalité.
   *
   * Le report d'imposition se suit chaque année et se perd sur des événements qui
   * n'ont plus rien à voir avec l'apport - une revente par la holding, un départ à
   * l'étranger. Ce n'est pas au client de le découvrir à ce moment-là.
   */
  if (codes.includes("apport_titres")) {
    if (valeurs.apportControle === "Non") {
      dits.push(
        "Comme l'apporteur ne contrôle pas la société qui reçoit les titres, l'impôt sur le gain est mis en attente sans autre formalité : rien à déclarer chaque année, aucune obligation de réinvestir (sursis d'imposition, article 150-0 B du code général des impôts)."
      );
    } else {
      dits.push(
        "L'impôt sur le gain est reporté, non effacé : l'apporteur le devra si le report tombe un jour. Tant qu'il dure, il le rappelle chaque année dans sa déclaration de revenus, sur le formulaire 2074 puis 2074-I (article 150-0 B ter du code général des impôts)."
      );
      dits.push(
        "Si la holding revend les titres apportés moins de " +
          REMPLOI.franchiseAns +
          " ans après l'apport, l'impôt reporté devient exigible - à moins qu'elle ne réinvestisse au moins " +
          Math.round(REMPLOI.quota * 100) +
          " % du prix de vente dans les " +
          REMPLOI.delaiMois +
          " mois, et conserve cet investissement " +
          REMPLOI.conservationAns +
          " ans. Ces seuils sont ceux de la loi de finances pour 2026, pour les ventes réalisées à partir du " +
          REMPLOI.applicableDepuis +
          "."
      );
    }

    if (valeurs.apportCommissaire !== "Oui") {
      dits.push(
        "Sans commissaire aux apports, ce sont les associés qui garantissent la valeur donnée aux titres. Pendant cinq ans, si un tiers la conteste et obtient gain de cause, chacun d'eux peut être appelé à payer la différence, solidairement."
      );

      /*
       * Ce que la dispense a de fragile, dit avant de s'y engager.
       *
       * On ne l'interdit pas - la pratique l'admet largement - mais on ne laisse pas
       * non plus quelqu'un s'y engager en croyant le terrain sûr.
       */
      const reserve = reserveSurLaDispense(forme);
      if (reserve) dits.push(reserve);
    }

    dits.push(
      "L'enregistrement du traité d'apport auprès des impôts ne coûte rien : cette formalité est gratuite (article 810-I du code général des impôts)."
    );
  }

  return dits;
}
