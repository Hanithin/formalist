import {
  champObligatoire,
  champsASaisir,
  definitions,
  pourquoiPasDeSocieteRepresentante,
  type Cosignataire,
  type Valeurs,
} from "./types";
import { regimeDeLAugmentation } from "./souscription";
import { verifierApport } from "./apport";
import { anomaliesDuPvAge } from "./pv-age";
import { anomaliesDuTraite } from "./traite-apport";
import { anomaliesDeLActeDeCession } from "./acte-cession";
import { verifierCessions } from "./cession";
import type { ContexteGabarit } from "./gabarit";
import { anomaliesDuTour, type ContratAir } from "./air";
import { diviseurDuNominal } from "./constatation";

/**
 * Ce qui manque, et ce qui ne tient pas debout.
 *
 * Deux familles de contrôle. Les champs vides, qui laisseraient un blanc dans un
 * acte. Et les valeurs incohérentes - une augmentation qui diminue le capital, une
 * prorogation qui le raccourcit - qui passeraient la validation de forme et se
 * feraient refuser au greffe, plusieurs semaines plus tard.
 */

export interface Anomalie {
  champ: string;
  message: string;
}

export interface Societe {
  denomination?: string | null;
  siren?: string | null;
  forme?: string | null;
  adresse?: string | null;
  codePostal?: string | null;
  ville?: string | null;
  capital?: number | null;
}

const CODE_POSTAL = /^\d{5}$/;
const SIREN = /^\d{9}$/;

/** La société sur laquelle porte la modification est-elle identifiée ? */
export function verifierSociete(societe: Societe): Anomalie[] {
  const anomalies: Anomalie[] = [];

  if (!societe.denomination?.trim()) {
    anomalies.push({ champ: "denomination", message: "La dénomination est requise" });
  }
  if (!societe.forme?.trim()) {
    anomalies.push({ champ: "forme", message: "La forme juridique est requise" });
  }

  const siren = (societe.siren ?? "").replace(/\s/g, "");
  if (!siren) {
    anomalies.push({ champ: "siren", message: "Le SIREN est requis" });
  } else if (!SIREN.test(siren)) {
    anomalies.push({ champ: "siren", message: "Le SIREN comporte neuf chiffres" });
  }

  if (!societe.adresse?.trim()) {
    anomalies.push({ champ: "adresse", message: "L'adresse du siège est requise" });
  }

  const cp = (societe.codePostal ?? "").trim();
  if (!cp) {
    anomalies.push({ champ: "codePostal", message: "Le code postal est requis" });
  } else if (!CODE_POSTAL.test(cp)) {
    anomalies.push({ champ: "codePostal", message: "Le code postal comporte cinq chiffres" });
  }

  return anomalies;
}

/**
 * Le représentant légal, sans qui le pouvoir ne vaut rien.
 *
 * L'avocat dépose au guichet unique sous son identité, pour le compte de la société :
 * c'est le pouvoir qui l'y autorise, et le pouvoir identifie son signataire comme le
 * ferait un notaire. Ces champs étaient facultatifs - un dossier entier pouvait aller
 * jusqu'aux actes et produire « Monsieur - -, né le - à - », un document que le guichet
 * refuse et qui ne se répare qu'en refaisant la formalité.
 *
 * La nationalité n'est pas exigée : l'acte retombe sur « française », qui est la
 * mention par défaut assumée ailleurs dans le produit. Le reste n'a pas de défaut
 * possible - on n'invente ni une date de naissance ni un domicile.
 */
