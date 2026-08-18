/**
 * La typographie française d'un acte.
 *
 * Un acte se relit, se signe et se dépose : il porte le sérieux du cabinet avant même
 * qu'on en lise le fond. Les gabarits sortaient « au capital de 2000 euros », « la
 * société «ACME», » sans le moindre espace dans les guillemets, et « Article 1 — Objet »
 * avec un quadratin qu'aucun de nos autres écrits n'emploie.
 *
 * Trois règles, appliquées à la génération plutôt qu'à la main :
 *
 * - l'espace fine insécable avant `; : ! ?` et à l'intérieur des guillemets français ;
 * - l'espace insécable avant une unité - euros, %, € - et dans les groupes de milliers,
 *   pour qu'un montant ne se coupe jamais en fin de ligne ;
 * - le tiret simple, jamais le cadratin ni le demi-cadratin.
 *
 * Les espaces insérées sont invisibles à l'écran mais bien présentes dans le document :
 * c'est ce qui empêche Word de couper « 2 000 » ou de laisser un « ; » commencer une
 * ligne.
 */

/** U+202F, l'espace fine insécable : avant `; : ! ?` et dans les guillemets. */
export const FINE = " ";

/** U+00A0, l'espace insécable : entre un nombre et son unité. */
export const INSECABLE = " ";

/**
 * Le tiret simple, toujours.
 *
 * Les cadratins et demi-cadratins viennent des traitements de texte, qui les posent
 * tout seuls. On ne les emploie nulle part ailleurs dans l'application.
 */
export function tiretsSimples(texte: string): string {
  return texte.replace(/[—–]/g, "-");
}

/**
 * L'espace fine devant la ponctuation double.
 *
 * On remplace l'espace existante quand il y en a une, on l'ajoute quand il n'y en a
 * pas. Les deux-points d'une heure - « 14:30 » - et ceux d'une adresse web n'en
 * reçoivent pas : ils ne sont pas de la ponctuation.
 */
export function ponctuationDouble(texte: string): string {
  return texte
    .replace(/\s*([;!?])/g, FINE + "$1")
    .replace(/([^\d\s]|^)\s*:(\s|$)/g, "$1" + FINE + ":$2");
}

/**
 * Les guillemets français, avec leur espace fine intérieure.
 *
 * « ACME » et non «ACME» : les chevrons collés au mot sont la marque d'un texte
 * fabriqué à la chaîne.
 */
export function guillemets(texte: string): string {
  return texte.replace(/«\s*/g, "«" + FINE).replace(/\s*»/g, FINE + "»");
}

/**
 * Le nombre et son unité, liés.
 *
 * Un montant coupé en fin de ligne - « 2 000 » d'un côté, « euros » de l'autre - se lit
 * mal et se relit encore plus mal dans un acte.
 */
export function unitesLiees(texte: string): string {
  return (
    texte
      /*
       * Les unités écrites en lettres, bornées par une limite de mot.
       *
       * Les symboles sont traités à part : « % » et « € » ne sont pas des caractères de
       * mot, et la limite qui suivait l'alternative ne pouvait jamais s'y poser - la
       * règle ne s'appliquait donc qu'aux unités écrites, silencieusement.
       */
      .replace(/(\d)\s+(euros?|ans?|années?|parts?|actions?)\b/g, "$1" + INSECABLE + "$2")
      .replace(/(\d)\s+([€%])/g, "$1" + INSECABLE + "$2")
      // Les groupes de milliers déjà séparés par une espace ordinaire deviennent insécables.
      .replace(/(\d)[\u0020\u202f\u00a0](?=\d{3}\b)/g, "$1" + INSECABLE)
  );
}

/**
 * Toute la typographie d'un acte, en une passe.
 *
 * L'ordre compte : les tirets d'abord - un cadratin suivi d'un deux-points ne doit pas
 * recevoir sa fine avant d'être devenu un tiret simple - puis les guillemets, la
 * ponctuation, et les unités en dernier.
 */
export function typographier(texte: string): string {
  return unitesLiees(ponctuationDouble(guillemets(tiretsSimples(texte))));
}

/**
 * Ce qui ne va pas dans un texte, pour un test ou une relecture.
 *
 * Rendre la liste plutôt qu'un simple « faux » : sur un acte de trois pages, savoir
 * qu'il reste un quadratin ne dit pas où.
 */
export function fautesDeTypographie(texte: string): string[] {
  const fautes: string[] = [];

  for (const trouve of texte.match(/.{0,20}[—–].{0,20}/g) ?? []) {
    fautes.push("cadratin : " + trouve.trim());
  }
  for (const trouve of texte.match(/«[^\s  ]/g) ?? []) {
    fautes.push("guillemet collé : " + trouve);
  }
  for (const trouve of texte.match(/[^\s  ][;!?]/g) ?? []) {
    // Les points d'interrogation d'une adresse web ne comptent pas.
    if (!/https?/.test(trouve)) fautes.push("ponctuation collée : " + trouve);
  }
  return fautes;
}
