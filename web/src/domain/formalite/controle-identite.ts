/**
 * Ce qu'on exige d'une pièce d'identité, et ce qu'on en conclut.
 *
 * Une pièce d'identité déposée n'était contrôlée que sur sa forme : extension, taille,
 * signature binaire du fichier. Une carte périmée, un cliché flou, un coin coupé qui
 * mange la date de validité passaient tous - et se découvraient des jours plus tard,
 * au refus du greffe, quand le dossier avait déjà été réglé et transmis.
 *
 * Ce module ne lit rien : il décide. La lecture vient d'ailleurs - des mesures faites
 * sur l'image, et d'un modèle à qui l'on demande de transcrire ce qui est imprimé. Le
 * jugement, lui, vit ici, en un seul endroit, sans base ni réseau : c'est ce qui permet
 * de l'éprouver ligne à ligne sans une pièce d'identité réelle sous la main.
 */

/**
 * Les pièces auxquelles ce contrôle s'applique.
 *
 * Quatre identifiants pour la même chose, parce que chaque parcours nomme les siens :
 * la création en attend une, l'auto-entreprise le recto et le verso, la modification
 * celle du nouveau dirigeant. Les énumérer ici plutôt que dans la route évite qu'un
 * cinquième parcours arrive un jour sans contrôle, faute qu'on ait pensé à l'ajouter.
 */
export const PIECES_DIDENTITE = new Set([
  "identite",
  "identite-recto",
  "identite-verso",
  "identite-dirigeant",
]);

export function estUnePieceDIdentite(identifiant: string): boolean {
  return PIECES_DIDENTITE.has(identifiant);
}

/** Ce que le contrôle décide de la pièce. */
export type Gravite = "acceptee" | "reserve" | "refusee";

/**
 * Un constat, et ce qu'il pèse.
 *
 * Le code sert aux tests et au journal ; la phrase est celle que le client lit. Elle dit
 * ce qui ne va pas et ce qu'il faut faire - « refaire la photo » se comprend, « qualité
 * insuffisante » renvoie à une devinette.
 */
export interface Constat {
  code: string;
  gravite: "reserve" | "refusee";
  phrase: string;
}

/** Ce que le type de document est, une fois lu. */
export type TypeDePiece = "cni" | "passeport" | "titre-de-sejour" | "autre";

/**
 * Ce que la lecture rapporte de la pièce.
 *
 * Ce sont des constatations, pas des conclusions : rien ici ne dit si la pièce est
 * acceptable. La MRZ arrive telle qu'elle a été transcrite - c'est ce module qui la
 * vérifie, parce qu'une transcription peut se tromper et que les clés de contrôle le
 * disent.
 */
export interface LectureDeLaPiece {
  estUnePieceDIdentite: boolean;
  type: TypeDePiece | null;
  /** Les lignes de la zone lisible par machine, telles que transcrites. */
  mrz: string[] | null;
  /** La date de fin de validité imprimée, en ISO, quand elle se lit. */
  finDeValidite: string | null;
  /** La date de délivrance imprimée, en ISO, quand elle se lit. */
  delivreeLe: string | null;
  nom: string | null;
  prenoms: string | null;
  /** Le document est rogné : un bord, un coin, ou une ligne de la MRZ manque. */
  bordsCoupes: boolean;
  /** Ce qui est présent mais ne se lit pas : « date de naissance », « numéro ». */
  champsIllisibles: string[];
  /** Un reflet ou une ombre couvre une partie du document. */
  refletOuOmbre: boolean;
}

/**
 * Ce que l'image vaut, mesuré sans rien comprendre à son contenu.
 *
 * Ces nombres ne disent pas qu'une pièce est valable ; ils disent qu'elle est
 * photographiable. Une carte nette et bien éclairée peut être périmée, une carte
 * valable peut être illisible - les deux contrôles sont indépendants, et c'est
 * volontaire.
 */
export interface MesuresDeLaPiece {
  /** Le plus grand côté, en pixels. Un PDF n'en a pas : il vaut null. */
  cote: number | null;
  /** L'écart-type d'un laplacien, normalisé : au-dessous, l'image est floue. */
  nettete: number | null;
  /** La luminance moyenne, de 0 à 255. */
  luminance: number | null;
  /** L'écart-type de la luminance : au-dessous, l'image est plate, délavée. */
  contraste: number | null;
  octets: number;
}

