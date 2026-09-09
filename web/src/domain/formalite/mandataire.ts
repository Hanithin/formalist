import { dateEnFrancais } from "./lettres";

/**
 * Le pouvoir donné au cabinet, et ce qu'il faut écrire dedans.
 *
 * Le guichet unique laisse un tiers déposer pour le compte d'une société, à condition
 * qu'un pouvoir le nomme. Les pouvoirs qui existaient ici étaient donnés « au porteur
 * d'un original des présentes » : cette formule vaut pour un dépôt au greffe fait par
 * qui se présente au comptoir, elle ne vaut pas pour un dépôt électronique signé sous
 * l'identité d'une personne. Le mandataire s'y nomme, avec son état civil.
 *
 * Trois parcours produisent ce document - création, modification, fermeture - à partir
 * du même gabarit. Ce module tient ce qui leur est commun : l'identité du mandataire,
 * la façon de nommer un mandant, et l'objet de la formalité. Écrit trois fois, ce
 * texte aurait divergé à la première correction portée à un seul.
 */

const TIRET = "-";

/**
 * Le mandataire, tel qu'il se désigne dans un acte.
 *
 * Il est écrit ici et non en base : ce n'est pas une donnée du dossier, c'est
 * l'identité de celui qui dépose. Le jour où un second avocat déposera, cette
 * constante deviendra une table - et le gabarit n'aura pas à changer.
 */
export const MANDATAIRE = {
  /*
   * « Monsieur », et non « Maître ».
   *
   * Le pouvoir est donné à une personne, non à un avocat exerçant son ministère : le
   * guichet unique vérifie une identité, et c'est l'état civil qui l'établit. C'est
   * aussi ce que portent les pouvoirs signés jusqu'ici par le cabinet.
   */
  civilite: "Monsieur",
  prenom: "Hani",
  nom: "MADFAI",
  neLe: "1985-04-12",
  neA: "Tournon (07300)",
  nationalite: "française",
  adresse: "34 rue Laugier à Paris (75017)",
} as const;

export interface Mandant {
  /** « Monsieur », « Madame ». L'accord de « né » en dépend. */
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
  /** Date de naissance au format ISO. */
  neLe?: string | null;
  neA?: string | null;
  nationalite?: string | null;
  /** Adresse personnelle : le mandant signe en son nom, non au siège. */
  adresse?: string | null;
}

function ou(valeur: string | null | undefined): string {
  return valeur?.trim() ? valeur.trim() : TIRET;
}

/** « Madame » et « Mme » accordent au féminin ; le reste au masculin. */
function estFeminin(civilite: string | null | undefined): boolean {
  return /^\s*(madame|mme|maîtresse)\b/i.test(civilite ?? "");
}

/** « Monsieur Mike YAMDJEU » : la civilité, le prénom, le nom. */
export function nommer(personne: Mandant): string {
  const morceaux = [personne.civilite, personne.prenom, personne.nom]
    .map((m) => m?.trim())
    .filter(Boolean);
  return morceaux.length > 0 ? morceaux.join(" ") : TIRET;
}

/**
 * L'état civil complet, en une phrase.
 *
 * C'est ce qui identifie le signataire d'un acte : un homonyme se distingue par sa
 * date et son lieu de naissance, non par son nom. Un champ manquant laisse le tiret
 * des actes plutôt que de disparaître - le trou doit se voir sur le document.
 */
export function etatCivil(personne: Mandant): string {
  return (
    nommer(personne) +
    ", né" +
    (estFeminin(personne.civilite) ? "e" : "") +
    " le " +
    dateEnFrancais(personne.neLe) +
    " à " +
    ou(personne.neA) +
    ", de nationalité " +
    (personne.nationalite?.trim() || "française") +
    ", demeurant " +
    ou(personne.adresse)
  );
}

/** Le mandataire dit comme un mandant : même phrase, mêmes accords. */
export function etatCivilDuMandataire(): string {
  return etatCivil(MANDATAIRE);
}

/**
 * Ce que le pouvoir autorise, en trois mots.
 *
 * Le corps du document ne change pas d'un parcours à l'autre - seul l'objet de la
 * formalité change, et c'est lui qui borne le pouvoir : « valable exclusivement pour
 * la formalité susvisée ». Un pouvoir qui dirait « toutes formalités » serait plus
 * large que ce que le mandant a voulu.
 */
export type ObjetDuPouvoir = "creation" | "modification" | "fermeture";

