"use client";

import { useEffect, useRef } from "react";

/**
 * Garder la saisie sans attendre « Continuer ».
 *
 * Le parcours de modification n'écrivait qu'au changement d'étape. Tout ce qui était
 * tapé depuis le dernier « Continuer » disparaissait à la moindre actualisation, à la
 * fermeture d'un onglet, à une connexion qui lâche - et il fallait tout retaper. Ce
 * n'est pas la validation qui décide de ce qu'on garde ; c'est elle qui décide qu'on
 * avance.
 *
 * Le mécanisme est celui que la création emploie depuis longtemps (voir
 * `creation/sauvegarde.ts`) : on écrit une fois la frappe retombée, et l'on écrit encore
 * quand la page s'en va. Il est ici parce qu'il ne dépend d'aucun parcours - seulement
 * d'un état sérialisable et d'une façon de l'écrire.
 *
 * Ce qu'on surveille doit être exactement ce qu'on envoie. Un état plus large ferait
 * partir une écriture chaque fois qu'une autre route touche au dossier - un accord
 * déposé, des statuts repris au registre - pour renvoyer ce qui n'a pas bougé.
 */

/* Le temps d'écrire une ligne sans qu'un envoi parte à chaque lettre. */
const REPOS = 1_500;

export function useEnregistrementAuRepos(
  /** Ce qui part au serveur, et lui seul : sérialisé pour savoir s'il a changé. */
  etat: unknown,
  /**
   * Écrit l'état courant. Rend faux si le serveur a refusé.
   *
   * `enPartant` est vrai quand la page se ferme : l'envoi doit alors survivre au
   * document, ce que `keepalive` permet, au prix d'une limite de taille que le cas
   * courant n'a pas à subir.
   */
  enregistrer: (enPartant: boolean) => Promise<boolean>,
  /** Rien ne s'écrit tant que c'est faux : un dossier qui n'existe pas encore, un écran en lecture. */
  actif = true
) {
  const serialise = JSON.stringify(etat ?? null);

  /*
   * Ce qui est déjà en base, tel qu'on l'a envoyé.
   *
   * Posé au premier rendu avec l'état d'ouverture : sans cela, l'arrivée sur la page
   * déclencherait un envoi qui ne porte rien de nouveau.
   */
  const dernierEnvoi = useRef<string | null>(null);
  if (dernierEnvoi.current === null) dernierEnvoi.current = serialise;

  /*
   * L'écriture et l'état courant, lisibles depuis un envoi différé.
   *
   * Les références se mettent à jour après le rendu, non pendant : React peut rejouer
   * un rendu, et la valeur écrite ne serait plus celle qu'il affiche.
   */
  const ecrire = useRef(enregistrer);
  const courant = useRef(serialise);
  useEffect(() => {
    ecrire.current = enregistrer;
    courant.current = serialise;
  });

  /*
   * Une seule écriture à la fois.
   *
   * Le repos et le départ de la page peuvent partir à un cheveu d'intervalle : deux
   * envois concurrents écriraient le même dossier dans un ordre que personne ne
   * contrôle.
   */
  const enVol = useRef(false);

  const maintenant = useRef(async (enPartant: boolean) => {
    if (enVol.current) return;
    if (courant.current === dernierEnvoi.current) return;

    const envoye = courant.current;
    enVol.current = true;
    try {
      /*
       * Un refus ne se note pas comme un envoi réussi : l'y écrire ferait taire le
       * repos, qui ne réessaierait plus, et la saisie refusée paraîtrait enregistrée.
       */
      if (await ecrire.current(enPartant)) dernierEnvoi.current = envoye;
    } catch {
      // Connexion perdue : on garde l'état pour non écrit, et le repos suivant réessaie.
    } finally {
      enVol.current = false;
    }
  });

  /* Le repos : on écrit une fois la frappe retombée, non à chaque lettre. */
  useEffect(() => {
    if (!actif) return;
    if (serialise === dernierEnvoi.current) return;

    const minuterie = setTimeout(() => {
      void maintenant.current(false);
    }, REPOS);
    return () => clearTimeout(minuterie);
  }, [serialise, actif]);

  /*
   * Quitter la page écrit sans attendre.
   *
   * `pagehide` couvre la fermeture et la navigation ; `visibilitychange` couvre le
   * téléphone qu'on repose, où la page n'est pas déchargée mais peut ne jamais revenir.
   */
  useEffect(() => {
    if (!actif) return;

    const partir = () => void maintenant.current(true);
    const auMasquage = () => {
      if (document.visibilityState === "hidden") partir();
    };

    window.addEventListener("pagehide", partir);
    document.addEventListener("visibilitychange", auMasquage);
    return () => {
      window.removeEventListener("pagehide", partir);
      document.removeEventListener("visibilitychange", auMasquage);
    };
  }, [actif]);
}
