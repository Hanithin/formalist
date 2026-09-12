/**
 * Reconnaître ce qu'on vient de déposer.
 *
 * Le dépôt acceptait tout PDF et n'en disait rien. Un relevé bancaire, une pièce
 * d'identité, les statuts d'une autre société : le fichier entrait dans la liste des
 * accords avec ses quatre champs vides, exactement comme un accord qu'on n'a pas su
 * lire. Rien ne distinguait « je n'ai pas réussi à lire ce contrat » de « ceci n'est pas
 * un contrat », et c'est pourtant la différence entre une saisie à faire à la main et un
 * fichier à retirer.
 *
 * La lecture, elle, ne change pas : ce qui est reconnu est proposé, ce qui manque est
 * dit, et rien n'est tenu pour acquis. La nature s'ajoute à côté, pour que l'écran
 * sache quoi montrer avant que le dossier ne soit touché.
 */

export type NatureDuDepot = "air" | "autre_accord" | "hors_sujet" | "illisible";

export interface Reconnaissance {
  nature: NatureDuDepot;
  /** Ce qu'on affiche : une phrase, pas un code. */
  libelle: string;
  /**
   * Ce sur quoi la reconnaissance s'appuie, en clair.
   *
   * Un verdict sans motif ne se discute pas : celui qui voit « Sans rapport » sur un
   * contrat qu'il sait être un accord doit pouvoir comprendre d'où vient l'erreur, et
   * passer outre en connaissance de cause.
   */
  indices: string[];
}

/**
 * Les marqueurs du gabarit, français et anglais.
 *
 * Ce sont ceux des accords réels : le titre anglais, la mention « BSA AIR » qui le
 * suit, la partie nommée « AIR Investor », et la valorisation post-money qui est le
 * propre de ces contrats - un BSA ordinaire n'en porte pas.
 */
const MARQUEURS_AIR: [RegExp, string][] = [
  [/\bBSA\s*AIR\b/i, "la mention « BSA AIR »"],
  [/FAST\s+INVESTMENT\s+AGREEMENT/i, "le titre « Fast Investment Agreement »"],
  [/\bAIR\s+Investor\b/i, "la partie « AIR Investor »"],
  [/accord\s+d['’]investissement\s+rapide/i, "la mention « accord d'investissement rapide »"],
  [/valorisation\s+post[\s-]?money/i, "la valorisation post-money"],
  [/post[\s-]?money\s+valuation/i, "la « post-money valuation »"],
];

/**
 * Ce qui dit un investissement sans dire lequel.
 *
 * Un BSPCE, une obligation convertible, un bulletin de souscription : le document parle
 * bien de lever des fonds, mais ce n'est pas le gabarit que la lecture sait dépouiller.
 * Le distinguer d'un hors-sujet évite de crier au fichier égaré devant un contrat qui a
 * tout à fait sa place au dossier - il demandera seulement une saisie à la main.
 */
const MARQUEURS_INVESTISSEMENT: [RegExp, string][] = [
  [/bons?\s+de\s+souscription/i, "des bons de souscription"],
  [/\bBSPCE\b/i, "la mention « BSPCE »"],
  [/obligations?\s+convertibles?/i, "des obligations convertibles"],
  [/convertible\s+notes?/i, "une « convertible note »"],
  [/subscription\s+agreement/i, "un « subscription agreement »"],
  [/bulletin\s+de\s+souscription/i, "un bulletin de souscription"],
  [/augmentation\s+de\s+capital/i, "une augmentation de capital"],
  [/levée\s+de\s+fonds/i, "une levée de fonds"],
  [/\binvestisseur\b/i, "la mention « investisseur »"],
];

/**
 * Ce qu'on reconnaît pour pouvoir le nommer.
 *
 * « Sans rapport » est un verdict pauvre : dire « ceci ressemble à un extrait Kbis »
 * fait comprendre l'erreur en une seconde - on s'est trompé de fichier dans le
 * sélecteur - là où « sans rapport » laisse chercher.
 */
const AUTRES_DOCUMENTS: [RegExp, string][] = [
  [/extrait\s+Kbis|greffe\s+du\s+tribunal\s+de\s+commerce/i, "un extrait Kbis"],
  [/carte\s+nationale\s+d['’]identité|passeport|titre\s+de\s+séjour/i, "une pièce d'identité"],
  [/relevé\s+d['’]identité\s+bancaire|\bIBAN\b|\bBIC\b/i, "un relevé d'identité bancaire"],
  [/statuts\s+constitutifs|statuts\s+mis\s+à\s+jour/i, "des statuts"],
  [/procès[\s-]verbal/i, "un procès-verbal"],
  [/facture\s+n|montant\s+TTC|TVA\s+\d/i, "une facture"],
  [/attestation\s+de\s+dépôt\s+(de\s+)?(des\s+)?fonds/i, "une attestation de dépôt de fonds"],
];

/** Combien de signes d'un texte suffisent à dire qu'il y a bien du texte. */
const TEXTE_MINIMAL = 200;

function trouves(texte: string, marqueurs: [RegExp, string][]): string[] {
  return marqueurs.filter(([motif]) => motif.test(texte)).map(([, libelle]) => libelle);
}

/**
 * Ce qu'est le document déposé, autant qu'on puisse le dire de son texte.
 *
 * L'ordre des questions est celui de la certitude. Un texte absent ne permet aucun
 * verdict - on ne dit pas d'un PDF numérisé qu'il est hors sujet, on dit qu'on ne l'a
 * pas lu. Ensuite les marqueurs du gabarit, qui sont sans ambiguïté. Puis le vocabulaire
 * de l'investissement, qui situe sans identifier. Et faute de tout cela, on nomme ce
 * qu'on croit reconnaître.
 */
export function natureDuDepot(texte: string | null): Reconnaissance {
  const brut = (texte ?? "").replace(/\s+/g, " ").trim();

  if (brut.length < TEXTE_MINIMAL) {
    return {
      nature: "illisible",
      libelle: "Illisible - aucune couche texte",
      indices: [
        "Un PDF numérisé, ou une signature électronique qui a aplati le texte. Les quatre champs se saisissent à la main.",
      ],
    };
  }

  const air = trouves(brut, MARQUEURS_AIR);
  if (air.length > 0) {
    return { nature: "air", libelle: "Accord BSA AIR reconnu", indices: air };
  }

  const investissement = trouves(brut, MARQUEURS_INVESTISSEMENT);
  if (investissement.length > 0) {
    return {
      nature: "autre_accord",
      libelle: "Accord d'investissement, gabarit non reconnu",
      indices: investissement,
    };
  }

  const autre = trouves(brut, AUTRES_DOCUMENTS);
  return {
    nature: "hors_sujet",
    libelle:
      autre.length > 0
        ? "Ceci ressemble à " + autre[0]
        : "Ce document ne ressemble pas à un accord",
    indices: autre,
  };
}

/**
 * Ce qui est retenu d'avance, et ce qui demande un geste.
 *
 * Un accord reconnu et un accord qu'on n'a pas su lire entrent cochés : le second est un
 * cas fréquent et parfaitement légitime - un contrat numérisé reste un contrat - et le
 * décocher ajouterait un geste à chaque dépôt.
 *
 * Ce qui ne ressemble pas à un accord arrive décoché, sans être refusé. La
 * reconnaissance peut se tromper sur un gabarit qu'on n'a jamais vu, et bloquer
 * sèchement arrêterait un dossier légitime ; décocher demande seulement qu'on l'inclue
 * en connaissance de cause.
 */
export function retenuDAvance(nature: NatureDuDepot): boolean {
  return nature !== "hors_sujet";
}
