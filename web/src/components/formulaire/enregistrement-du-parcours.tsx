"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Le fil par lequel une fenêtre fait enregistrer le parcours qu'elle affiche.
 *
 * Les parcours n'écrivent qu'au changement d'étape, ou après un repos : enregistrer à
 * chaque frappe ferait une requête par lettre. Sur sa page, cela suffit - on avance, on
 * écrit, et le bouton qui termine est lui-même un changement d'étape.
 *
 * Dans la fenêtre de correction de l'avocat, non : le bouton qui termine est « Reproduire
 * les actes », qui n'est pas un changement d'étape. L'avocat corrigeait le montant d'un
 * apport, cliquait, et le serveur reproduisait les actes à partir du dossier tel qu'il
 * était avant sa correction - sans erreur, sans trace, avec un procès-verbal identique.
 *
 * La fenêtre ne peut pas appeler le parcours : elle le reçoit déjà construit, en
 * `ReactNode`. C'est donc le parcours qui s'inscrit, par le contexte du point où il est
 * rendu, et la fenêtre appelle ce qu'elle a reçu avant de reproduire.
 */

/** Écrit l'état courant du parcours. Rend faux si le serveur a refusé. */
export type EnregistrerLeParcours = () => Promise<boolean>;

interface Registre {
  inscrire: (enregistrer: EnregistrerLeParcours | null) => void;
}

const Contexte = createContext<Registre | null>(null);

/**
 * La fenêtre qui veut pouvoir enregistrer avant de reproduire.
 *
 * `surInscription` reçoit la fonction du parcours, ou null quand il se démonte.
 */
export function ParcoursQuiSEnregistre({
  surInscription,
  children,
}: {
  surInscription: (enregistrer: EnregistrerLeParcours | null) => void;
  children: ReactNode;
}) {
  const dernier = useRef(surInscription);
  useEffect(() => {
    dernier.current = surInscription;
  });

  /*
   * Le registre garde la même identité d'un rendu à l'autre.
   *
   * Recréé à chaque rendu, il changerait la valeur du contexte, et l'effet qui inscrit
   * le parcours se rejouerait sans fin - inscription, désinscription, rendu.
   */
  const [registre] = useState<Registre>(() => ({
    inscrire: (enregistrer) => dernier.current(enregistrer),
  }));

  return <Contexte.Provider value={registre}>{children}</Contexte.Provider>;
}

/**
 * Le parcours s'inscrit, quand il vit dans une telle fenêtre.
 *
 * Hors fenêtre, il n'y a pas de contexte et le crochet ne fait rien : le parcours sur sa
 * page n'a personne à qui s'annoncer.
 */
export function useInscrireLEnregistrement(enregistrer: EnregistrerLeParcours) {
  const registre = useContext(Contexte);

  /*
   * La fonction inscrite lit toujours l'état du dernier rendu.
   *
   * Inscrire la fonction elle-même figerait l'état qu'elle a capturé à l'inscription :
   * on enregistrerait le dossier tel qu'il était à l'ouverture de la fenêtre, ce qui est
   * exactement le défaut qu'on répare.
   */
  const dernier = useRef(enregistrer);
  useEffect(() => {
    dernier.current = enregistrer;
  });

  useEffect(() => {
    if (!registre) return;
    registre.inscrire(() => dernier.current());
    return () => registre.inscrire(null);
  }, [registre]);
}
