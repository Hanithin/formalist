import { dateEnFrancais, nombreEnFrancais, sirenLisible } from "./lettres";
import { apportsDe, valeurNominale } from "./capital";
import { estUnipersonnelle, regle } from "./formes";
import type { PersonneMorale, PersonnePhysique } from "./etat-civil";
import type { Associe, Brouillon, Dirigeant } from "./parcours";

/**
 * Les champs attendus par les gabarits Word.
 *
 * Ces noms figurent dans les vingt-trois fichiers .docx de création : ce sont eux
 * qui font foi, et ils ne se devinent pas. Ce module est écrit à partir de leur
 * inventaire - 319 champs et 83 sections conditionnelles - et non à partir du
 * JavaScript qui les remplissait.
 *
 * Une première version tirée de form-data.js avait manqué la moitié des noms :
 * l'ancien code les écrivait tantôt en propriétés d'objet non quotées, tantôt en
 * affectations indexées, et l'extraction n'avait vu que les secondes. Conséquence
 * mesurée sur cinq actes produits : le nom de la société, son adresse et sa forme
 * n'apparaissaient nulle part - les gabarits attendent NOM_SOCIETE et ADRESSE_SIEGE
 * là où nous écrivions SOCIETE_NOM et SOCIETE_ADRESSE.
 *
 * Quatre conventions viennent de l'original et sont conservées :
 *
 *   - un champ vide s'écrit « - » et non "" : dans un acte, un blanc se lit comme
 *     un oubli, un tiret comme une absence assumée ;
 *   - les nationalités manquantes valent « Française », la situation matrimoniale
 *     « célibataire », en minuscules parce qu'elles tombent au milieu d'une phrase ;
 *   - les personnes sont numérotées de 1 à 10, avec HAS_ASSOC_n pour que le gabarit
 *     sache où s'arrêter. Au-delà de dix associés, les statuts passent par un avocat ;
 *   - la rémunération n'est pas un mot mais une phrase entière, dont le décideur
 *     dépend de la forme : l'assemblée des associés, l'assemblée générale, ou
 *     l'actionnaire unique.
 */

const MAXIMUM_ASSOCIES = 10;
const MAXIMUM_DIRIGEANTS = 3;
const TIRET = "-";

/**
 * Les montants s'écrivent à la française : « 1 500 » et non « 1500 ».
 *
 * Le séparateur est ramené à une espace ordinaire : selon la version d'ICU,
 * toLocaleString rend une espace fine insécable (U+202F) ou une insécable
 * (U+00A0), et la première manque dans certaines polices - elle apparaît alors
 * comme un carré au milieu d'un montant, dans un acte déposé au greffe.
 */