export function verifierLeRepresentant(
  valeurs: Valeurs,
  /** La forme de la société : elle décide de ce qu'un représentant peut être. */
  forme?: string | null
): Anomalie[] {
  const anomalies: Anomalie[] = [];
  const vide = (champ: string) => {
    const valeur = valeurs[champ];
    return typeof valeur === "number" ? false : !(valeur ?? "").trim();
  };
  const exiger = (champ: string, message: string) => {
    if (vide(champ)) anomalies.push({ champ, message });
  };

  if ((valeurs.signataireNature ?? "physique") === "morale") {
    /*
     * Toutes les formes ne l'admettent pas.
     *
     * Une SARL est gérée par des personnes physiques (L. 223-18), une SA aussi. Le choix
     * était offert partout et des dossiers l'ont pris : le refus les nomme plutôt que de
     * laisser partir un pouvoir signé par qui ne peut pas l'être.
     */
    const interdit = pourquoiPasDeSocieteRepresentante(forme);
    if (interdit) anomalies.push({ champ: "signataireNature", message: interdit });


    exiger(
      "signataireSocieteDenomination",
      "La dénomination de la société représentante est requise"
    );
    exiger("signataireSocieteForme", "La forme de la société représentante est requise");
    exiger("signataireSocieteSiege", "Le siège de la société représentante est requis");

    const siren = String(valeurs.signataireSocieteSiren ?? "").replace(/\s/g, "");
    if (!siren) {
      anomalies.push({
        champ: "signataireSocieteSiren",
        message: "Le SIREN de la société représentante est requis",
      });
    } else if (!SIREN.test(siren)) {
      anomalies.push({
        champ: "signataireSocieteSiren",
        message: "Le SIREN de la société représentante comporte neuf chiffres",
      });
    }

    exiger("signatairePrenom", "Le prénom de qui représente cette société est requis");
    exiger("signataireNom", "Le nom de qui représente cette société est requis");
    exiger(
      "signataireRepresentantQualite",
      "La qualité de qui représente cette société est requise"
    );
    return anomalies;
  }

  exiger("signatairePrenom", "Le prénom du représentant légal est requis");
  exiger("signataireNom", "Le nom du représentant légal est requis");
  exiger("signataireNeLe", "La date de naissance du représentant légal est requise");
  exiger("signataireNeA", "Le lieu de naissance du représentant légal est requis");
  exiger("signataireAdresse", "L'adresse du représentant légal est requise");
  return anomalies;
}

/**
 * Ceux qui signent le pouvoir avec lui.
 *
 * Le même acte, les mêmes exigences : il les identifie comme le ferait un notaire, et
 * un cosignataire à moitié saisi donne « Valentin MARIE, né le - à - » sur un document
 * que le guichet refuse. La civilité y est exigée là où elle ne l'est pas pour le
 * premier - lui garde un défaut à « Monsieur », posé pour les dossiers d'avant qui
 * n'avaient pas la case ; une ligne qu'on vient d'ajouter n'a pas cette excuse, et
 * c'est elle qui accorde « né » ou « née ».
 *
 * Une ligne entièrement vide ne compte pas : c'est un ajout qu'on n'a pas rempli, et
 * l'on s'en débarrasse par sa croix, non par six reproches.
 */
export function verifierLesCosignataires(cosignataires: Cosignataire[] = []): Anomalie[] {
  const anomalies: Anomalie[] = [];

  cosignataires.forEach((personne, rang) => {
    const lu = (cle: keyof Cosignataire) => (personne[cle] ?? "").trim();
    const entierementVide = (
      ["civilite", "prenom", "nom", "neLe", "neA", "nationalite", "adresse"] as const
    ).every((cle) => !lu(cle));
    if (entierementVide) return;

    const exiger = (cle: keyof Cosignataire, quoi: string) => {
      if (!lu(cle)) {
        anomalies.push({
          champ: "cosignataire-" + rang + "-" + cle,
          message: quoi + " du cosignataire " + (rang + 1) + " est requis" ,
        });
      }
    };

    exiger("civilite", "La civilité");
    exiger("prenom", "Le prénom");
    exiger("nom", "Le nom");
    exiger("neLe", "La date de naissance");
    exiger("neA", "Le lieu de naissance");
    exiger("adresse", "L'adresse");
  });

  return anomalies;
}

function nombre(valeur: string | number | undefined): number | null {
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : null;
  if (typeof valeur !== "string" || !valeur.trim()) return null;
  const lu = Number(valeur.replace(",", "."));
  return Number.isFinite(lu) ? lu : null;
}

/** Les champs de la sélection, remplis ou non. */
export function verifierChamps(
  codes: string[],
  valeurs: Valeurs,
  /* La forme décide de la visibilité de quelques champs : un champ tu n'est pas dû. */
  forme?: string | null
): Anomalie[] {
  const anomalies: Anomalie[] = [];

  for (const champ of champsASaisir(codes, valeurs, forme)) {
    if (!champObligatoire(champ, valeurs)) continue;
    const valeur = valeurs[champ.identifiant];

    if (champ.type === "nombre") {
      const lu = nombre(valeur);
      if (lu === null || lu <= 0) {
        anomalies.push({ champ: champ.identifiant, message: champ.libelle + " est requis" });
      }
      continue;
    }

    if (typeof valeur !== "string" || !valeur.trim()) {
      anomalies.push({ champ: champ.identifiant, message: champ.libelle + " est requis" });
    }
  }

  return anomalies;
}