/** Le verdict, tel qu'il est gardé avec la pièce et rendu à l'écran. */
export interface Controle {
  gravite: Gravite;
  constats: Constat[];
  /** La fin de validité retenue, prorogation comprise, en ISO. */
  finDeValidite: string | null;
  /** La prorogation de cinq ans des cartes d'identité a joué. */
  prorogee: boolean;
  type: TypeDePiece | null;
  nom: string | null;
  /** Ce qu'on en dit en une phrase, du point de vue du client. */
  resume: string;
  /** Quand le contrôle a eu lieu. */
  faitLe: string;
  /** Le modèle n'a pas répondu : seules les mesures ont joué. */
  lectureIndisponible: boolean;
}

/* ------------------------------------------------------------------------- *
 * La zone lisible par machine
 * ------------------------------------------------------------------------- */

/**
 * La valeur d'un caractère dans le calcul d'une clé de contrôle.
 *
 * Les chiffres valent ce qu'ils écrivent, les lettres leur rang plus neuf - A vaut dix,
 * Z trente-cinq - et le caractère de remplissage vaut zéro.
 */
function valeurMrz(caractere: string): number {
  if (caractere >= "0" && caractere <= "9") return caractere.charCodeAt(0) - 48;
  if (caractere >= "A" && caractere <= "Z") return caractere.charCodeAt(0) - 55;
  return 0;
}

/**
 * La clé de contrôle d'un champ, selon la pondération 7-3-1 de l'OACI.
 *
 * C'est elle qui fait la valeur de cette lecture : une transcription fautive - un 8 lu
 * pour un 6, deux chiffres intervertis - ne tombe presque jamais sur la bonne clé. Une
 * date qui passe ce calcul n'est pas une supposition, c'est une lecture vérifiée.
 */
function cleDeControle(champ: string): number {
  const poids = [7, 3, 1];
  let somme = 0;
  for (let i = 0; i < champ.length; i++) somme += valeurMrz(champ[i]) * poids[i % 3];
  return somme % 10;
}

function champVerifie(champ: string, cle: string): boolean {
  return /^\d$/.test(cle) && cleDeControle(champ) === Number(cle);
}

/**
 * Une date de la MRZ, écrite sur six chiffres, ramenée au calendrier.
 *
 * Le siècle n'y figure pas. Pour une fin de validité, on le tranche au pivot habituel :
 * une pièce qui expire en « 32 » expire en deux mille trente-deux, non en mille neuf
 * cent trente-deux. Pour une naissance, c'est l'inverse qui est vrai de la plupart des
 * gens, et la date ne peut pas être à venir.
 */
function dateDeLaMrz(chiffres: string, sens: "validite" | "naissance"): string | null {
  if (!/^\d{6}$/.test(chiffres)) return null;

  const an = Number(chiffres.slice(0, 2));
  const mois = Number(chiffres.slice(2, 4));
  const jour = Number(chiffres.slice(4, 6));
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;

  const siecle =
    sens === "validite"
      ? an < 80
        ? 2000
        : 1900
      : an > new Date().getUTCFullYear() % 100
        ? 1900
        : 2000;

  const date = new Date(Date.UTC(siecle + an, mois - 1, jour));
  // Le 31 février se replie sur mars : la date était fausse, on ne la garde pas.
  if (date.getUTCMonth() !== mois - 1 || date.getUTCDate() !== jour) return null;

  return date.toISOString().slice(0, 10);
}

export interface MrzLue {
  /** « TD1 » pour une carte au format carte bancaire, « TD3 » pour un passeport. */
  format: "TD1" | "TD3" | "CNI_FR_ANCIENNE";
  finDeValidite: string | null;
  naissance: string | null;
  /** Les clés de contrôle des champs retenus sont toutes tombées juste. */
  verifiee: boolean;
  /**
   * La transcription peut-elle servir de base à un refus ?
   *
   * Une disposition qui porte une date de validité et dont les clés ne tombent pas
   * signale une transcription fautive - et une transcription fautive sur cette image-là
   * jette le doute sur tout ce qui en a été lu, y compris la date lue sur le recto.
   * L'ancienne carte française ne porte pas de date en zone lisible : son absence de
   * clé ne prouve rien, et ne doit donc rien discréditer.
   */
  fiable: boolean;
}

