import { LONGUEUR_MINIMALE } from "@/lib/mots-de-passe";

/**
 * Règles d'inscription.
 *
 * Un compte n'est utilisable qu'une fois l'adresse confirmée : c'est elle qui
 * sert d'identifiant, et rien ne garantit qu'elle appartienne à la personne qui
 * la saisit tant qu'elle n'a pas ouvert le lien.
 */

export const DUREE_JETON_MS = 24 * 60 * 60 * 1000;

export interface Anomalie {
  champ: string;
  message: string;
}

export interface Inscription {
  prenom: string;
  nom: string;
  email: string;
  motDePasse: string;
}

/**
 * Force du mot de passe.
 *
 * On ne réclame ni majuscule ni caractère spécial : ces règles poussent aux
 * variations prévisibles - « Motdepasse1! » - sans rien gagner. La longueur fait
 * davantage, et on refuse les mots de passe les plus courants.
 */
const TROP_COURANTS = new Set([
  "motdepasse",
  "password",
  "12345678",
  "123456789",
  "azertyuiop",
  "qwertyuiop",
  "formalist",
  "bonjour123",
  "iloveyou",
]);

export function verifierMotDePasse(motDePasse: string, contexte: string[] = []): Anomalie[] {
  if (motDePasse.length < LONGUEUR_MINIMALE) {
    return [
      {
        champ: "motDePasse",
        message: "Le mot de passe doit faire au moins " + LONGUEUR_MINIMALE + " caractères",
      },
    ];
  }

  const normalise = motDePasse.toLowerCase();

  if (TROP_COURANTS.has(normalise)) {
    return [{ champ: "motDePasse", message: "Ce mot de passe est trop courant" }];
  }

  // Un mot de passe qui reprend son propre nom ou son adresse se devine.
  for (const element of contexte) {
    const propre = element.toLowerCase().trim();
    if (propre.length >= 4 && normalise.includes(propre)) {
      return [
        {
          champ: "motDePasse",
          message: "Le mot de passe ne doit pas contenir votre nom ni votre adresse email",
        },
      ];
    }
  }

  return [];
}

export function verifierInscription(demande: Partial<Inscription>): Anomalie[] {
  const anomalies: Anomalie[] = [];

  if (!demande.prenom?.trim()) {
    anomalies.push({ champ: "prenom", message: "Indiquez votre prénom" });
  }
  if (!demande.nom?.trim()) {
    anomalies.push({ champ: "nom", message: "Indiquez votre nom" });
  }
  if (!demande.email?.trim()) {
    anomalies.push({ champ: "email", message: "Indiquez votre adresse email" });
  }

  const contexte = [demande.prenom ?? "", demande.nom ?? "", (demande.email ?? "").split("@")[0]];
  anomalies.push(...verifierMotDePasse(demande.motDePasse ?? "", contexte.filter(Boolean)));

  return anomalies;
}

export type EtatJeton = "valide" | "inconnu" | "utilise" | "expire";

export function etatJeton(
  jeton: { utiliseLe: Date | null; expireLe: Date } | null,
  maintenant: Date = new Date()
): EtatJeton {
  if (!jeton) return "inconnu";
  if (jeton.utiliseLe) return "utilise";
  if (jeton.expireLe.getTime() <= maintenant.getTime()) return "expire";
  return "valide";
}

export function messageJeton(etat: EtatJeton): string {
  if (etat === "valide") return "Votre adresse est confirmée. Vous pouvez vous connecter.";
  if (etat === "utilise") return "Cette adresse est déjà confirmée. Vous pouvez vous connecter.";
  if (etat === "expire") return "Ce lien a expiré. Demandez-en un nouveau depuis la connexion.";
  return "Ce lien n'est pas valable.";
}