/**
 * Les incohérences.
 *
 * Elles ne se voient pas à la lecture d'un formulaire rempli : « augmentation de
 * 5 000 à 1 000 » se saisit sans effort et ne se remarque qu'au refus du greffe.
 */
export function verifierCoherence(
  codes: string[],
  valeurs: Valeurs,
  /* La forme décide du droit préférentiel : une société de personnes n'en a pas. */
  forme?: string | null
): Anomalie[] {
  const anomalies: Anomalie[] = [];

  if (codes.includes("transfert_siege")) {
    const cp = valeurs.nouveauCodePostal;
    if (typeof cp === "string" && cp.trim() && !CODE_POSTAL.test(cp.trim())) {
      anomalies.push({
        champ: "nouveauCodePostal",
        message: "Le code postal comporte cinq chiffres",
      });
    }

    /*
     * Le SIREN du domiciliataire se contrôle comme celui de la société.
     *
     * Il part au registre dans la déclaration du domicilié : un chiffre de travers y
     * désigne une autre entreprise, et le greffe le voit avant nous.
     */
    const siren = valeurs.domiciliataireSiren;
    if (typeof siren === "string" && siren.trim() && !SIREN.test(siren.replace(/\s/g, ""))) {
      anomalies.push({
        champ: "domiciliataireSiren",
        message: "Le SIREN du domiciliataire comporte neuf chiffres",
      });
    }
  }

  if (codes.includes("augmentation_capital")) {
    const avant = nombre(valeurs.capitalActuelAugm);
    const apres = nombre(valeurs.nouveauCapitalAugm);
    if (avant !== null && apres !== null && apres <= avant) {
      anomalies.push({
        champ: "nouveauCapitalAugm",
        message: "Une augmentation porte le capital au-dessus de sa valeur actuelle",
      });
    }
  }

  /*
   * L'apport de titres a ses propres incohérences.
   *
   * Apporter plus de titres qu'il n'en existe, ou retenir une valeur que la valeur
   * nominale ne divise pas : le formulaire les laisse passer, et c'est l'acte qui
   * porte l'absurdité jusqu'au greffe. Le détail est dans apport.ts, avec le reste
   * des règles de l'opération.
   */
  if (codes.includes("apport_titres")) {
    anomalies.push(...verifierApport(valeurs));

    /*
     * Deux fois la même augmentation en numéraire.
     *
     * Le bloc de l'apport porte un champ « Augmentation en numéraire préalable » : il
     * sert à faire grossir le capital juste avant l'apport, pour passer sous la moitié
     * et se dispenser d'un commissaire. C'est exactement ce que fait le bloc
     * « Augmentation de capital » quand on le coche aussi - et l'acte compterait alors
     * deux fois la même opération, une fois par résolution.
     *
     * On tranche plutôt que d'additionner : deux résolutions pour un seul versement
     * laisseraient une chaîne juste et un récit faux.
     */
    if (codes.includes("augmentation_capital") && nombre(valeurs.apportNumeraire)) {
      anomalies.push({
        champ: "apportNumeraire",
        message:
          "L'augmentation en numéraire est déjà décidée dans le bloc « Augmentation de " +
          "capital » : laissez ce champ vide, l'apport partira du capital qu'elle laisse.",
      });
    }
  }

  /*
   * Ce que la voie retenue impose, et que le formulaire seul ne dit pas.
   *
   * Supprimer le droit préférentiel exige le rapport spécial d'un commissaire aux
   * comptes : l'assemblée écarte le droit de tous, y compris de ceux qui votent contre,
   * et c'est un tiers indépendant qui se prononce alors sur le prix. Une société qui
   * n'a pas de commissaire doit en désigner un avant de voter la suppression - le
   * dossier ne peut pas partir sans son nom.
   */
  if (codes.includes("augmentation_capital")) {
    const regime = regimeDeLAugmentation(forme, valeurs);
    if (regime.commissaireRequis && !String(valeurs.commissaireDps ?? "").trim()) {
      anomalies.push({
        champ: "commissaireDps",
        message:
          "La suppression du droit préférentiel exige le rapport spécial d'un commissaire " +
          "aux comptes. Si la société n'en a pas, l'assemblée doit en désigner un pour " +
          "cette seule opération, avant de voter la suppression.",
      });
    }
  }

  if (codes.includes("reduction_capital")) {
    const avant = nombre(valeurs.capitalActuelRed);
    const apres = nombre(valeurs.nouveauCapitalRed);
    if (avant !== null && apres !== null && apres >= avant) {
      anomalies.push({
        champ: "nouveauCapitalRed",
        message: "Une réduction ramène le capital en dessous de sa valeur actuelle",
      });
    }
  }

  if (codes.includes("prorogation")) {
    const avant = nombre(valeurs.dureeActuelle);
    const apres = nombre(valeurs.nouvelleDuree);
    if (avant !== null && apres !== null && apres <= avant) {
      anomalies.push({
        champ: "nouvelleDuree",
        message: "Une prorogation allonge la durée : la nouvelle doit dépasser l'actuelle",
      });
    }
    // Le code civil plafonne la durée d'une société à quatre-vingt-dix-neuf ans.
    if (apres !== null && apres > 99) {
      anomalies.push({
        champ: "nouvelleDuree",
        message: "La durée d'une société ne peut pas dépasser quatre-vingt-dix-neuf ans",
      });
    }
  }

  return anomalies;
}