/**
 * Les lignes ramenées à la longueur de leur disposition.
 *
 * Le caractère de remplissage ne porte aucune information : une transcription qui en
 * ajoute deux en fin de ligne, ou en oublie un, décrit le même document. Or la longueur
 * décide de la disposition, et donc de l'endroit où se lisent les dates : sans cette
 * normalisation, une zone parfaitement transcrite à un chevron près n'était reconnue
 * d'aucun format et sa date se perdait. C'est ce qu'a rendu le premier essai contre le
 * modèle.
 *
 * Le rognage ne masque rien : si un caractère utile a été perdu ou ajouté, les clés de
 * contrôle ne tombent pas, et la lecture se tait comme elle doit.
 */
function calibrer(lignes: string[], longueur: number): string[] {
  return lignes.map((ligne) =>
    ligne.length >= longueur
      ? ligne.slice(0, longueur)
      : ligne.padEnd(longueur, "<")
  );
}

/** La disposition dont les lignes s'approchent le plus, à quelques remplissages près. */
const TOLERANCE = 4;

function ressemble(lignes: string[], longueur: number): boolean {
  return lignes.every((l) => Math.abs(l.length - longueur) <= TOLERANCE);
}

/**
 * Lit la zone lisible par machine, quand elle est là et qu'elle se vérifie.
 *
 * Trois dispositions se rencontrent en France. Le passeport suit TD3 - deux lignes de
 * quarante-quatre - et la carte d'identité délivrée depuis deux mille vingt et un suit
 * TD1 - trois lignes de trente ; toutes deux portent la fin de validité, avec sa clé.
 *
 * L'ancienne carte française, elle, suit une disposition nationale de deux lignes de
 * trente-six qui **ne porte pas la fin de validité** : elle se déduit de la date de
 * délivrance, et c'est précisément le cas où la prorogation de cinq ans s'applique. La
 * reconnaître sans en tirer de date n'est donc pas un demi-échec, c'est le bon
 * résultat.
 *
 * Rien n'est rendu si les clés ne tombent pas : une transcription douteuse vaut moins
 * qu'une absence, parce qu'une absence se voit et qu'une date fausse se croit.
 */
export function lireLaMrz(lignes: string[] | null | undefined): MrzLue | null {
  if (!lignes || lignes.length === 0) return null;

  const propres = lignes
    .map((l) => l.toUpperCase().replace(/\s+/g, "").replace(/[«»]/g, "<"))
    .filter((l) => l.length > 0);

  if (propres.length >= 3 && ressemble(propres, 30)) {
    const ligne = calibrer(propres, 30)[1];
    const naissance = dateDeLaMrz(ligne.slice(0, 6), "naissance");
    const validite = dateDeLaMrz(ligne.slice(8, 14), "validite");
    const verifiee =
      champVerifie(ligne.slice(0, 6), ligne[6]) && champVerifie(ligne.slice(8, 14), ligne[14]);
    return {
      format: "TD1",
      finDeValidite: verifiee ? validite : null,
      naissance: verifiee ? naissance : null,
      verifiee,
      fiable: verifiee,
    };
  }

  if (propres.length >= 2 && ressemble(propres, 44)) {
    const ligne = calibrer(propres, 44)[1];
    const naissance = dateDeLaMrz(ligne.slice(13, 19), "naissance");
    const validite = dateDeLaMrz(ligne.slice(21, 27), "validite");
    const verifiee =
      champVerifie(ligne.slice(13, 19), ligne[19]) && champVerifie(ligne.slice(21, 27), ligne[27]);
    return {
      format: "TD3",
      finDeValidite: verifiee ? validite : null,
      naissance: verifiee ? naissance : null,
      verifiee,
      fiable: verifiee,
    };
  }

  if (propres.length >= 2 && ressemble(propres, 36) && propres[0].startsWith("IDFRA")) {
    /*
     * L'ancienne carte française : on la reconnaît, on n'en tire aucune date.
     *
     * Sa disposition est nationale et ne porte pas de fin de validité - celle-ci se
     * déduit de la délivrance, et c'est justement le cas où la prorogation de cinq ans
     * joue. Rendre `null` ici est donc le bon résultat, pas un demi-échec.
     *
     * La date de naissance y figure, mais à des positions que nous n'avons pas pu
     * vérifier sur un document réel : les lire au jugé produirait une date fausse qui
     * passerait pour lue, et de là une carte refusée à tort ou un majeur pris pour un
     * mineur. La lecture du texte imprimé, elle, ne prétend à rien de plus que ce
     * qu'elle est.
     */
    return {
      format: "CNI_FR_ANCIENNE",
      finDeValidite: null,
      naissance: null,
      verifiee: false,
      /*
       * Fiable malgré l'absence de clé vérifiée : cette disposition ne porte pas de date
       * de validité, il n'y avait donc rien à vérifier. La date lue sur le recto reste
       * la seule source, et elle garde toute sa valeur.
       */
      fiable: true,
    };
  }

  return null;
}