export const OBJETS: Record<ObjetDuPouvoir, string> = {
  creation: "la création",
  modification: "la modification",
  fermeture: "la dissolution et la liquidation",
};

export interface ContextePouvoir {
  /*
   * Le mandant, déjà écrit.
   *
   * Chaque parcours sait nommer une personne : la création a `identitePhysique`, qui
   * accorde « né », place le code postal de naissance entre parenthèses et ajoute la
   * situation matrimoniale. Recomposer la phrase ici l'aurait fait diverger de celle
   * que portent les autres actes du même dossier. Les parcours qui n'ont pas de
   * composeur emploient `etatCivil`, exporté juste au-dessus.
   */
  mandant: { identite: string; nom: string };
  /** « fondateur », « gérant », « président », « liquidateur ». */
  qualite: string;
  objet: ObjetDuPouvoir;
  societe: {
    denomination?: string | null;
    /** « SASU au capital de 1 000 euros » - la forme et le capital, déjà mis en forme. */
    formeEtCapital?: string | null;
    /** L'adresse du siège, sans le libellé qui la précède. */
    siege?: string | null;
    /**
     * Une société en constitution n'a pas encore de siège : elle en a un d'envisagé.
     *
     * Le mot change dans l'en-tête - « Siège social envisagé : » - et nulle part
     * ailleurs. C'est un fait du dossier, non une préférence de rédaction.
     */
    siegeEnvisage?: boolean;
    /**
     * Le greffe et le numéro, quand la société est immatriculée.
     *
     * Une création n'a ni l'un ni l'autre : la ligne disparaît alors de l'en-tête,
     * plutôt que d'annoncer un registre avec un tiret à la place du numéro.
     */
    greffe?: string | null;
    siren?: string | null;
  };
  ville?: string | null;
  /** Date de signature au format ISO. */
  date?: string | null;
}

/**
 * Les balises du gabarit `pouvoir.docx`.
 *
 * Elles portent toutes le préfixe POUVOIR_ : les trois parcours ont chacun leur
 * vocabulaire de balises - SOCIETE ici, DENOMINATION là - et un nom commun aurait
 * heurté l'un d'eux tôt ou tard.
 */
export function donneesDuPouvoir(
  contexte: ContextePouvoir
): Record<string, string | boolean> {
  const siege = contexte.societe.siege?.trim();
  const greffe = contexte.societe.greffe?.trim();
  const siren = contexte.societe.siren?.trim();

  return {
    POUVOIR_MANDANT: contexte.mandant.identite.trim() || TIRET,
    POUVOIR_MANDANT_NOM: contexte.mandant.nom.trim() || TIRET,
    POUVOIR_QUALITE: contexte.qualite.trim() || TIRET,
    POUVOIR_SOCIETE: ou(contexte.societe.denomination),
    POUVOIR_SOCIETE_FORME: ou(contexte.societe.formeEtCapital),
    /*
     * L'en-tête d'identification, comme sur les autres actes.
     *
     * Le libellé est dans les données et non dans le gabarit : une création écrit
     * « Siège social envisagé », la société n'existant pas encore, et son siège n'étant
     * pas encore le sien.
     */
    POUVOIR_SOCIETE_SIEGE:
      (contexte.societe.siegeEnvisage ? "Siège social envisagé : " : "Siège social : ") +
      (siege || TIRET),
    /*
     * La ligne d'immatriculation ne paraît que si la société l'est.
     *
     * Une section vide fait disparaître le paragraphe entier - un en-tête de création
     * ne montre pas un registre sans numéro.
     */
    POUVOIR_SOCIETE_IMMATRICULEE: Boolean(greffe && siren),
    /*
     * « RCS », et non « registre du commerce et des sociétés ».
     *
     * En toutes lettres, la ligne fait quatre-vingt-huit signes : dans un en-tête
     * centré en petit corps, elle passait à la ligne et laissait le numéro seul en
     * dessous. L'abréviation est celle des en-têtes de courrier et des cartes de
     * visite ; personne ne l'a jamais mal lue, et la ligne tient quel que soit le nom
     * du greffe.
     */
    POUVOIR_SOCIETE_RCS:
      greffe && siren ? "Immatriculée au RCS de " + greffe + " sous le numéro " + siren : "",
    POUVOIR_MANDATAIRE: etatCivilDuMandataire(),
    POUVOIR_OBJET: OBJETS[contexte.objet],
    POUVOIR_VILLE: ou(contexte.ville),
    POUVOIR_DATE: dateEnFrancais(contexte.date),
  };
}
