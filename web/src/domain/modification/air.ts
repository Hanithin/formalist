/**
 * Les accords d'investissement rapide, et ce qu'ils deviennent au capital.
 *
 * Un BSA AIR n'est pas un BSA ordinaire. L'investisseur paie le prix du bon à la
 * signature ; à la conversion il souscrit à la valeur nominale. L'argent est donc entré
 * bien avant l'augmentation, et celle-ci ne porte que le nominal des actions créées -
 * quelques centaines d'euros là où le tour en a levé quatre cent mille.
 *
 * Chaque accord retient sa propre valorisation post-money, définie comme incluant la
 * conversion de tous les bons. Les accords d'un même tour sont donc mutuellement
 * circulaires : aucun ne se résout seul. `repartition` les résout ensemble.
 */

/** Un accord signé, réduit à ce qui compte pour le calcul. */
export interface ContratAir {
  /** Le souscripteur, tel qu'il doit figurer dans les actes. */
  investisseur: string;
  /** Le prix payé pour le bon, en euros. */
  montant: number;
  /** La valorisation post-money stipulée dans cet accord, en euros. */
  valorisation: number;
  /** La date de signature, au format ISO, quand elle a pu être lue. */
  signeLe?: string | null;
}

export interface PartDUnInvestisseur extends ContratAir {
  /** Sa part du capital après conversion : montant rapporté à sa propre valorisation. */
  part: number;
  /** Le prix de souscription qui lui est applicable. */
  prix: number;
  /** Ce à quoi il a droit, avant arrondi. */
  actionsExactes: number;
  /** Ce qu'il reçoit réellement. */
  actions: number;
  /** Ce que l'arrondi lui coûte ou lui rapporte, en part de ses droits. */
  ecart: number;
}

export interface Repartition {
  actionsExistantes: number;
  /** La somme des parts. Au-delà de 1, l'opération n'a pas de solution. */
  sommeDesParts: number;
  actionsCreees: number;
  actionsApres: number;
  investisseurs: PartDUnInvestisseur[];
}

/** Au-delà de cet écart, un arrondi n'est plus une approximation mais une spoliation. */
export const ECART_TOLERE = 0.01;

/**
 * Résout un tour entier.
 *
 * La formule de chaque accord est « montant / (valorisation / nombre total d'actions
 * après conversion) ». Le nombre total figure des deux côtés : en le sortant, il vient
 * `N = N0 / (1 - somme des parts)`, et la part de chacun se lit alors directement.
 *
 * Les accords ne sont pas tous à la même valorisation - un investisseur stratégique
 * entré à deux millions et un business angel entré à trois millions et demi convertissent
 * dans le même tour. C'est pourquoi la part se calcule accord par accord et non par un
 * prix unique.
 */
export function repartition(actionsExistantes: number, contrats: ContratAir[]): Repartition {
  const parts = contrats.map((c) => (c.valorisation > 0 ? c.montant / c.valorisation : 0));
  const sommeDesParts = parts.reduce((t, p) => t + p, 0);

  /*
   * Une somme des parts supérieure à un n'a pas de solution.
   *
   * Elle signifie que les investisseurs se sont vu promettre ensemble plus de cent pour
   * cent du capital. Rendre un nombre négatif ferait sortir des actes chiffrés ; on rend
   * une répartition vide, et `anomalies` dit pourquoi.
   */
  if (sommeDesParts >= 1) {
    return { actionsExistantes, sommeDesParts, actionsCreees: 0, actionsApres: actionsExistantes, investisseurs: [] };
  }

  const actionsApresTheorique = actionsExistantes / (1 - sommeDesParts);

  const investisseurs = contrats.map((contrat, rang) => {
    const part = parts[rang];
    const actionsExactes = actionsApresTheorique * part;
    const actions = Math.round(actionsExactes);
    return {
      ...contrat,
      part,
      prix: contrat.valorisation / actionsApresTheorique,
      actionsExactes,
      actions,
      ecart: actionsExactes > 0 ? (actions - actionsExactes) / actionsExactes : 0,
    };
  });

  /*
   * Le total se somme, il ne s'arrondit pas.
   *
   * Le nombre théorique porte des décimales ; le capital, lui, se compose d'actions
   * entières. Prendre l'arrondi du total plutôt que le total des arrondis ferait une
   * annonce légale en désaccord d'une action avec le tableau qu'elle publie.
   */
  const actionsCreees = investisseurs.reduce((t, i) => t + i.actions, 0);

  return {
    actionsExistantes,
    sommeDesParts,
    actionsCreees,
    actionsApres: actionsExistantes + actionsCreees,
    investisseurs,
  };
}

/**
 * De combien diviser la valeur nominale pour que les arrondis restent honnêtes.
 *
 * Un arrondi coûte au plus une demi-action. Rapporté aux droits du plus petit
 * souscripteur, cela peut être considérable : à mille actions pour un capital de mille
 * euros, un ticket de six cents euros donne un cinquième d'action, et il n'y a pas
 * d'arrondi qui ne soit une fiction.
 *
 * Diviser le nominal multiplie le nombre d'actions sans toucher au capital. On cherche
 * le plus petit diviseur en puissance de dix qui ramène l'écart du plus petit
 * souscripteur sous le seuil.
 */
