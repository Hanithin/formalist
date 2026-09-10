/**
 * Lire un accord d'investissement rapide plutôt que de le retaper.
 *
 * Un tour d'amorçage se conclut en vingt accords, et chacun porte quatre chiffres qui
 * comptent : le montant investi, la valorisation retenue, l'identité du souscripteur et
 * la date de signature. Les recopier vingt fois à la main, c'est vingt occasions de se
 * tromper sur le seul document que personne ne relira avant le refus du greffe.
 *
 * Deux gabarits circulent, l'anglais « Fast Investment Agreement » et le français
 * « Accord d'investissement rapide ». Ils ne nomment pas les mêmes choses aux mêmes
 * endroits, et le second remplit ses blancs par des champs de formulaire dont le texte
 * extrait tombe une ligne au-dessus de son étiquette. Ce module encaisse les deux.
 *
 * Ce qu'il rend est une proposition, jamais une vérité : l'écran l'affiche pour
 * correction. Un champ qu'il n'a pas su lire vaut mieux vide que deviné.
 */

export interface AirLu {
  investisseur: string | null;
  montant: number | null;
  valorisation: number | null;
  signeLe: string | null;
  /** Ce qu'il n'a pas su lire, nommé pour que l'écran le demande. */
  manques: string[];
}

/**
 * Un nombre écrit à la française, à l'anglaise, ou coupé par un champ de formulaire.
 *
 * « 3,500,000 », « 2.000.000 », « 5 000 » et « 15  ␣␣␣  000 » désignent le même genre de
 * somme. On retire tout ce qui n'est pas un chiffre : ces montants sont toujours entiers,
 * aucun accord ne stipule des centimes.
 */
export function nombreDUnAccord(brut: string): number | null {
  const chiffres = brut.replace(/[^\d]/g, "");
  if (!chiffres) return null;
  const valeur = Number(chiffres);
  return Number.isFinite(valeur) && valeur > 0 ? valeur : null;
}

/** Les tirets de champ de formulaire ne sont pas du texte : ils marquent un blanc. */
function estUnBlanc(texte: string): boolean {
  return !texte.trim() || /^[_\s.·]+$/.test(texte);
}

/**
 * La valeur d'un champ de formulaire, où qu'elle soit tombée.
 *
 * Le texte extrait d'un PDF suit la position des caractères, non la logique du
 * document : la valeur saisie se retrouve tantôt à la suite de son étiquette, tantôt
 * sur la ligne précédente, tantôt sur la suivante. On regarde les trois, dans cet
 * ordre, et on retient la première qui porte autre chose que des tirets.
 */
export function valeurDuChamp(lignes: string[], etiquette: RegExp): string | null {
  for (let rang = 0; rang < lignes.length; rang++) {
    const trouve = etiquette.exec(lignes[rang]);
    if (!trouve) continue;

    const suite = lignes[rang].slice(trouve.index + trouve[0].length);
    for (const candidat of [suite, lignes[rang - 1] ?? "", lignes[rang + 1] ?? ""]) {
      const propre = candidat.replace(/[_]{2,}/g, " ").trim();
      if (!estUnBlanc(propre)) return propre.replace(/\s{2,}/g, " ");
    }
  }
  return null;
}

/**
 * Le document sur une seule ligne.
 *
 * Les champs de formulaire sont dessinés par-dessus le texte : « 15 000 » s'extrait en
 * « €15 ________ » sur une ligne et « 000 euros » sur la suivante. Une expression
 * régulière ne franchit pas ce retour à la ligne, et le montant se perdait. À plat, les
 * deux morceaux se rejoignent.
 */
function aPlat(texte: string): string {
  return texte.replace(/_{2,}/g, " ").replace(/\s+/g, " ");
}

/** Le gabarit anglais nomme la société « Company », le français « Société ». */
function estEnAnglais(texte: string): boolean {
  return /FAST INVESTMENT AGREEMENT/i.test(texte) || /AIR Investor/i.test(texte);
}

/**
 * Le montant investi.
 *
 * L'anglais l'écrit « a total amount of €15 000 euros », le français « pour un montant
 * total de cent mille euros (100.000 €) » - où seul le chiffre entre parenthèses fait
 * foi, la lettre étant parfois restée celle du modèle.
 */