/**
 * Tout ce qui empêche de produire les actes.
 *
 * L'assemblée et les cessions ne sont pas toujours connues de l'appelant - la route
 * de paiement les a, un contrôle de forme isolé non. Sans elles, les contrôles du
 * procès-verbal qui en dépendent ne se posent pas ; ceux qui n'en dépendent pas -
 * la chaîne des capitaux, l'accord des montants - se posent toujours.
 */
export function verifierModification(
  codes: string[],
  valeurs: Valeurs,
  societe: Societe,
  assemblee?: ContexteGabarit["assemblee"],
  cessions: ContexteGabarit["cessions"] = [],
  /**
   * Les accords convertis, quand le dossier constate une augmentation.
   *
   * Ils ne sont pas des champs : sans eux, le tableau des souscripteurs sort vide et
   * les actes annoncent un capital que rien ne fonde. L'appelant qui ne les connaît pas
   * ne s'en voit rien reprocher - le paramètre est facultatif.
   */
  air?: ContratAir[],
  /**
   * Ceux qui signent le pouvoir avec le représentant légal.
   *
   * Facultatif comme les accords : un appelant qui ne les connaît pas ne doit pas se
   * voir reprocher leur absence - elle est le cas normal.
   */
  cosignataires?: Cosignataire[]
): Anomalie[] {
  /*
   * Sans changement coché, le dossier n'est pas vide pour autant.
   *
   * Le court-circuit ne rendait que « Choisissez au moins une modification », et taisait
   * ce que la société et son représentant réclament - eux ne dépendent d'aucun code.
   * L'écran, qui porte désormais le même jugement, cessait du coup de signaler quoi que
   * ce soit à sa première étape tant qu'on n'avait rien coché.
   *
   * Le second court-circuit, lui, reste entier : un code inconnu ferait travailler la
   * suite sur une définition qui n'existe pas.
   */
  if (codes.length === 0) {
    return [
      { champ: "modifications", message: "Choisissez au moins une modification" },
      ...verifierSociete(societe),
      ...verifierLeRepresentant(valeurs, societe.forme),
      ...verifierLesCosignataires(cosignataires),
    ];
  }
  if (definitions(codes).length !== codes.length) {
    return [{ champ: "modifications", message: "Une modification demandée n'existe pas" }];
  }

  return [
    ...verifierSociete(societe),
    /*
     * Le représentant légal, qui ne se vérifiait que dans l'écran de saisie.
     *
     * Le pouvoir l'identifie comme le ferait un notaire, et il était possible d'aller
     * jusqu'aux actes sans lui : le contrôle existait, il n'était branché que sur le
     * formulaire. Le règlement et la production des actes passent par ici, et n'en
     * voyaient rien - c'est aussi ce qui faisait diverger les deux jugements.
     */
    ...verifierLeRepresentant(valeurs, societe.forme),
    ...verifierLesCosignataires(cosignataires),
    ...verifierChamps(codes, valeurs, societe.forme),
    ...verifierCoherence(codes, valeurs, societe.forme),
    ...verifierLaConstatation(codes, valeurs, air),
    /*
     * Sans assemblée transmise, on ne reproche pas son absence.
     *
     * « Aucun associé n'est inscrit » est vrai d'un objet vide comme d'une assemblée
     * réellement vide : un appelant qui ne connaît pas l'assemblée verrait le reproche
     * sans pouvoir y répondre.
     */
    ...anomaliesDuPvAge({
      societe,
      assemblee: assemblee ?? {},
      codes,
      valeurs,
      cessions,
    } as ContexteGabarit).filter(
      (a) => assemblee !== undefined || !a.champ.startsWith("assemblee")
    ),
    /*
     * Le traité d'apport a ses propres incohérences, et le même besoin d'être relu
     * avant le règlement : un nominal qui ne divise pas la valeur de l'apport, un
     * commissaire aux apports partie à l'opération, une dispense que la loi n'ouvre pas.
     */
    ...(codes.includes("apport_titres")
      ? anomaliesDuTraite({
          societe,
          assemblee: assemblee ?? {},
          codes,
          valeurs,
          cessions,
        } as ContexteGabarit)
      : []),
    /*
     * L'acte de cession a ses propres exigences : un acquéreur nommé, un nombre total
     * de titres pour calculer le pourcentage cédé - la mention que l'administration
     * fiscale regarde - et une garantie qui, si elle est consentie, porte une durée.
     */
    ...(codes.includes("cession_parts")
      ? [
          /*
           * Les cessions elles-mêmes : qui cède, combien, à quel prix, quel jour.
           *
           * Ces contrôles ne tournaient que dans l'écran de saisie. La route de
           * paiement et la production des actes ne les voyaient pas, et un dossier
           * sans date de cession produisait un procès-verbal annonçant la cession
           * « avec effet au - ». La date est pourtant réclamée à l'écran : c'est le
           * contrôle qui manquait, non la saisie.
           */
          ...verifierCessions(
            assemblee?.associes ?? [],
            cessions ?? [],
            societe.forme,
            typeof valeurs.agrementRequis === "string" ? valeurs.agrementRequis : ""
          ),
          ...anomaliesDeLActeDeCession({
            societe,
            assemblee: assemblee ?? {},
            codes,
            valeurs,
            cessions,
          } as ContexteGabarit),
        ]
      : []),
  ];
}