/* ------------------------------------------------------------------------- *
 * La péremption
 * ------------------------------------------------------------------------- */

/** Ce qui reste avant l'échéance et qu'on signale sans refuser. */
const JOURS_AVANT_ECHEANCE = 90;

const JOUR = 24 * 60 * 60 * 1000;

function ajouterDesAnnees(iso: string, annees: number): string {
  const date = new Date(iso + "T00:00:00Z");
  date.setUTCFullYear(date.getUTCFullYear() + annees);
  return date.toISOString().slice(0, 10);
}

export interface Validite {
  /** La date qui fait foi, prorogation comprise. */
  fin: string | null;
  prorogee: boolean;
  perimee: boolean;
  /** Elle expire dans moins de trois mois. */
  proche: boolean;
}

/**
 * Jusqu'à quand la pièce vaut, la prorogation des cartes d'identité comprise.
 *
 * Les cartes nationales d'identité délivrées à des majeurs entre deux mille quatre et
 * deux mille treize sont valables quinze ans, alors qu'elles en portent dix : la
 * prorogation est automatique et ne se voit nulle part sur la carte. Refuser sur la
 * date imprimée écarterait donc des pièces que le greffe accepte, et renverrait le
 * client refaire une carte dont il n'a pas besoin.
 *
 * Elle ne vaut que pour les cartes d'identité françaises - un passeport n'est jamais
 * prorogé - et que pour les majeurs : une carte délivrée à un mineur reste valable dix
 * ans. Faute de date de naissance, on ne présume pas la minorité, qui est le cas rare :
 * un mineur crée rarement une société.
 *
 * Elle est signalée plutôt que tenue pour acquise. C'est une règle de droit interne, et
 * une administration étrangère ou un greffe tatillon peut demander autre chose : la
 * pièce passe, et l'avocat voit pourquoi.
 */
export function validiteDeLaPiece(
  fin: string | null,
  options: {
    type: TypeDePiece | null;
    naissance?: string | null;
    delivreeLe?: string | null;
    maintenant?: Date;
  }
): Validite {
  const maintenant = options.maintenant ?? new Date();
  const aujourdhui = maintenant.toISOString().slice(0, 10);

  if (!fin) return { fin: null, prorogee: false, perimee: false, proche: false };

  let retenue = fin;
  let prorogee = false;

  if (options.type === "cni") {
    /*
     * La délivrance se déduit de l'échéance imprimée quand elle n'est pas lue : une
     * carte d'identité de majeur porte dix ans de validité, et c'est ce dont on a
     * besoin pour savoir si elle a été délivrée dans la fenêtre.
     */
    const delivrance = options.delivreeLe ?? ajouterDesAnnees(fin, -10);
    const dansLaFenetre = delivrance >= "2004-01-01" && delivrance <= "2013-12-31";

    const majeurALaDelivrance =
      !options.naissance || ajouterDesAnnees(options.naissance, 18) <= delivrance;

    if (dansLaFenetre && majeurALaDelivrance) {
      retenue = ajouterDesAnnees(fin, 5);
      prorogee = true;
    }
  }

  const perimee = retenue < aujourdhui;
  const proche =
    !perimee &&
    new Date(retenue + "T00:00:00Z").getTime() - maintenant.getTime() < JOURS_AVANT_ECHEANCE * JOUR;

  return { fin: retenue, prorogee, perimee, proche };
}

/* ------------------------------------------------------------------------- *
 * Les seuils de lisibilité
 * ------------------------------------------------------------------------- */

/*
 * Ce qu'il faut à une pièce pour être lisible, en pixels et en niveaux de gris.
 *
 * Une carte d'identité mesure 85 sur 54 millimètres. Numérisée à trois cents points par
 * pouce - ce que tout greffe attend d'une copie - elle fait mille pixels dans sa
 * longueur ; en dessous de neuf cents, le numéro et les dates ne se relisent plus après
 * impression. Entre les deux, cela passe souvent, et l'avocat tranche.
 */
const COTE_REFUSE = 900;
const COTE_RESERVE = 1400;