function lireLeMontant(texte: string, anglais: boolean): number | null {
  if (anglais) {
    /*
     * Le symbole n'est pas toujours celui de la monnaie.
     *
     * Un accord signé porte « $626 euros » : le modèle a été rempli sur un poste dont
     * le clavier ne donnait pas l'euro. Le mot « euros » qui suit tranche - on accepte
     * donc n'importe quel symbole, et le chiffre seul fait foi.
     */
    const trouve = /total amount of\s*[€$£]?\s*([\d\s.,_]{1,30}?)\s*euros/i.exec(aPlat(texte));
    return trouve ? nombreDUnAccord(trouve[1]) : null;
  }
  const trouve = /montant total de[^(]{0,120}\(\s*([\d\s.,]{3,20})\s*€\s*\)/i.exec(texte);
  return trouve ? nombreDUnAccord(trouve[1]) : null;
}

/**
 * La valorisation post-money.
 *
 * Elle est le second chiffre du contrat et le plus lourd de conséquences : c'est elle
 * qui fixe le prix par action. Deux accords d'un même tour ne la retiennent pas
 * toujours identique, et une valorisation lue de travers dilue tout le monde.
 */
function lireLaValorisation(texte: string, anglais: boolean): number | null {
  if (anglais) {
    const trouve =
      /contractually set at\s*([\d\s.,]{5,20})\s*euros/i.exec(aPlat(texte)) ??
      /Post-money Valuation[^.]{0,200}?([\d]{1,3}(?:[.,\s]\d{3}){1,3})\s*euros/i.exec(texte);
    return trouve ? nombreDUnAccord(trouve[1]) : null;
  }
  const trouve =
    /[Vv]alorisation [Pp]ost-[Mm]oney[^(]{0,200}?\(\s*([\d\s.,]{5,20})\s*€\s*\)/.exec(texte) ??
    /fix[ée]e? contractuellement [àa][^(]{0,120}\(\s*([\d\s.,]{5,20})\s*€\s*\)/i.exec(texte) ??
    /valorisation post-money[^(]{0,200}\(\s*([\d\s.,]{5,20})\s*€\s*\)/i.exec(texte);
  return trouve ? nombreDUnAccord(trouve[1]) : null;
}

/** « 10/10/2025 », « 07/16/2025 », « 24 mars 2026 » : on rend l'ISO quand on peut trancher. */
export function dateDUnAccord(brut: string): string | null {
  const chiffres = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(brut);
  if (chiffres) {
    const a = Number(chiffres[1]);
    const b = Number(chiffres[2]);
    /*
     * Deux gabarits, deux conventions.
     *
     * « 07/16/2025 » ne peut être qu'américain, « 24/03/2026 » que français. Quand les
     * deux nombres sont inférieurs à treize, rien ne tranche : on retient le français,
     * qui est celui des actes, et l'écran laisse corriger.
     */
     const jour = a > 12 ? a : b > 12 ? b : a;
     const mois = a > 12 ? b : b > 12 ? a : b;
    if (jour >= 1 && jour <= 31 && mois >= 1 && mois <= 12) {
      return chiffres[3] + "-" + String(mois).padStart(2, "0") + "-" + String(jour).padStart(2, "0");
    }
  }
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(brut);
  return iso ? iso[0] : null;
}

/** Le souscripteur, personne physique ou morale, dans l'un ou l'autre gabarit. */
function lireLInvestisseur(texte: string, lignes: string[], anglais: boolean): string | null {
  if (anglais) {
    return (
      valeurDuChamp(lignes, /Corporate name\s*:/i) ??
      valeurDuChamp(lignes, /Company Name\s*:/i) ??
      valeurDuChamp(lignes, /-\s*Mr\.\/Ms\.\s*/i)
    );
  }
  /*
   * Le français désigne l'investisseur en toutes lettres, puis le résume entre
   * guillemets. Le résumé est ce qui figure dans les actes, la dénomination complète
   * dans les comparutions : on retient la dénomination, plus précise.
   *
   * La recherche commence après la comparution de l'émetteur : les deux parties sont
   * introduites par la même formule, et la première rencontrée est la société qui émet
   * les bons. Sans cette coupure, chaque accord désignait l'émetteur comme souscripteur.
   */
  const coupure = /D['’]UNE PART|ci-après désignée la «\s*Société\s*»/.exec(texte);
  const apresLEmetteur = coupure ? texte.slice(coupure.index + coupure[0].length) : texte;
  const societe = /La société\s+([^,\n]{2,120}),/.exec(apresLEmetteur);
  if (societe) return societe[1].trim();
  const guillemets = /ci-après désignée? l['’]«\s*Investisseur\s*»\s*ou\s*«\s*([^»]{2,80})\s*»/.exec(apresLEmetteur);
  return guillemets ? guillemets[1].trim() : null;
}

/** Lit un accord et dit ce qu'il n'a pas su lire. */
export function lireUnAir(texte: string): AirLu {
  const lignes = texte.split("\n");
  const anglais = estEnAnglais(texte);

  const signature =
    /In [A-Za-zÀ-ÿ' -]+, on\s*([^\n(]{4,30})/i.exec(texte) ??
    /Fait à [A-Za-zÀ-ÿ' -]+,? le\s*([^\n,]{4,30})/i.exec(texte) ??
    /Date\s*:\s*([\d/.-]{8,12})/i.exec(texte);

  const lu: AirLu = {
    investisseur: lireLInvestisseur(texte, lignes, anglais),
    montant: lireLeMontant(texte, anglais),
    valorisation: lireLaValorisation(texte, anglais),
    signeLe: signature ? dateDUnAccord(signature[1]) : null,
    manques: [],
  };

  if (!lu.investisseur) lu.manques.push("l'identité du souscripteur");
  if (!lu.montant) lu.manques.push("le montant investi");
  if (!lu.valorisation) lu.manques.push("la valorisation post-money");
  if (!lu.signeLe) lu.manques.push("la date de signature");

  return lu;
}