/** L'avancement du formulaire, pour la barre du parcours. */
export function avancement(codes: string[], valeurs: Valeurs, societe: Societe): number {
  const societeFaite = verifierSociete(societe).length === 0;
  const choixFait = codes.length > 0;
  const champsFaits = choixFait && verifierChamps(codes, valeurs).length === 0;

  const faits = [societeFaite, choixFait, champsFaits].filter(Boolean).length;
  return Math.round((faits / 3) * 100);
}

/**
 * Ce qui empêche de produire les actes d'une constatation.
 *
 * Trois choses, et elles sont toutes de fond. Sans accord, le tableau des souscripteurs
 * est vide et les actes affirment un capital que rien ne fonde. Sans nombre d'actions ni
 * valeur nominale, le capital d'après ne se calcule pas. Et un arrondi qui écarte un
 * souscripteur de ses droits de plus d'un pour cent n'est plus une approximation : il se
 * corrige par une division du nominal, non par une signature.
 */
export function verifierLaConstatation(
  codes: string[],
  valeurs: Valeurs,
  air: ContratAir[] | undefined
): Anomalie[] {
  if (!codes.includes("constatation_augmentation") || air === undefined) return [];

  const utiles = air.filter((a) => a.montant > 0 && a.valorisation > 0);
  if (utiles.length === 0) {
    return [
      {
        champ: "air",
        message: "Déposez au moins un accord, et complétez son montant et sa valorisation",
      },
    ];
  }

  const existantes = (nombre(valeurs.airActionsExistantes) ?? 0) * diviseurDuNominal(valeurs);
  if (existantes <= 0 || (nombre(valeurs.airValeurNominale) ?? 0) <= 0) return [];

  return anomaliesDuTour(existantes, utiles)
    .filter((anomalie) => anomalie.gravite === "bloquant")
    .map((anomalie) => ({ champ: "air", message: anomalie.message }));
}
