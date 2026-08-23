import { champsASaisir, definitions, type Valeurs } from "./types";
import { verifierApport } from "./apport";

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
export function verifierChamps(codes: string[], valeurs: Valeurs): Anomalie[] {
  const anomalies: Anomalie[] = [];

  for (const champ of champsASaisir(codes, valeurs)) {
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

/** Tout ce qui empêche de produire les actes. */
export function verifierModification(
  codes: string[],
  valeurs: Valeurs,
  societe: Societe
): Anomalie[] {
  if (codes.length === 0) {
    return [{ champ: "modifications", message: "Choisissez au moins une modification" }];
  }
  if (definitions(codes).length !== codes.length) {
    return [{ champ: "modifications", message: "Une modification demandée n'existe pas" }];
  }

  return [
    ...verifierSociete(societe),
    ...verifierChamps(codes, valeurs),
    ...verifierCoherence(codes, valeurs),
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