/*
 * La netteté est l'écart-type d'un laplacien : plus l'image porte de transitions
 * franches, plus il monte. L'image est ramenée à mille pixels de large avant la mesure,
 * pour que le seuil ne dépende pas de la définition de l'appareil.
 *
 * Les seuils viennent d'un étalonnage sur du texte imprimé progressivement flouté : un
 * document net tient au-dessus de quarante, un flou de rayon deux pixels tombe à huit,
 * un flou de rayon trois à trois. Ils sont posés bas volontairement. Une photographie
 * réelle - une carte tenue à la main, sous un éclairage domestique - mesure bien moins
 * que du texte de synthèse, et un refus de trop coûte plus cher qu'une réserve de trop :
 * le client redépose la même carte sans comprendre ce qu'on lui reproche. La lisibilité
 * proprement dite est jugée ailleurs, par la lecture, qui sait ce qu'elle regarde.
 */
const NETTETE_REFUSE = 5;
const NETTETE_RESERVE = 10;

/* Une image trop sombre : la moyenne le dit, sur deux cent cinquante-six niveaux. */
const LUMINANCE_BASSE = 55;
/* Un contraste effondré : photocopie délavée, ou photographie à travers une vitre. */
const CONTRASTE_FAIBLE = 18;

/*
 * La surexposition n'est pas mesurée ici, et c'est délibéré.
 *
 * La part de pixels brûlés la trahit sur une photographie prise au flash - mais une
 * numérisation posée sur une vitre de scanner rend la même part de blanc pur, par la
 * marge de la page, et serait refusée alors qu'elle est parfaite. Faute de savoir où
 * finit la carte et où commence le fond, la mesure confondrait les deux. Le reflet et
 * la mention illisible, eux, sont rapportés par la lecture, qui regarde le document et
 * non ses octets : c'est le bon endroit pour cette question.
 */

/* Une image d'identité en dessous de ce poids a été recompressée à en perdre le texte. */
const OCTETS_RESERVE = 40 * 1024;

/* ------------------------------------------------------------------------- *
 * Le verdict
 * ------------------------------------------------------------------------- */

function pire(constats: Constat[]): Gravite {
  if (constats.some((c) => c.gravite === "refusee")) return "refusee";
  if (constats.length > 0) return "reserve";
  return "acceptee";
}

/** « 14 septembre 2026 ». */
function enClair(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(iso + "T00:00:00Z")
  );
}

/**
 * Le nom lu correspond-il à celui qu'on attend ?
 *
 * La comparaison est volontairement lâche : accents retirés, casse ignorée, particules
 * et traits d'union ramenés à des espaces. Un nom composé se saisit de dix façons, et
 * refuser une pièce parce qu'un client a écrit « Le Gall » quand sa carte porte
 * « LEGALL » serait lui opposer une orthographe, non une identité.
 *
 * On cherche donc si le nom attendu se retrouve dans ce qui est lu, ou l'inverse : la
 * carte porte le nom de naissance, le dossier parfois le nom d'usage.
 */
function memeNom(lu: string | null, attendu: string | null | undefined): boolean | null {
  if (!lu || !attendu) return null;

  const normaliser = (texte: string) =>
    texte
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "");

  const a = normaliser(lu);
  const b = normaliser(attendu);
  if (!a || !b) return null;
  return a.includes(b) || b.includes(a);
}

export interface ElementsDuControle {
  lecture: LectureDeLaPiece | null;
  mesures: MesuresDeLaPiece | null;
  /** Le nom du titulaire attendu, quand le dossier le connaît. */
  nomAttendu?: string | null;
  /**
   * La lecture n'a pas été tentée, et n'avait pas à l'être.
   *
   * Une image que les mesures refusent déjà - trop petite, floue à ne rien y lire - est
   * refusée quoi que le modèle en rapporte. Ne pas l'y envoyer épargne un appel payant
   * et quelques secondes d'attente sur une pièce dont le sort est scellé.
   *
   * Cela se distingue d'une lecture indisponible : là, le service manquait et la
   * validité reste inconnue ; ici, elle n'a aucune importance.
   */
  lectureInutile?: boolean;
  maintenant?: Date;
}

