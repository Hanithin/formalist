import { type EtatJeton } from "./inscription";

/**
 * Réinitialisation d'un mot de passe oublié.
 *
 * Le jeton de confirmation d'inscription et celui de réinitialisation ne valent pas
 * la même chose. Le premier prouve qu'une adresse existe ; le second ouvre le compte.
 * Quiconque met la main sur un lien de réinitialisation - une boîte mail laissée
 * ouverte, un message transféré par erreur - prend le compte. D'où une durée bien
 * plus courte : une heure au lieu de vingt-quatre.
 */
export const DUREE_JETON_MS = 60 * 60 * 1000;

/** Le type inscrit en base, à côté de « verify » pour la confirmation d'adresse. */
export const TYPE_JETON = "reset";

/**
 * La réponse à une demande de lien, toujours la même.
 *
 * Répondre « aucun compte à cette adresse » transformerait la page en annuaire :
 * n'importe qui pourrait vérifier si telle personne est cliente. La demande aboutit
 * donc de la même façon, qu'un email parte ou non.
 */
export const REPONSE_DEMANDE =
  "Si un compte existe à cette adresse, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte mail, et les indésirables.";

export function messageReinitialisation(etat: EtatJeton): string {
  if (etat === "utilise") {
    return "Ce lien a déjà servi. Un lien de réinitialisation ne fonctionne qu'une fois : demandez-en un nouveau.";
  }
  if (etat === "expire") {
    return "Ce lien a expiré. Les liens de réinitialisation ne sont valables qu'une heure : demandez-en un nouveau.";
  }
  if (etat === "inconnu") {
    return "Ce lien n'est pas valable. Vérifiez que vous l'avez copié en entier, ou demandez-en un nouveau.";
  }
  return "Choisissez votre nouveau mot de passe.";
}

/**
 * Ce qu'on dit après coup, une fois le mot de passe changé.
 *
 * La fermeture des autres sessions est annoncée : on réinitialise souvent parce
 * qu'un accès est compromis, et savoir que les autres appareils ont été déconnectés
 * fait partie de la réponse à cette inquiétude. Sans le dire, la personne se
 * demanderait pourquoi son téléphone lui redemande le mot de passe.
 */
export const CONFIRMATION_CHANGEMENT =
  "Mot de passe modifié. Les autres appareils connectés à ce compte ont été déconnectés.";
