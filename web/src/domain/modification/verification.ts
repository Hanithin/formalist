import { champsASaisir, definitions, type Valeurs } from "./types";
import { verifierApport } from "./apport";
import { anomaliesDuPvAge } from "./pv-age";
import { anomaliesDuTraite } from "./traite-apport";
import type { ContexteGabarit } from "./gabarit";

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
    if (!champ.obligatoire) continue;
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
export function verifierCoherence(codes: string[], valeurs: Valeurs): Anomalie[] {
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
  cessions: ContexteGabarit["cessions"] = []
): Anomalie[] {
  if (codes.length === 0) {
    return [{ champ: "modifications", message: "Choisissez au moins une modification" }];
  }
  if (definitions(codes).length !== codes.length) {
    return [{ champ: "modifications", message: "Une modification demandée n'existe pas" }];
  }

  return [
    ...verifierSociete(societe),
    ...verifierChamps(codes, valeurs, societe.forme),
    ...verifierCoherence(codes, valeurs),
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
    } as ContexteGabarit).filter((a) => assemblee !== undefined || !a.champ.startsWith("assemblee")),
    /*
     * Le traité d'apport a ses propres incohérences, et le même besoin d'être relu
     * avant le règlement : un nominal qui ne divise pas la valeur de l'apport, un
     * commissaire aux apports partie à l'opération, une dispense que la loi n'ouvre pas.
     */
    ...(codes.includes("apport_titres")
      ? anomaliesDuTraite({ societe, assemblee: assemblee ?? {}, codes, valeurs, cessions } as ContexteGabarit)
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
 * Tout le capital est-il représenté à l'assemblée ?
 *
 * Le total des parts de la société est déclaré, les parts de chaque associé s'y
 * ajoutent. Un écart ne se voit pas dans un procès-verbal : il se découvre au greffe,
 * une fois l'acte signé et l'annonce publiée. Tant que le total n'est pas donné, on
 * ne vérifie rien - on ne peut pas comparer à ce qui n'est pas dit.
 */
export function verifierLesParts(assemblee: {
  totalParts?: number | null;
  associes?: { parts?: number | null }[];
}): Anomalie[] {
  const total = assemblee.totalParts;
  if (typeof total !== "number" || total <= 0) return [];

  const reparties = (assemblee.associes ?? []).reduce((somme, a) => somme + (a.parts ?? 0), 0);
  if (reparties === total) return [];

  return [
    {
      champ: "assemblee-total-parts",
      message:
        reparties < total
          ? "Il manque " +
            (total - reparties) +
            " part" +
            (total - reparties > 1 ? "s" : "") +
            " : ajoutez les associés qui les détiennent, ou corrigez le total."
          : "Les associés se partagent " +
            reparties +
            " parts pour un capital qui n'en compte que " +
            total +
            ".",
    },
  ];
}