/**
 * Le verdict, à partir de ce qui a été mesuré et de ce qui a été lu.
 *
 * Trois issues, et une seule bloque. Une pièce refusée retient le règlement : elle est
 * périmée, ce n'est pas une pièce d'identité, ou elle est illisible - trois choses que
 * le greffe rejettera à coup sûr, et qu'il vaut mieux découvrir maintenant. Une réserve
 * ne retient rien : elle se lit à l'écran et suit la pièce jusqu'à l'avocat, qui
 * tranche. Le reste passe sans un mot.
 *
 * La lecture manquante ne refuse jamais. Un modèle qui ne répond pas est une panne de
 * notre côté, et faire porter une panne au client - « votre pièce est refusée » alors
 * qu'elle est parfaite - serait le pire des deux mondes : il redépose la même carte,
 * indéfiniment.
 */
export function controler(elements: ElementsDuControle): Controle {
  const { lecture, mesures } = elements;
  const maintenant = elements.maintenant ?? new Date();
  const constats: Constat[] = [];

  /* Ce qui se mesure sur l'image, sans rien comprendre à ce qu'elle montre. */
  if (mesures) {
    if (mesures.cote !== null && mesures.cote < COTE_REFUSE) {
      constats.push({
        code: "definition",
        gravite: "refusee",
        phrase:
          "L'image est trop petite pour que les mentions se relisent. Photographiez la pièce de plus près, ou numérisez-la.",
      });
    } else if (mesures.cote !== null && mesures.cote < COTE_RESERVE) {
      constats.push({
        code: "definition-juste",
        gravite: "reserve",
        phrase: "L'image est peu définie : les petits caractères risquent de ne pas ressortir.",
      });
    }

    if (mesures.nettete !== null && mesures.nettete < NETTETE_REFUSE) {
      constats.push({
        code: "flou",
        gravite: "refusee",
        phrase:
          "L'image est floue. Posez la pièce à plat, calez votre appareil, et reprenez la photo.",
      });
    } else if (mesures.nettete !== null && mesures.nettete < NETTETE_RESERVE) {
      constats.push({
        code: "nettete-juste",
        gravite: "reserve",
        phrase: "L'image manque un peu de netteté.",
      });
    }

    /*
     * Sombre ou délavée, mais pas les deux à la fois.
     *
     * Une image sous-exposée a mécaniquement peu de contraste : les deux constats
     * tombaient ensemble et disaient deux fois la même chose au client, qui lisait
     * « deux points à vérifier » là où il n'y en avait qu'un. La cause première
     * l'emporte, et c'est aussi celle dont on sait quoi faire.
     */
    if (mesures.luminance !== null && mesures.luminance < LUMINANCE_BASSE) {
      constats.push({
        code: "sombre",
        gravite: "reserve",
        phrase:
          "L'image est sombre : placez-vous près d'une fenêtre plutôt que d'utiliser le flash.",
      });
    } else if (mesures.contraste !== null && mesures.contraste < CONTRASTE_FAIBLE) {
      constats.push({
        code: "contraste",
        gravite: "reserve",
        phrase: "L'image est délavée : le texte se détache mal du fond.",
      });
    }
    /*
     * Un fichier léger n'est un signe que sur une image par ailleurs grande.
     *
     * Les deux constats vont de pair - une image peu définie pèse peu - et se lisaient
     * comme deux reproches distincts alors qu'ils décrivent le même défaut. Ils sont
     * exclusifs : ce qui reste ici est le cas qui apprend vraiment quelque chose, une
     * image de bonne taille recompressée à en perdre le texte.
     */
    if (
      mesures.cote !== null &&
      mesures.cote >= COTE_RESERVE &&
      mesures.octets < OCTETS_RESERVE
    ) {
      constats.push({
        code: "compressee",
        gravite: "reserve",
        phrase: "Le fichier est très compressé : déposez plutôt l'original, sans le réduire.",
      });
    }
  }

  /* Ce que la lecture rapporte du document lui-même. */
  let validite: Validite = { fin: null, prorogee: false, perimee: false, proche: false };

  if (!lecture) {
    return {
      gravite: pire(constats),
      constats,
      finDeValidite: null,
      prorogee: false,
      type: null,
      nom: null,
      resume: resumer(pire(constats), constats, validite, true),
      faitLe: maintenant.toISOString(),
      lectureIndisponible: !elements.lectureInutile,
    };
  }

  if (!lecture.estUnePieceDIdentite) {
    constats.push({
      code: "pas-une-piece",
      gravite: "refusee",
      phrase:
        "Ce document ne ressemble pas à une pièce d'identité. Déposez une carte nationale d'identité, un passeport ou un titre de séjour.",
    });
  }

  if (lecture.bordsCoupes) {
    constats.push({
      code: "bords-coupes",
      gravite: "refusee",
      phrase:
        "La pièce est rognée : un bord ou un coin manque. Cadrez le document entier, bandes du bas comprises.",
    });
  }

  if (lecture.champsIllisibles.length > 0) {
    const liste = lecture.champsIllisibles.slice(0, 3).join(", ");
    constats.push({
      code: "champs-illisibles",
      gravite: "refusee",
      phrase: "Des mentions ne se lisent pas sur la pièce : " + liste + ".",
    });
  }

  if (lecture.refletOuOmbre) {
    constats.push({
      code: "reflet",
      gravite: "reserve",
      phrase: "Un reflet ou une ombre couvre une partie de la pièce.",
    });
  }

  /*
   * Une zone lisible par machine absente en dit long, même quand rien d'autre ne cloche.
   *
   * Toute carte d'identité et tout passeport en portent une. Ne pas l'avoir transcrite
   * signifie qu'elle sort du cadre, qu'elle est masquée, ou qu'elle ne se lit pas - et
   * c'est justement la seule partie du document dont la lecture se vérifie. Sur l'essai
   * d'une carte volontairement rognée sous la zone, le modèle n'a pas signalé le
   * rognage : rien n'aurait alors averti que ce qui manque est précisément la bande qui
   * fait foi.
   */
  if (
    lecture.estUnePieceDIdentite &&
    (lecture.type === "cni" || lecture.type === "passeport") &&
    !lecture.mrz
  ) {
    constats.push({
      code: "zone-machine-absente",
      gravite: "reserve",
      phrase:
        "La bande de caractères du bas ne se lit pas : cadrez la pièce entière, jusqu'au bord inférieur.",
    });
  }

  /*
   * La MRZ passe devant la lecture du texte imprimé.
   *
   * Ses clés de contrôle valident la transcription, ce qu'aucune lecture de date
   * imprimée ne peut faire : une date qui en sort a été vérifiée, une date lue sur le
   * recto a seulement été crue.
   */
  const mrz = lireLaMrz(lecture.mrz);
  const finLue = mrz?.finDeValidite ?? lecture.finDeValidite;

  validite = validiteDeLaPiece(finLue, {
    type: lecture.type,
    naissance: mrz?.naissance,
    delivreeLe: lecture.delivreeLe,
    maintenant,
  });

  /*
   * Une péremption ne se prononce que sur une lecture qui tient.
   *
   * Le premier essai contre le modèle l'a montré sur une carte floutée : il a transcrit
   * une zone lisible par machine entièrement inventée, et une date de validité avec. Les
   * clés de contrôle l'ont démasquée - mais la date lue sur le recto, elle, venait de la
   * même lecture et ne valait pas mieux. Refuser la pièce là-dessus, c'est opposer au
   * client une date que personne n'a lue.
   *
   * Quand la transcription se contredit, la péremption devient donc une réserve : la
   * pièce n'est pas retenue, et c'est l'avocat qui regarde la carte.
   */
  const lectureFiable = !mrz || mrz.fiable;

  if (!finLue && lecture.estUnePieceDIdentite) {
    constats.push({
      code: "validite-inconnue",
      gravite: "reserve",
      phrase: "La date de fin de validité n'a pas pu être lue sur la pièce.",
    });
  } else if (validite.perimee) {
    constats.push({
      code: "perimee",
      gravite: lectureFiable ? "refusee" : "reserve",
      phrase: lectureFiable
        ? "Cette pièce n'est plus valable : elle a expiré le " +
          enClair(validite.fin!) +
          ". Le greffe n'accepte qu'une pièce en cours de validité."
        : "La date lue indique une pièce expirée le " +
          enClair(validite.fin!) +
          ", mais la lecture est incertaine : l'avocat la vérifiera.",
    });
  } else if (validite.proche) {
    constats.push({
      code: "echeance-proche",
      gravite: "reserve",
      phrase: "Cette pièce expire le " + enClair(validite.fin!) + ", bientôt.",
    });
  }

  if (validite.prorogee && !validite.perimee) {
    constats.push({
      code: "prorogee",
      gravite: "reserve",
      phrase:
        "Cette carte porte une échéance dépassée, mais elle est prorogée de cinq ans de plein droit : elle reste valable jusqu'au " +
        enClair(validite.fin!) +
        ".",
    });
  }

  if (memeNom(lecture.nom, elements.nomAttendu) === false) {
    constats.push({
      code: "nom-different",
      gravite: "reserve",
      phrase:
        "Le nom lu sur la pièce (" +
        lecture.nom +
        ") ne correspond pas à celui du dossier (" +
        elements.nomAttendu +
        ").",
    });
  }

  const gravite = pire(constats);

  return {
    gravite,
    constats,
    finDeValidite: validite.fin,
    prorogee: validite.prorogee,
    type: lecture.type,
    nom: lecture.nom,
    resume: resumer(gravite, constats, validite, false),
    faitLe: maintenant.toISOString(),
    lectureIndisponible: false,
  };
}

