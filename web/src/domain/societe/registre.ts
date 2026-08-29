/**
 * L'ordre du registre des sociétés, et ce qu'il annonce.
 *
 * Huit sociétés, sept lignes identiques : « En création · 1 en cours · — ». Trois
 * colonnes sur quatre répétaient la même valeur, et la seule ligne qui parlait - une
 * société en retard de soixante jours sur ses comptes - se trouvait en troisième
 * position, dans la même graisse que le reste.
 *
 * L'ordre venait de la base : `created_at desc` sur les dossiers. Ni alphabétique, ni
 * par état, ni par urgence - on ne pouvait donc ni chercher un nom, ni voir ce qui
 * presse.
 */

/** Ce que le tri a besoin de savoir d'une ligne, et rien de plus. */
export interface LignePourTri {
  denomination: string;
  etat: { cle: string };
  echeance: { limite: string; enRetard: boolean } | null;
}

/**
 * Les groupes, du plus pressant au plus dormant.
 *
 * Une société en retard passe devant tout : c'est la seule chose de cet écran sur
 * laquelle on puisse agir aujourd'hui. Viennent ensuite celles qui ont une échéance
 * datée, puis les actives sans rien à faire, puis les dossiers en cours de création -
 * qui avancent d'eux-mêmes - et les sorties de scène en dernier.
 */
const RANGS: Record<string, number> = {
  retard: 0,
  echeance: 1,
  active: 2,
  "en-creation": 3,
  "en-fermeture": 4,
  radiee: 5,
};

export function rangDuRegistre(ligne: LignePourTri): number {
  if (ligne.echeance?.enRetard) return RANGS.retard;
  if (ligne.echeance) return RANGS.echeance;
  return RANGS[ligne.etat.cle] ?? RANGS["en-creation"];
}

/**
 * Le registre, trié par ce qui presse.
 *
 * À rang égal, l'échéance la plus proche d'abord - un retard de soixante jours passe
 * devant un retard de deux - puis l'ordre alphabétique, qui est celui où l'on cherche
 * un nom qu'on connaît déjà.
 */
export function ordonnerLeRegistre<T extends LignePourTri>(lignes: T[]): T[] {
  return [...lignes].sort((a, b) => {
    const rang = rangDuRegistre(a) - rangDuRegistre(b);
    if (rang !== 0) return rang;

    if (a.echeance && b.echeance && a.echeance.limite !== b.echeance.limite) {
      return a.echeance.limite.localeCompare(b.echeance.limite);
    }

    return a.denomination.localeCompare(b.denomination, "fr");
  });
}

/**
 * Ce que le portefeuille dit de lui-même, en une phrase.
 *
 * Elle annonçait « Vos sociétés, leurs formalités en cours et leurs prochaines
 * échéances » - la description d'un tableau, non son contenu. Elle compte désormais ce
 * sur quoi on peut agir, et ne nomme que ce qui existe : un compte sans retard ne lit
 * pas « 0 société en retard ».
 */
export function resumeDuPortefeuille(lignes: LignePourTri[]): string {
  if (lignes.length === 0) return "Vos sociétés apparaîtront ici dès votre première formalité.";

  const morceaux: string[] = [];

  const enRetard = lignes.filter((l) => l.echeance?.enRetard).length;
  if (enRetard > 0) {
    morceaux.push(
      enRetard === 1 ? "1 société en retard" : enRetard + " sociétés en retard"
    );
  }

  const aVenir = lignes.filter((l) => l.echeance && !l.echeance.enRetard).length;
  if (aVenir > 0) {
    morceaux.push(aVenir === 1 ? "1 échéance à venir" : aVenir + " échéances à venir");
  }

  const enCreation = lignes.filter((l) => l.etat.cle === "en-creation").length;
  if (enCreation > 0) {
    morceaux.push(
      enCreation === 1 ? "1 création en cours" : enCreation + " créations en cours"
    );
  }

  /* Rien à signaler est une nouvelle en soi : on la donne plutôt que de se taire. */
  if (morceaux.length === 0) {
    return lignes.length === 1
      ? "Votre société est à jour : aucune échéance connue."
      : "Vos " + lignes.length + " sociétés sont à jour : aucune échéance connue.";
  }

  return morceaux.join(" · ") + ".";
}