export function divisionRecommandee(
  actionsExistantes: number,
  contrats: ContratAir[],
  ecartTolere = ECART_TOLERE
): number {
  const base = repartition(actionsExistantes, contrats);
  if (base.investisseurs.length === 0) return 1;

  const partLaPlusPetite = Math.min(...base.investisseurs.map((i) => i.part));
  if (partLaPlusPetite <= 0) return 1;

  /* Une demi-action d'écart au plus : il faut donc au moins 0,5 / seuil actions au plus petit. */
  const actionsMinimales = 0.5 / ecartTolere;
  const apresRequis = actionsMinimales / partLaPlusPetite;
  const existantesRequises = apresRequis * (1 - base.sommeDesParts);

  let diviseur = 1;
  while (actionsExistantes * diviseur < existantesRequises && diviseur < 1_000_000) diviseur *= 10;
  return diviseur;
}

export interface AnomalieDuTour {
  gravite: "bloquant" | "avertissement";
  message: string;
}

/**
 * Ce qui empêche de signer, et ce qui mérite d'être dit avant.
 *
 * Bloquant : l'opération ne se calcule pas, ou un souscripteur reçoit un nombre
 * d'actions sans rapport avec ce qu'il a payé. Avertissement : elle se calcule, mais
 * une conséquence en découle qu'il vaut mieux avoir vue.
 */
export function anomaliesDuTour(
  actionsExistantes: number,
  contrats: ContratAir[],
  ecartTolere = ECART_TOLERE
): AnomalieDuTour[] {
  const anomalies: AnomalieDuTour[] = [];
  if (contrats.length === 0) return anomalies;

  const parts = repartition(actionsExistantes, contrats);

  if (parts.sommeDesParts >= 1) {
    anomalies.push({
      gravite: "bloquant",
      message:
        "Les accords promettent ensemble " +
        Math.round(parts.sommeDesParts * 100) +
        " % du capital, soit plus que la totalité. L'un d'eux retient une valorisation trop basse au regard du montant investi : l'opération n'a pas de solution en l'état.",
    });
    return anomalies;
  }

  for (const investisseur of parts.investisseurs) {
    if (investisseur.actions === 0) {
      anomalies.push({
        gravite: "bloquant",
        message:
          investisseur.investisseur +
          " n'a droit à aucune action entière : sa souscription vaut " +
          investisseur.actionsExactes.toFixed(2) +
          " action. Divisez la valeur nominale avant de convertir.",
      });
    } else if (Math.abs(investisseur.ecart) > ecartTolere) {
      anomalies.push({
        gravite: "bloquant",
        message:
          "L'arrondi fait " +
          (investisseur.ecart > 0 ? "gagner " : "perdre ") +
          Math.abs(investisseur.ecart * 100).toFixed(1) +
          " % de ses droits à " +
          investisseur.investisseur +
          ". Divisez la valeur nominale pour le ramener sous " +
          (ecartTolere * 100).toFixed(0) +
          " %.",
      });
    }
  }

  const valorisations = new Set(contrats.map((c) => c.valorisation));
  if (valorisations.size > 1) {
    anomalies.push({
      gravite: "avertissement",
      message:
        "Les accords retiennent " +
        valorisations.size +
        " valorisations différentes. Le prix par action n'est donc pas le même pour tous, et chaque souscripteur doit retrouver le sien dans le tableau annexé aux actes.",
    });
  }

  return anomalies;
}

/* ------------------------------------------- Ce que la division change, en clair */

export interface EffetDeLaDivision {
  /** Le nominal d'une action avant division, en euros. */
  nominalAvant: number;
  nominalApres: number;
  actionsAvant: number;
  actionsApres: number;
}

/**
 * Ce que devient une action quand on divise son nominal.
 *
 * Le choix se faisait à l'aveugle : « diviser par 10 » ne dit pas si l'on passe de
 * 1 euro à 10 centimes ou de 100 euros à 10. Or c'est la seule chose qui compte pour
 * décider - le nominal après division doit rester un montant qu'un acte peut écrire,
 * et le nombre d'actions un nombre qu'un registre peut tenir.
 *
 * Nul tant que les deux nombres qui le donnent manquent : un capital ou un nombre
 * d'actions à zéro ne divise rien, et afficher « 0 € » ferait croire à un calcul.
 */
export function effetDeLaDivision(
  capital: number,
  actionsExistantes: number,
  diviseur: number
): EffetDeLaDivision | null {
  if (!Number.isFinite(capital) || capital <= 0) return null;
  if (!Number.isFinite(actionsExistantes) || actionsExistantes <= 0) return null;
  if (!Number.isFinite(diviseur) || diviseur < 1) return null;

  const nominalAvant = capital / actionsExistantes;

  return {
    nominalAvant,
    nominalApres: nominalAvant / diviseur,
    actionsAvant: actionsExistantes,
    actionsApres: actionsExistantes * diviseur,
  };
}