/**
 * Ce qu'on en dit en une phrase.
 *
 * Elle est ce que le client lit en premier, souvent la seule chose qu'il lise : elle
 * porte donc le motif qui bloque, et non un compte de constats.
 */
function resumer(
  gravite: Gravite,
  constats: Constat[],
  validite: Validite,
  sansLecture: boolean
): string {
  if (gravite === "refusee") {
    const bloquant = constats.find((c) => c.gravite === "refusee")!;
    return bloquant.phrase;
  }
  if (gravite === "reserve") {
    return constats.length === 1
      ? constats[0].phrase
      : "Pièce reçue, avec " + constats.length + " points que l'avocat vérifiera.";
  }
  if (sansLecture) return "Pièce reçue. Elle sera vérifiée par l'avocat.";
  if (validite.fin) return "Pièce reçue, valable jusqu'au " + enClair(validite.fin) + ".";
  return "Pièce reçue.";
}

/**
 * Les mesures suffisent-elles à refuser, sans rien lire ?
 *
 * Une image trop petite ou trop floue pour qu'un caractère s'en détache est refusée
 * quelle que soit la pièce photographiée : la faire lire coûte un appel et une attente
 * pour aboutir au même refus, formulé moins bien - « ce document ne ressemble pas à une
 * pièce d'identité » quand le vrai motif est qu'on n'y voit rien.
 *
 * La question se pose au domaine plutôt qu'à l'appelant : c'est ici que vivent les
 * seuils, et une copie du seuil dans l'infrastructure s'en écarterait au premier
 * ajustement.
 */
