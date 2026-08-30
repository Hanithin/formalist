import type { FormEvent } from "react";

/**
 * Soumettre sans que le formulaire s'efface.
 *
 * React réinitialise un formulaire dont l'`action` est une fonction, dès que celle-ci
 * a rendu la main. C'est ce qu'il faut pour un champ qu'on vide après l'envoi - une
 * note, un message - et c'est un piège partout ailleurs : refusé pour un mot de passe
 * trop court, on retapait son prénom, son nom et son adresse. Le formulaire punissait
 * la faute qu'il venait de signaler.
 *
 * `onSubmit` ne réinitialise rien. La fonction reçoit les mêmes `FormData`, et ce qui
 * est saisi reste à l'écran le temps qu'on corrige.
 */
export function soumettreSansEffacer(traiter: (donnees: FormData) => void) {
  return (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    traiter(new FormData(evenement.currentTarget));
  };
}