function montant(valeur: number): string {
  return valeur
    .toLocaleString("fr-FR", { maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");
}

function ou(valeur: string | undefined | null, defaut = TIRET): string {
  return valeur?.trim() ? valeur.trim() : defaut;
}

/** « Monsieur Jean DUPONT » : la civilité fait partie du nom dans un acte. */
/**
 * « Monsieur Hani MADFAI » : le prénom, puis le nom en capitales.
 *
 * Une seule convention pour tout le dossier. Le nom sortait en capitales là où le
 * gabarit demandait la clé NOM, et tel qu'on l'avait tapé partout ailleurs : la
 * déclaration disait « Monsieur Hani Madfai » quand le procès-verbal, dans le même
 * dossier et pour la même personne, disait « Monsieur MADFAI Hani ». Deux écritures
 * pour un seul état civil, dans des pièces qui se lisent ensemble.
 *
 * L'ordre est celui de la phrase - on nomme quelqu'un par son prénom d'abord - et les
 * capitales marquent le nom de famille, comme l'état civil l'écrit.
 */
function civiliteNomPrenom(personne: PersonnePhysique): string {
  const nom = personne.nom?.trim();
  const morceaux = [personne.civilite, personne.prenom, nom ? nom.toUpperCase() : ""].filter(
    (m) => m?.trim()
  );
  return morceaux.length ? morceaux.join(" ") : TIRET;
}

/**
 * Le nom de jeune fille, déduit du nom de la mère.
 *
 * Le formulaire ne le demande pas : il le tire du champ « Nom et prénom de la
 * mère », en prenant le dernier mot écrit en capitales - c'est ainsi que l'état
 * civil s'écrit. À défaut, le dernier mot passe en capitales.
 */
export function nomDeJeuneFille(nomDeLaMere: string | undefined): string {
  const propre = nomDeLaMere?.trim();
  if (!propre) return TIRET;

  const mots = propre.split(/\s+/);
  for (let i = mots.length - 1; i >= 0; i--) {
    if (mots[i].length > 1 && mots[i] === mots[i].toUpperCase()) return mots[i];
  }
  return mots[mots.length - 1].toUpperCase();
}

/** La personne physique derrière un associé, ou un objet vide pour une société. */
function physique(associe: Associe | undefined): PersonnePhysique {
  return associe?.personne ?? {};
}

/** L'état civil d'un dirigeant : le sien, ou celui de l'associé qu'il reprend. */
/**
 * Le dirigeant tel que l'annonce légale le nomme.
 *
 * Le texte de l'avis lisait le dirigeant dans des clés d'un ancien formulaire -
 * `dirigeant_nom`, `GERANT_ADRESSE` - qu'aucun brouillon ne porte plus : chaque avis
 * de constitution sortait avec « Président : [NOM DU DIRIGEANT], demeurant [ADRESSE DU
 * DIRIGEANT] », prêt à partir tel quel au journal. Le dirigeant se compose ici, comme
 * partout ailleurs dans les actes.
 */
/**
 * Le siège en entier, tel qu'un acte ou un avis l'écrit.
 *
 * Le formulaire le saisit en trois champs - voie, code postal, commune - et un avis
 * qui dirait « Siège social : 12 rue de la Paix » sans la commune ne vaudrait rien
 * au greffe.
 */
export function siegeComplet(brouillon: Brouillon): string {
  return [
    brouillon.adresse?.trim(),
    [brouillon.codePostal?.trim(), brouillon.ville?.trim()].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

export function dirigeantDeLAnnonce(brouillon: Brouillon): {
  nom: string;
  adresse: string;
} {
  const associes = brouillon.associes ?? [];
  const dirigeant = (brouillon.dirigeants ?? [])[0];
  const societe = societeDuDirigeant(dirigeant, associes);

  if (societe) {
    return {
      nom: societeDesignee(societe),
      adresse: [societe.adresse, societe.codePostal, societe.ville]
        .filter((m) => m?.trim())
        .join(" "),
    };
  }

  const personne = personneDuDirigeant(dirigeant, associes);
  const nom = [personne.civilite, personne.prenom, personne.nom]
    .filter((m) => m?.trim())
    .join(" ");

  /*
   * Rien plutôt qu'un tiret.
   *
   * Un blanc dans un acte s'écrit « - » ; dans un avis qu'on porte au journal, il
   * faut qu'il se voie. Le module d'annonce y met alors son propre repère, qu'on ne
   * publie pas par mégarde.
   */
  return { nom, adresse: personne.adresse?.trim() ?? "" };
}

export function personneDuDirigeant(
  dirigeant: Dirigeant | undefined,
  associes: Associe[]
): PersonnePhysique {
  if (!dirigeant) return {};
  if (dirigeant.associe !== undefined) return physique(associes[dirigeant.associe]);
  return dirigeant.personne ?? {};
}

/**
 * La société qui dirige, quand le dirigeant en est une.
 *
 * Une SASU peut avoir pour président son actionnaire unique, et celui-ci peut être une
 * holding. L'écran le propose - la liste des dirigeants possibles nomme les associés,
 * personnes morales comprises - et l'étape ne vérifie que l'existence du rang.
 */
export function societeDuDirigeant(
  dirigeant: Dirigeant | undefined,
  associes: Associe[]
): PersonneMorale | null {
  if (!dirigeant || dirigeant.associe === undefined) return null;
  const associe = associes[dirigeant.associe];
  if (!associe || associe.type !== "morale") return null;
  return associe.societe ?? {};
}

/**
 * Une société dirigeante, désignée comme un acte la désigne.
 *
 * « HOLDING MERIDIEN, SARL au capital de 50 000 euros, dont le siège social est 8 quai
 * de la Gare, 75013 Paris, immatriculée au registre du commerce et des sociétés de
 * Paris sous le numéro 842019336, représentée par Monsieur Marc BERTIN ».
 *
 * Une personne morale n'a ni date de naissance, ni filiation, ni nationalité : les
 * actes écrivaient « né le - à - (-), fils de - et de - » sur un président qui est une
 * société. Ce qui la remplace, et que le greffe attend, c'est son immatriculation et le
 * nom de qui la représente.
 *
 * Les morceaux absents sont omis : une phrase courte vaut mieux qu'une phrase à trous.
 */
/**
 * L'état civil d'une personne physique, en une phrase.
 *
 * « Madame Claire MARCHAND, née le 12 avril 1988 à Lyon (69003) (France), de
 * nationalité Française, célibataire, demeurant 9 rue Oberkampf ». Les gabarits
 * l'écrivaient champ par champ, ce qui interdisait de la remplacer par la désignation
 * d'une société.
 */
/** « marié », « mariée », « pacsé » : la situation accordée à la civilité. */
export function situationAccordee(personne: PersonnePhysique): string {
  const brute = personne.situationMatrimoniale?.trim().toLowerCase();
  if (!brute) return "célibataire";
  const feminin = personne.civilite === "Madame";
  return brute.replace(/\(e\)/g, feminin ? "e" : "");
}

export function identitePhysique(personne: PersonnePhysique): string {
  const nom = civiliteNomPrenom(personne);
  const morceaux = [nom];

  const naissance = dateEnFrancais(personne.dateDeNaissance);
  if (naissance !== TIRET) {
    /* « à Lyon (69003) » : le code postal entre parenthèses, comme dans les actes. */
    const ville = personne.villeDeNaissance?.trim();
    const cp = personne.codePostalDeNaissance?.trim();
    const lieu = ville ? ville + (cp ? " (" + cp + ")" : "") : "";
    const feminin = personne.civilite === "Madame";
    morceaux.push(
      (feminin ? "née le " : "né le ") + naissance + (lieu ? " à " + lieu : "")
    );
  }

  morceaux.push("de nationalité " + (enMinusculeInitiale(personne.nationalite) || "française"));
  /*
   * « marié(e) » ne s'écrit pas dans un acte.
   *
   * La liste du formulaire porte les deux genres entre parenthèses - c'est juste pour
   * un menu déroulant, faux dans une phrase qui nomme déjà quelqu'un. L'accord se fait
   * sur la civilité, comme pour « né » et « fille ».
   */
  morceaux.push(situationAccordee(personne));
  const demeure = domicile(personne);
  if (demeure) morceaux.push("demeurant " + demeure);

  return morceaux.join(", ");
}

/** Le SIREN d'une société associée : celui du registre, ou les neuf premiers du SIRET. */
export { sirenLisible };

export function sirenDe(societe: PersonneMorale | undefined): string {
  const rcs = (societe?.numeroRcs ?? "").replace(/\D/g, "");
  if (rcs) return rcs;
  const siret = (societe?.siret ?? "").replace(/\D/g, "");
  return siret.length >= 9 ? siret.slice(0, 9) : "";
}

/** La première lettre en minuscule : une valeur de liste posée dans une phrase. */
function enMinusculeInitiale(valeur: string | undefined): string {
  const propre = valeur?.trim();
  return propre ? propre[0].toLowerCase() + propre.slice(1) : "";
}

/**
 * La puce que l'on a tapée, retirée : le gabarit pose déjà la sienne.
 *
 * Les statuts listent l'objet social en alinéas, chacun précédé d'un tiret par le
 * modèle Word. Qui rédige son objet le présente naturellement de la même façon, une
 * clause par ligne introduite par un tiret - et l'acte sortait « - - la prise de
 * participations ». Le double tiret se voit dans une pièce déposée au greffe, et rien
 * dans le formulaire ne prévenait qu'il ne fallait pas les écrire.
 *
 * Seul un marqueur en tête de ligne tombe, suivi d'une espace ou non. Un tiret à
 * l'intérieur du texte - « sous-traitance », « L. 225-132 » - n'est pas une puce et ne
 * doit pas disparaître.
 */
function sansPuceDeTete(ligne: string): string {
  return ligne.replace(/^[-–—•*·]+\s*/, "").trim();
}

/**
 * « 8 quai de la Gare, 75013 Paris » : la virgule sépare la voie de la commune.
 *
 * Le siège d'une société morale se composait sans elle - « 8 quai de la Gare 75013
 * Paris » - à côté de l'adresse d'une personne physique, qui la porte. Deux adresses
 * dans le même acte, ponctuées de deux façons.
 */
function adresseSurUneLigne(lieu: {
  adresse?: string;
  codePostal?: string;
  ville?: string;
}): string {
  const commune = [lieu.codePostal?.trim(), lieu.ville?.trim()].filter(Boolean).join(" ");
  return [lieu.adresse?.trim(), commune].filter(Boolean).join(", ");
}

/**
 * Le domicile d'une personne, tel qu'un acte l'écrit.
 *
 * Les actes écrivaient « demeurant 34 Rue Laugier » : la voie seule. Le code postal et
 * la commune étaient bien saisis - ils viennent de la Base Adresse Nationale, avec la
 * proposition qu'on retient - mais rien ne les relisait, et l'associé sortait domicilié
 * dans une rue sans ville. Le siège de la même société, lui, se composait entier deux
 * cents lignes plus haut : deux adresses ponctuées de deux façons dans le même acte.
 */
function domicile(personne: PersonnePhysique): string {
  return adresseSurUneLigne(personne);
}

export function societeDesignee(societe: PersonneMorale): string {
  const denomination = societe.denomination?.trim();
  if (!denomination) return TIRET;

  const morceaux = [denomination];

  const forme = societe.forme?.trim();
  const capital = typeof societe.capital === "number" ? montant(societe.capital) : "";
  if (forme && capital) morceaux.push(forme + " au capital de " + capital + " euros");
  else if (forme) morceaux.push(forme);

  const siege = adresseSurUneLigne(societe);
  if (siege) morceaux.push("dont le siège social est " + siege);

  /*
   * Le SIREN, non le SIRET.
   *
   * L'acte cite le numéro d'immatriculation au registre du commerce - neuf chiffres,
   * celui de la personne morale. Le SIRET en compte quatorze : il désigne un
   * établissement, et le greffe ne rattache pas une société par lui. Le formulaire
   * range le SIREN sous « numeroRcs », que la recherche au registre remplit ; à défaut,
   * les neuf premiers chiffres du SIRET sont ce même SIREN.
   */
  const siren = sirenDe(societe);
  if (siren) {
    const ou_ = societe.villeImmatriculation?.trim();
    morceaux.push(
      "immatriculée au registre du commerce et des sociétés" +
        (ou_ ? " de " + ou_ : "") +
        " sous le numéro " +
        sirenLisible(siren)
    );
  }

  const representant = societe.representant
    ? civiliteNomPrenom(societe.representant as PersonnePhysique)
    : "";
  if (representant && representant !== TIRET) {
    morceaux.push("représentée par " + representant);
  }

  return morceaux.join(", ");
}

/**
 * Qui décide de la rémunération du dirigeant.
 *
 * Le mot entre dans la phrase des statuts : « fixé par décision de … ». Une SCI et
 * une SARL réunissent leurs associés, une SAS son assemblée générale, une société
 * à associé unique n'a que lui.
 */
export function decideurDeLaRemuneration(forme: string | null | undefined): string {
  const code = (forme ?? "").toUpperCase();
  if (code === "SCI" || code === "SARL") return "l’assemblée des associés";
  if (code === "SAS") return "l’assemblée générale";
  return "l’actionnaire unique";
}

type Fonction = "présidence" | "gérance" | "direction générale" | "co-gérance";

/** La phrase de rémunération, telle qu'elle s'écrit dans les statuts. */
export function phraseRemuneration(
  fonction: Fonction,
  choix: string | undefined,
  qui: string
): string {
  if (choix === "Fixe") {
    return (
      "La " +
      fonction +
      " exercera ses fonctions à titre de rémunération fixe dont le montant sera fixé par décision de " +
      qui +
      "."
    );
  }
  if (choix === "Variable") {
    return (
      "La " +
      fonction +
      " exercera ses fonctions à titre de rémunération variable dont les modalités seront fixées par décision de " +
      qui +
      "."
    );
  }
  return "La rémunération de la " + fonction + " sera déterminée ultérieurement.";
}

/**
 * « de dix euros », « d'un euro ».
 *
 * Les gabarits écrivaient « d’{{VALEUR_NOMINALE_LETTRES}} euro » : l'élision et le
 * singulier y étaient figés, ce qui donnait « actions d’dix euro » dès que la valeur
 * nominale dépassait un euro. L'élision et l'accord sont des règles de langue : ils
 * se décident ici, où ils se testent, et non dans un document Word.
 *
 * L'élision ne vaut que devant « un » : les autres nombres commencent par une
 * consonne, et « onze » comme « huit » la refusent - « de onze euros ».
 */
function phraseNominale(valeur: number): string {
  const lettres = nombreEnFrancais(valeur);
  const elide = /^une?\b/.test(lettres);
  return (elide ? "d\u2019" : "de ") + lettres + " " + uniteNominale(valeur);
}

/** « euros », ou « centimes » quand une part vaut moins d'un euro. */
function uniteNominale(valeur: number): string {
  if (valeur < 1) {
    const centimes = Math.round(valeur * 100);
    return "centime" + (centimes > 1 ? "s" : "");
  }
  return "euro" + (valeur > 1 ? "s" : "");
}

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 31 décembre » : la clôture d'exercice s'écrit sans année, elle revient chaque an. */
function jourEtMois(iso: string | undefined): string {
  if (!iso?.includes("-")) return TIRET;
  const [, mois, jour] = iso.split("-");
  const rang = parseInt(mois, 10);
  if (!MOIS[rang - 1]) return TIRET;
  return parseInt(jour, 10) + " " + MOIS[rang - 1];
}

function dateCourte(quand: Date): string {
  return (
    String(quand.getDate()).padStart(2, "0") +
    "/" +
    String(quand.getMonth() + 1).padStart(2, "0") +
    "/" +
    quand.getFullYear()
  );
}

type Donnees = Record<string, unknown>;

/** L'état civil d'une personne, sous les préfixes attendus par un gabarit. */
function etatCivilSous(prefixe: string, personne: PersonnePhysique, donnees: Donnees) {
  donnees[prefixe + "CIVILITE"] = ou(personne.civilite);
  donnees[prefixe + "PRENOM"] = ou(personne.prenom);
  // Le nom de famille s'écrit en capitales dans les actes.
  donnees[prefixe + "NOM"] = personne.nom?.trim() ? personne.nom.trim().toUpperCase() : TIRET;
  donnees[prefixe + "CIVILITE_NOM_PRENOM"] = civiliteNomPrenom(personne);
  donnees[prefixe + "ADRESSE"] = ou(domicile(personne));
  donnees[prefixe + "DATE_NAISSANCE"] = dateEnFrancais(personne.dateDeNaissance);
  donnees[prefixe + "LIEU_NAISSANCE"] = ou(personne.villeDeNaissance);
  donnees[prefixe + "CP_NAISSANCE"] = ou(personne.codePostalDeNaissance);
  donnees[prefixe + "PAYS_NAISSANCE"] = ou(personne.paysDeNaissance, "France");
  /*
   * « de nationalité française », sans majuscule.
   *
   * La liste du formulaire écrit « Française » avec sa capitale - c'est une entrée de
   * menu, elle commence une ligne. Dans la phrase de l'acte, elle est un adjectif au
   * milieu d'une énumération, et la majuscule s'y voit.
   */
  donnees[prefixe + "NATIONALITE"] =
    enMinusculeInitiale(personne.nationalite) || "française";
  donnees[prefixe + "SITUATION_MATRIMONIALE"] = situationAccordee(personne);
  donnees[prefixe + "NOM_PERE"] = ou(personne.nomDuPere);
  donnees[prefixe + "NOM_MERE"] = ou(personne.nomDeLaMere);
  donnees[prefixe + "NOM_JEUNE_FILLE"] = nomDeJeuneFille(
    personne.nomDeNaissance ?? personne.nomDeLaMere
  );
}

/** La fiche d'une société associée, sous les préfixes du gabarit. */
function societeSous(prefixe: string, societe: PersonneMorale, donnees: Donnees) {
  donnees[prefixe + "SOCIETE_NOM"] = ou(societe.denomination);
  donnees[prefixe + "SOCIETE_FORME"] = ou(societe.forme);
  donnees[prefixe + "SOCIETE_TYPE"] = ou(societe.forme);
  donnees[prefixe + "SOCIETE_CAPITAL"] =
    societe.capital !== undefined ? montant(societe.capital) : TIRET;
  /* Le siège s'écrit en entier : sans code postal ni commune, il ne situe personne. */
  donnees[prefixe + "SOCIETE_ADRESSE"] = ou(adresseSurUneLigne(societe));
  donnees[prefixe + "SOCIETE_RCS"] = ou(sirenLisible(societe.numeroRcs));
  donnees[prefixe + "SOCIETE_RCS_VILLE"] = ou(societe.villeImmatriculation);
  donnees[prefixe + "SOCIETE_VILLE_RCS"] = ou(societe.villeImmatriculation);
  /*
   * Le SIREN, non le SIRET : le greffe ne rattache pas une société par son
   * établissement. Et par groupes de trois, comme partout ailleurs dans les actes.
   */
  donnees[prefixe + "SOCIETE_SIREN"] = ou(sirenLisible(sirenDe(societe)));
  donnees[prefixe + "SOCIETE_REP"] = societe.representant
    ? civiliteNomPrenom(societe.representant as PersonnePhysique)
    : TIRET;
  donnees[prefixe + "REP_CIVILITE"] = ou(societe.representant?.civilite);
  donnees[prefixe + "REP_PRENOM"] = ou(societe.representant?.prenom);
  donnees[prefixe + "REP_NOM"] = ou(societe.representant?.nom);
}

export interface ContexteGabarit {
  /**
   * La date de signature portée sur les actes.
   *
   * C'est un paramètre et non un appel à l'horloge : un acte doit pouvoir se
   * reproduire à l'identique, et un test doit pouvoir en fixer la date.
   */
  maintenant?: Date;
  /**
   * La ville du RCS, résolue depuis le code postal du siège.
   *
   * Le tribunal de commerce compétent est celui du département, avec des
   * exceptions : la table vit dans l'infrastructure, qui la passe ici. À défaut,
   * la commune du siège est utilisée.
   */
  villeRcs?: string;
}

/** Le jeu de champs complet, pour docxtemplater. */
export function donneesDeGabarit(brouillon: Brouillon, contexte: ContexteGabarit = {}): Donnees {
  const maintenant = contexte.maintenant ?? new Date();
  const associes = (brouillon.associes ?? []).slice(0, MAXIMUM_ASSOCIES);
  const dirigeants = (brouillon.dirigeants ?? []).slice(0, MAXIMUM_DIRIGEANTS + 1);
  const tous = brouillon.associes ?? [];

  const nominale = valeurNominale(brouillon);
  const partsTotales = brouillon.partsTotales ?? 0;
  const capital = brouillon.capital ?? 0;

  const forme = (brouillon.forme ?? "").toUpperCase();
  const regleForme = regle(brouillon.forme);
  const unique = estUnipersonnelle(brouillon.forme, associes.length);

  const premier = associes[0];
  /* Les personnes physiques du dossier : une société n'a pas de genre grammatical. */
  const physiques = associes
    .filter((a) => a.type !== "morale")
    .map((a) => a.personne)
    .filter((p): p is NonNullable<typeof p> => !!p);
  const a1 = physique(premier);
  const dirigeant = personneDuDirigeant(dirigeants[0], tous);
  /* Le dirigeant peut être une société : elle n'a ni naissance ni filiation. */
  const societeDirigeante = societeDuDirigeant(dirigeants[0], tous);
  const designationDuDirigeant = societeDirigeante
    ? societeDesignee(societeDirigeante)
    : civiliteNomPrenom(dirigeant);
  const conjoint = a1.conjoint;

  /*
   * L'objet social, ligne par ligne - et rien ne se perd au passage.
   *
   * Les statuts réservent un nombre fixe d'emplacements : six en SAS, trois en SARL. Un
   * objet de holding en compte huit - participations, animation du groupe, prestations
   * aux filiales, trésorerie, propriété intellectuelle - et les derniers disparaissaient
   * sans un mot des statuts déposés au greffe.
   *
   * Ce qui dépasse rejoint donc le dernier emplacement plutôt que le néant. La
   * présentation y perd - plusieurs clauses sous une seule puce - mais un acte amputé
   * n'est pas un acte mal présenté, c'est un acte faux.
   */
  /*
   * Le nombre d'emplacements n'est pas le même partout : les statuts de SARL en
   * réservent trois, ceux de SAS six. Il se lit sur la forme, où il est déclaré avec
   * le reste de ce qui la distingue - une liste de formes écrite ici dériverait du
   * jour où un gabarit change.
   */
  const EMPLACEMENTS_OBJET = regleForme?.emplacementsObjet ?? 6;
  const toutesLesLignes = (brouillon.activite ?? "")
    .split("\n")
    .map((l) => sansPuceDeTete(l.trim()))
    .filter(Boolean);
  const lignesObjet =
    toutesLesLignes.length > EMPLACEMENTS_OBJET
      ? [
          ...toutesLesLignes.slice(0, EMPLACEMENTS_OBJET - 1),
          toutesLesLignes.slice(EMPLACEMENTS_OBJET - 1).join("\n"),
        ]
      : toutesLesLignes;

  /**
   * L'adresse du siège s'écrit en entier dans les actes.
   *
   * Le formulaire la saisit en trois champs - voie, code postal, commune - mais un
   * acte qui dirait « Le siège social est fixé : 12 rue des Lilas » sans la ville
   * serait rejeté. L'original les recomposait de la même façon.
   */
  const adresseComplete = siegeComplet(brouillon);

  const qui = decideurDeLaRemuneration(brouillon.forme);
  const remuneration = dirigeants[0]?.remuneration;

  const donnees: Donnees = {
    /* ---------- La société ---------- */
    NOM_SOCIETE: ou(brouillon.denomination),
    NOM_SOCIETE_COMPLET: ou(brouillon.denomination),
    SOCIETE: ou(brouillon.denomination),
    FORME_JURIDIQUE: forme || "SAS",
    FORME_LABEL: regleForme?.libelle ?? (forme || TIRET),
    ADRESSE_SIEGE: ou(adresseComplete),
    SIEGE_SOCIAL: ou(adresseComplete),
    VILLE_SOCIETE: ou(brouillon.ville),
    VILLE_SIGNATURE: ou(brouillon.ville),
    RCS_VILLE: ou(contexte.villeRcs ?? brouillon.ville),
    /*
     * À quel titre le dirigeant occupe son domicile, et ce que la loi en tire.
     *
     * L'attestation écrivait « propriétaire » pour tout le monde. Elle annonçait aussi
     * une durée bornée à cinq ans tout en certifiant que rien ne s'y opposait : les
     * deux ne peuvent pas être vrais ensemble. L'article L. 123-11-1 du code de
     * commerce ne borne que le cas où un bail ou un règlement de copropriété
     * l'interdit - hors de ce cas, la mise à disposition n'a pas de terme.
     */
    /*
     * Le titre d'occupation se glisse au milieu d'une phrase.
     *
     * La liste de choix l'écrit avec sa majuscule - « Propriétaire », « Locataire » -
     * et l'acte disait « dont il est Propriétaire », majuscule en plein milieu. Ce qui
     * convient à un menu ne convient pas à une phrase.
     */
    STATUT_OCCUPATION: enMinusculeInitiale(brouillon.occupationDomicile) || "propriétaire",
    DUREE_LIMITEE: brouillon.domiciliationRestreinte === true,
    MENTION_DUREE_TITRE:
      brouillon.domiciliationRestreinte === true
        ? "à durée limitée"
        : "sans limitation de durée",
    MENTION_DUREE:
      brouillon.domiciliationRestreinte === true
        ? "pour la durée précisée ci-après"
        : "sans limitation de durée",
    MODE_DOMICILIATION: brouillon.modeDomiciliation ?? "",
    // Le domiciliataire, quand il y en a un : sa dénomination et son immatriculation
    // sont déclarées au registre, son agrément est la mention qui rend le contrat
    // recevable.
    EST_DOMICILIE: brouillon.modeDomiciliation === "Société de domiciliation",
    NOM_DOMICILIATAIRE: ou(brouillon.domiciliataire?.denomination),
    SIREN_DOMICILIATAIRE: ou(brouillon.domiciliataire?.siren),
    AGREMENT_DOMICILIATAIRE: ou(brouillon.domiciliataire?.agrement),
    DUREE: String(brouillon.dureeDeVie ?? 99),
    OPTION_FISCALE: brouillon.optionFiscale ?? "",
    OPTION_IS: brouillon.optionFiscale === "IS",
    REGIME_TVA: brouillon.regimeTva ?? "",

    /* ---------- Les dates ---------- */
    DATE_DEBUT_ACTIVITE: dateEnFrancais(brouillon.dateDebutActivite),
    DATE_DEBUT_EXERCICE: dateEnFrancais(brouillon.dateDebutActivite),
    // La clôture s'écrit « 31 décembre » : elle revient chaque année.
    DATE_CLOTURE: jourEtMois(brouillon.dateCloturePremierExercice),
    DATE_CLOTURE_PREMIER_EXERCICE: dateEnFrancais(brouillon.dateCloturePremierExercice),
    ANNEE_PREMIER_EXERCICE: brouillon.dateCloturePremierExercice?.split("-")[0] ?? TIRET,
    /* « Fait le 1 septembre » : le quantième du premier s'écrit « 1er », comme le fait
       déjà `dateEnFrancais` pour toutes les autres dates de l'acte. */
    DATE_SIGNATURE:
      (maintenant.getDate() === 1 ? "1er" : String(maintenant.getDate())) +
      " " +
      MOIS[maintenant.getMonth()] +
      " " +
      maintenant.getFullYear(),
    DATE_SIGNATURE_COURTE: dateCourte(maintenant),

    /* ---------- L'objet social, six lignes au plus ---------- */
    /* Le texte entier, puces de saisie retirées comme dans les alinéas. */
    OBJET_SOCIAL: ou(toutesLesLignes.join("\n")),
    OBJET_SOCIAL_1: lignesObjet[0] ?? ou(brouillon.activite),
    OBJET_SOCIAL_2: lignesObjet[1] ?? "",
    OBJET_SOCIAL_3: lignesObjet[2] ?? "",
    OBJET_SOCIAL_4: lignesObjet[3] ?? "",
    OBJET_SOCIAL_5: lignesObjet[4] ?? "",
    OBJET_SOCIAL_6: lignesObjet[5] ?? "",

    /* ---------- Le capital ---------- */
    CAPITAL: montant(capital),
    CAPITAL_CHIFFRES: montant(capital),
    CAPITAL_FORMATE: montant(capital),
    CAPITAL_LETTRES: nombreEnFrancais(capital),
    MONTANT: montant(capital),
    NB_PARTS: partsTotales ? montant(partsTotales) : TIRET,
    NB_PARTS_LETTRES: nombreEnFrancais(partsTotales),
    NOMBRE_ACTIONS: partsTotales ? montant(partsTotales) : TIRET,
    NOMBRE_ACTIONS_LETTRES: nombreEnFrancais(partsTotales),
    TOTAL_PARTS: partsTotales ? montant(partsTotales) : TIRET,
    VALEUR_NOMINALE: montant(nominale),
    VALEUR_NOMINALE_CHIFFRES: montant(nominale),
    VALEUR_NOMINALE_LETTRES: nombreEnFrancais(nominale),
    VALEUR_NOMINALE_UNITE: uniteNominale(nominale),
    VALEUR_NOMINALE_PHRASE: phraseNominale(nominale),

    /* ---------- La forme, en conditions ---------- */
    IS_UNIPERSONNELLE: unique,
    IS_PLURIPERSONNELLE: !unique,

    /* ---------- La banque du dépôt ---------- */
    NOM_BANQUE: ou(brouillon.banque === "Autre" ? brouillon.banqueAutre?.nom : brouillon.banque),
    ADRESSE_BANQUE: ou(
      [
        brouillon.banqueAutre?.adresse,
        [brouillon.banqueAutre?.codePostal, brouillon.banqueAutre?.ville]
          .filter((m) => m?.trim())
          .join(" "),
      ]
        .filter((m) => m?.trim())
        .join(", ")
    ),
    BANQUE_QONTO: brouillon.banque === "Qonto",
    BANQUE_SHINE: brouillon.banque === "Shine",
    BANQUE_REVOLUT: brouillon.banque === "Revolut Business",
    BANQUE_AUTRE: brouillon.banque === "Autre",

    /* ---------- Le dirigeant ---------- */
    PRESIDENT_NOM: designationDuDirigeant,
    GERANT_NOM: designationDuDirigeant,
    /*
     * Le dirigeant est-il une société ?
     *
     * Les actes composent une phrase d'état civil - « né le … à …, fils de … » - qui n'a
     * aucun sens pour une personne morale : ils l'écrivaient à trous. Cette clé leur dit
     * de s'en passer, et la désignation porte à sa place l'immatriculation et le nom du
     * représentant.
     */
    DIRIGEANT_EST_MORALE: societeDirigeante !== null,
    DIRIGEANT_EST_PHYSIQUE: societeDirigeante === null,
    ADRESSE_DIRIGEANT: ou(
      societeDirigeante ? adresseSurUneLigne(societeDirigeante) : domicile(dirigeant)
    ),
    FONCTION_DIRIGEANT: regleForme?.titreDirigeant ?? "Président",
    REMUNERATION_PRESIDENT: phraseRemuneration("présidence", remuneration, qui),
    REMUNERATION_GERANT: phraseRemuneration("gérance", remuneration, qui),
    REMUNERATION_DG: phraseRemuneration("direction générale", remuneration, qui),
    REMUNERATION_CO_GERANT: phraseRemuneration("co-gérance", remuneration, qui),
    REMUNERATION_DIRIGEANT: phraseRemuneration(
      regleForme?.titreDirigeant === "Gérant" ? "gérance" : "présidence",
      remuneration,
      qui
    ),
    REMUNERATION_PRESIDENT_TYPE: remuneration ?? "",
    REGIME_SOCIAL_PRESIDENT: dirigeants[0]?.regimeSocial ?? "",

    /* ---------- L'associé de tête, celui qui signe ---------- */
    NOM_ACTIONNAIRE: civiliteNomPrenom(a1),
    ASSOCIE_LISTE: associes
      .map((a, i) =>
        a.type === "morale"
          ? ou(a.societe?.denomination, "Associé " + (i + 1))
          : civiliteNomPrenom(physique(a))
      )
      .join(", "),
    nomComplet: civiliteNomPrenom(a1),
    EST_PERSONNE_PHYSIQUE: premier?.type !== "morale",
    /*
     * Les signataires sont-ils tous des femmes ?
     *
     * Les gabarits écrivent « L'ASSOCIÉ UNIQUE SOUSSIGNÉ » et « QU'IL A DÉCIDÉ DE
     * CONSTITUER » en toutes lettres : une associée unique lisait un acte qui parlait
     * d'elle au masculin, du titre à la signature. Le masculin l'emporte dès qu'un
     * homme est présent ; il ne s'impose pas quand il n'y en a aucun.
     */
    TOUTES_DES_FEMMES:
      physiques.length > 0 && physiques.every((p) => p.civilite === "Madame"),
    EST_PERSONNE_MORALE: premier?.type === "morale",

    /* ---------- Le conjoint ---------- */
    CONJOINT_DE: conjoint ? civiliteNomPrenom(a1) : TIRET,
    CONJOINT_NOM: conjoint
      ? ou([conjoint.prenom, conjoint.nom].filter((m) => m?.trim()).join(" "))
      : TIRET,
    REGIME_MATRIMONIAL: ou(conjoint?.regimeMatrimonial),
    REGIME_LABEL: ou(conjoint?.regimeMatrimonial),
    DATE_MARIAGE: dateEnFrancais(conjoint?.dateMariage),
    VILLE_MARIAGE: ou(conjoint?.villeMariage),

    /*
     * Le SIREN, non le SIRET.
     *
     * Les actes citent le numéro d'immatriculation de la personne morale - neuf
     * chiffres. Le SIRET en compte quatorze et désigne un établissement : le formulaire
     * le demande à part, et c'est celui-ci qui était écrit. Les neuf premiers chiffres
     * d'un SIRET sont le SIREN : ils servent de repli.
     */
    SIREN: ou(sirenLisible(sirenDe(premier?.societe))),
  };

  // L'état civil du premier associé, sans préfixe : c'est lui que les gabarits
  // désignent par CIVILITE, NOM, PRENOM, ADRESSE_PERSO…
  etatCivilSous("", a1, donnees);
  donnees.ADRESSE_PERSO = ou(domicile(a1));
  donnees.CODE_POSTAL_NAISSANCE = ou(a1.codePostalDeNaissance);

  /*
   * La phrase entière qui présente le signataire.
   *
   * Les procès-verbaux l'écrivaient champ par champ - « {{CIVILITE}} {{NOM}}
   * {{PRENOM}}, né le {{DATE_NAISSANCE}} à {{LIEU_NAISSANCE}} ({{CODE_POSTAL}}) … » -
   * et un actionnaire personne morale la remplissait de tirets : « - -, né le - à - (-)
   * (France), de nationalité Française, célibataire, demeurant - ». Une société n'a ni
   * naissance ni situation matrimoniale ; sa désignation, elle, dit ce que le greffe
   * attend. La phrase se compose donc ici, où l'on sait laquelle des deux écrire.
   */
  donnees.IDENTITE_SIGNATAIRE = premier?.type === "morale"
    ? societeDesignee(premier.societe ?? {})
    : identitePhysique(a1);

  // Le gérant, pour les gabarits de SCI et de SARL qui le nomment ainsi. EST_HOMME
  // et EST_FEMME sans préfixe désignent le dirigeant : c'est lui qui déclare ne pas
  // avoir été condamné.
  etatCivilSous("GERANT_", dirigeant, donnees);
  donnees.GERANT_EST_HOMME = dirigeant.civilite === "Monsieur";
  donnees.GERANT_EST_FEMME = dirigeant.civilite === "Madame";
  donnees.EST_HOMME = dirigeant.civilite === "Monsieur";
  donnees.EST_FEMME = dirigeant.civilite === "Madame";

  /*
   * « Le soussigné » ou « La soussignée », selon qui signe.
   *
   * L'attestation de domiciliation ouvrait sur une forme figée. Un acte qui appelle
   * une femme « le soussigné » se lit comme un formulaire mal rempli, et c'est elle
   * qui le signe.
   */
  const dirigeanteEstUneFemme = dirigeant.civilite === "Madame";
  donnees.LE_SOUSSIGNE = dirigeanteEstUneFemme ? "La soussignée" : "Le soussigné";
  donnees.DONT_IL_EST = dirigeanteEstUneFemme ? "dont elle est" : "dont il est";

  /*
   * Le titre du dirigeant, quand il qualifie la personne.
   *
   * « Madame Amel BELOUAFI, président de cette assemblée », « dont elle est gérant » :
   * le titre est ici l'attribut d'une femme, et il s'accorde. Les articles des statuts
   * - « Le Président est nommé pour une durée fixée par les associés » - désignent
   * l'organe et non celle qui l'occupe : ils restent au masculin, comme le code de
   * commerce les écrit.
   */
  donnees.DIRIGEANTE_EST_UNE_FEMME = dirigeanteEstUneFemme;

  // La société associée, quand le premier associé est une personne morale.
  societeSous("", premier?.societe ?? {}, donnees);
  donnees.SOCIETE_SIEGE = ou(premier?.societe?.adresse);
  donnees.SOCIETE_REPRESENTANT = premier?.societe?.representant
    ? civiliteNomPrenom(premier.societe.representant as PersonnePhysique)
    : TIRET;

  /* ---------- Les associés, un par un ---------- */

  const liste: Donnees[] = [];
  let totalVerse = 0;
  let totalReste = 0;
  let cumulParts = 0;

  // Les dix rangs sont toujours écrits, renseignés ou non : docxtemplater ne doit
  // jamais rencontrer un champ absent, même à l'intérieur d'une section fermée.
  for (let rang = 1; rang <= MAXIMUM_ASSOCIES; rang++) {
    const associe = associes[rang - 1];

    if (!associe) {
      donnees["HAS_ASSOC_" + rang] = false;
      donnees["CIVILITE_NOM_PRENOM_" + rang] = TIRET;
      donnees["ACTIONNAIRE_" + rang] = TIRET;
      donnees["ASSOCIE_" + rang] = TIRET;
      donnees["ADRESSE_ASSOCIE_" + rang] = TIRET;
      donnees["EMAIL_ASSOCIE_" + rang] = "";
      donnees["DATE_NAISSANCE_" + rang] = TIRET;
      donnees["LIEU_NAISSANCE_" + rang] = TIRET;
      donnees["NATIONALITE_" + rang] = "française";
      donnees["SITUATION_MATRIMONIALE_" + rang] = "célibataire";
      donnees["NOM_PERE_" + rang] = TIRET;
      donnees["NOM_MERE_" + rang] = TIRET;
      donnees["NOM_JEUNE_FILLE_" + rang] = TIRET;
      donnees["IDENTITE_ASSOCIE_" + rang] = TIRET;
      donnees["EST_HOMME_" + rang] = false;
      donnees["EST_FEMME_" + rang] = false;
      donnees["ASSOC_" + rang + "_EST_MORALE"] = false;
      donnees["ASSOC_" + rang + "_EST_PHYSIQUE"] = false;
      societeSous("ASSOC_" + rang + "_", {}, donnees);
      donnees["NB_PARTS_" + rang] = TIRET;
      donnees["PCT_DETENTION_" + rang] = "0";
      donnees["PCT_LIBERATION_" + rang] = "100";
      donnees["APPORT_NUMERAIRE_" + rang] = montant(0);
      donnees["MONTANT_SOUSCRIT_" + rang] = montant(0);
      donnees["MONTANT_VERSE_" + rang] = montant(0);
      donnees["RESTE_A_LIBERER_" + rang] = montant(0);
      donnees["APPORTS_NATURE_" + rang] = montant(0);
      donnees["DESC_APPORT_NATURE_" + rang] = "";
      donnees["HAS_APPORT_NATURE_" + rang] = false;
      donnees["PARTS_DE_" + rang] = TIRET;
      donnees["PARTS_A_" + rang] = TIRET;
      continue;
    }

    const personne = physique(associe);
    const estMorale = associe.type === "morale";
    const a = apportsDe(associe, nominale);
    const pourcentage =
      partsTotales > 0 ? ((a.parts / partsTotales) * 100).toFixed(1).replace(/\.0$/, "") : "0";

    const identite = estMorale ? ou(associe.societe?.denomination) : civiliteNomPrenom(personne);
    /*
     * La désignation entière, pour les actes qui la réclament.
     *
     * Une déclaration de non-condamnation nommait « HOLDING MERIDIEN » et rien d'autre :
     * ni forme, ni capital, ni immatriculation, ni le nom de qui la représente - et le
     * greffe ne peut pas rattacher cette société à son propre extrait. La dénomination
     * seule reste pour les lignes de signature, où la phrase entière ne tiendrait pas.
     */
    const designation = estMorale
      ? societeDesignee(associe.societe ?? {})
      : civiliteNomPrenom(personne);

    donnees["HAS_ASSOC_" + rang] = true;
    donnees["CIVILITE_NOM_PRENOM_" + rang] = designation;
    /*
     * La phrase entière de l'associé, telle que les procès-verbaux la listent.
     *
     * Ils l'écrivaient champ par champ - « né le …, de nationalité …, demeurant … » -
     * sur dix rangs et deux variantes de genre. Une personne morale y sortait à trous.
     */
    donnees["IDENTITE_ASSOCIE_" + rang] = estMorale
      ? designation
      : identitePhysique(personne);
    donnees["ACTIONNAIRE_" + rang] = identite;
    donnees["ASSOCIE_" + rang] = identite;
    donnees["ADRESSE_ASSOCIE_" + rang] = ou(
      estMorale ? adresseSurUneLigne(associe.societe ?? {}) : domicile(personne)
    );
    donnees["EMAIL_ASSOCIE_" + rang] = personne.email?.trim() ?? "";
    donnees["DATE_NAISSANCE_" + rang] = dateEnFrancais(personne.dateDeNaissance);
    donnees["LIEU_NAISSANCE_" + rang] = ou(personne.villeDeNaissance);
    donnees["NATIONALITE_" + rang] = enMinusculeInitiale(personne.nationalite) || "française";
    donnees["SITUATION_MATRIMONIALE_" + rang] = situationAccordee(personne);
    donnees["NOM_PERE_" + rang] = ou(personne.nomDuPere);
    donnees["NOM_MERE_" + rang] = ou(personne.nomDeLaMere);
    donnees["NOM_JEUNE_FILLE_" + rang] = nomDeJeuneFille(
      personne.nomDeNaissance ?? personne.nomDeLaMere
    );
    donnees["EST_HOMME_" + rang] = personne.civilite === "Monsieur";
    donnees["EST_FEMME_" + rang] = personne.civilite === "Madame";

    donnees["ASSOC_" + rang + "_EST_MORALE"] = estMorale;
    donnees["ASSOC_" + rang + "_EST_PHYSIQUE"] = !estMorale;
    societeSous("ASSOC_" + rang + "_", associe.societe ?? {}, donnees);

    donnees["NB_PARTS_" + rang] = a.parts ? montant(a.parts) : TIRET;
    donnees["PCT_DETENTION_" + rang] = pourcentage;
    donnees["PCT_LIBERATION_" + rang] = String(a.pourcentageLibere);
    donnees["APPORT_NUMERAIRE_" + rang] = montant(a.numeraire);
    donnees["MONTANT_SOUSCRIT_" + rang] = montant(a.souscrit);
    donnees["MONTANT_VERSE_" + rang] = montant(a.verse);
    donnees["RESTE_A_LIBERER_" + rang] = montant(a.reste);
    donnees["APPORTS_NATURE_" + rang] = montant(a.enNature);
    donnees["DESC_APPORT_NATURE_" + rang] = associe.apportEnNature?.description?.trim() ?? "";
    donnees["HAS_APPORT_NATURE_" + rang] = a.enNature > 0;

    // Les parts sont numérotées en continu : « de la part 1 à la part 500 ».
    /* « de 1 à 1400 » à côté de « 1 400 actions » : le séparateur vaut pour les deux. */
    donnees["PARTS_DE_" + rang] = a.parts > 0 ? montant(cumulParts + 1) : TIRET;
    cumulParts += a.parts;
    donnees["PARTS_A_" + rang] = a.parts > 0 ? montant(cumulParts) : TIRET;

    totalVerse += a.verse;
    totalReste += a.reste;

    liste.push({
      CIVILITE_NOM_PRENOM: identite,
      /*
       * La phrase entière, dans l'élément de la liste et non au-dessus.
       *
       * La liste des souscripteurs boucle sur les associés et écrit
       * `{{IDENTITE_SIGNATAIRE}}` à chaque tour. Cette clé n'existait qu'au niveau du
       * document, où elle désigne le premier associé : docxtemplater remontait donc au
       * document faute de la trouver dans l'élément, et les dix blocs nommaient tous le
       * premier. Une SAS à deux actionnaires attribuait ainsi les 600 actions de la
       * seconde au premier, dans une pièce déposée au greffe - et le bloc de signatures,
       * qui emploie une autre clé, la nommait correctement deux paragraphes plus bas.
       */
      IDENTITE_SIGNATAIRE: estMorale ? designation : identitePhysique(personne),
      DATE_NAISSANCE: dateEnFrancais(personne.dateDeNaissance),
      LIEU_NAISSANCE: ou(personne.villeDeNaissance),
      NATIONALITE: enMinusculeInitiale(personne.nationalite) || "française",
      SITUATION_MATRIMONIALE: situationAccordee(personne),
      ADRESSE: ou(estMorale ? adresseSurUneLigne(associe.societe ?? {}) : domicile(personne)),
      EST_HOMME: personne.civilite === "Monsieur",
      EST_FEMME: personne.civilite === "Madame",
      NB_PARTS: a.parts ? montant(a.parts) : TIRET,
      VALEUR_NOMINALE: montant(nominale),
      MONTANT_SOUSCRIT: montant(a.souscrit),
      PCT_DETENTION: pourcentage,
      APPORT_NUMERAIRE: montant(a.numeraire),
      HAS_APPORT_NATURE: a.enNature > 0,
      APPORTS_NATURE: montant(a.enNature),
      DESC_APPORT_NATURE: associe.apportEnNature?.description?.trim() ?? "",
      PCT_LIBERATION: String(a.pourcentageLibere),
      MONTANT_VERSE: montant(a.verse),
      RESTE_A_LIBERER: montant(a.reste),
    });
  }

  /* ---------- Le premier associé, en champs d'apport sans indice ---------- */

  const apportPremier = premier ? apportsDe(premier, nominale) : null;
  donnees.PCT_DETENTION =
    apportPremier && partsTotales > 0
      ? ((apportPremier.parts / partsTotales) * 100).toFixed(1).replace(/\.0$/, "")
      : "0";
  donnees.PCT_LIBERATION = String(apportPremier?.pourcentageLibere ?? 100);
  donnees.LIBERATION_PCT_1 = String(apportPremier?.pourcentageLibere ?? 100);
  donnees.MONTANT_SOUSCRIT = montant(apportPremier?.souscrit ?? 0);
  donnees.MONTANT_VERSE = montant(apportPremier?.verse ?? 0);
  donnees.RESTE_A_LIBERER = montant(apportPremier?.reste ?? 0);
  donnees.APPORT_NUMERAIRE = montant(apportPremier?.numeraire ?? 0);
  donnees.APPORTS_NATURE = montant(apportPremier?.enNature ?? 0);
  donnees.DESC_APPORT_NATURE = premier?.apportEnNature?.description?.trim() ?? "";
  donnees.HAS_APPORT_NATURE = (apportPremier?.enNature ?? 0) > 0;

  /* ---------- Les directeurs généraux ---------- */

  // Le premier dirigeant est le président ou le gérant ; les suivants sont les
  // directeurs généraux, que le procès-verbal nomme DG_1 à DG_3.
  const generaux = dirigeants.slice(1);
  donnees.HAS_DG = generaux.length > 0;
  donnees.DG_COUNT = generaux.length;

  for (let rang = 1; rang <= MAXIMUM_DIRIGEANTS; rang++) {
    const dg = generaux[rang - 1];
    const personne = personneDuDirigeant(dg, tous);

    donnees["HAS_DG_" + rang] = !!dg;
    // Le parcours ne saisit pas de dirigeant personne morale : la condition existe
    // dans les gabarits, elle est donc renseignée, et fausse.
    /* Un directeur général peut reprendre un associé, et celui-ci être une société. */
    const societeDuDg = societeDuDirigeant(dg, tous);
    donnees["DG_" + rang + "_EST_PHYSIQUE"] = !!dg && !societeDuDg;
    donnees["DG_" + rang + "_EST_MORALE"] = !!societeDuDg;
    donnees["IDENTITE_DG_" + rang] = dg
      ? societeDuDg
        ? societeDesignee(societeDuDg)
        : identitePhysique(personne)
      : TIRET;
    etatCivilSous("DG_" + rang + "_", personne, donnees);
    societeSous("DG_" + rang + "_", societeDuDg ?? {}, donnees);
  }

  /* Les mêmes phrases, pour le dirigeant et les directeurs généraux. */
  /*
   * Les procès-verbaux de SARL et de SCI écrivaient chaque associé deux fois - une
   * version « né », une version « née » - sous une condition de genre. Depuis que la
   * phrase compose son propre accord, les deux branches sont identiques ; et surtout,
   * un associé personne morale n'étant ni l'un ni l'autre, il disparaissait purement et
   * simplement de la liste des présents. La seconde branche est neutralisée par ce
   * drapeau, qui n'est jamais vrai.
   */
  donnees.SANS_OBJET = false;
  donnees.A_UN_DIRIGEANT = dirigeants.length > 0;

  donnees.IDENTITE_GERANT = societeDirigeante
    ? societeDesignee(societeDirigeante)
    : identitePhysique(dirigeant);

  /*
   * Qui signe l'attestation de domiciliation.
   *
   * Le corps de l'acte est celui du dirigeant - c'est lui qui met son logement à
   * disposition - mais la ligne de signature portait « {{CIVILITE_NOM_PRENOM_1}} »,
   * c'est-à-dire le premier associé. Dès que le gérant n'est pas cet associé, l'acte
   * s'ouvrait au nom de l'un et se signait au nom de l'autre.
   */
  donnees.CIVILITE_NOM_PRENOM_DIRIGEANT = societeDirigeante
    ? societeDirigeante.denomination ?? ""
    : civiliteNomPrenom(dirigeant);

  donnees.DG_1_EST_HOMME = personneDuDirigeant(generaux[0], tous).civilite === "Monsieur";
  donnees.DG_1_EST_FEMME = personneDuDirigeant(generaux[0], tous).civilite === "Madame";

  donnees.ASSOCIES = liste;
  donnees.TOTAL_VERSE = montant(totalVerse);
  donnees.TOTAL_RESTE = montant(totalReste);
  donnees.TOTAL_VERSE_LETTRES = nombreEnFrancais(totalVerse);

  return donnees;
}