export function lesMesuresSuffisentARefuser(mesures: MesuresDeLaPiece | null): boolean {
  if (!mesures) return false;
  return controler({ lecture: null, mesures, lectureInutile: true }).gravite === "refusee";
}

/**
 * Le verdict gardé avec une pièce, relu.
 *
 * Un JSON illisible n'arrête rien. La colonne n'est écrite que par le contrôle, mais
 * elle traverse des migrations et des restaurations, et une pièce dont le verdict ne se
 * relit pas doit s'afficher comme une pièce sans verdict - non casser l'écran qui la
 * liste, ni faire échouer la page d'un dossier entier pour une ligne de JSON.
 */
export function lireLeControle(json: string | null | undefined): Controle | null {
  if (!json) return null;
  try {
    const lu = JSON.parse(json) as Controle;
    return lu && typeof lu.gravite === "string" && Array.isArray(lu.constats) ? lu : null;
  } catch {
    return null;
  }
}

/**
 * Une pièce déjà au dossier, telle que les écrans de dépôt la lisent.
 *
 * Le motif de refus et le verdict sont facultatifs : seules les pièces d'identité en
 * portent, et un parcours qui n'en attend pas n'a rien à passer.
 */
export interface PieceDeposee {
  type: string | null;
  nom: string;
  motifRejet?: string | null;
  controle?: Controle | null;
}

/**
 * Une ligne de la table des documents, ramenée à ce que l'écran de dépôt affiche.
 *
 * Elle vit ici, et non dans chacune des pages, parce que les trois parcours qui
 * déposent des pièces la construisaient chacun de leur côté : ajouter le verdict
 * demandait de retrouver trois expressions identiques à un champ près, et d'en oublier
 * une se serait vu par une carte qui n'affiche rien.
 *
 * L'argument est décrit par sa forme plutôt que par le type de Prisma : le domaine ne
 * connaît pas la base, et cette fonction n'a besoin que de quatre colonnes.
 */
export function enPieceDeposee(document: {
  type: string | null;
  name: string;
  rejection_reason?: string | null;
  controle_json?: string | null;
}): PieceDeposee {
  return {
    type: document.type,
    nom: document.name,
    motifRejet: document.rejection_reason ?? null,
    controle: lireLeControle(document.controle_json),
  };
}
