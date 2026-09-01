"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Brouillon } from "@/domain/formalite/parcours";

/**
 * La saisie se garde au fil de la frappe, sans attendre « Continuer ».
 *
 * Elle ne se gardait qu'à la validation d'une étape : `enregistrer` vérifiait les
 * règles et sortait avant d'écrire quoi que ce soit. Quelqu'un qu'une règle bloquait -
 * un objet social qu'il croyait rempli, une banque qu'il n'avait pas vue - fermait
 * l'onglet et retrouvait un formulaire vide. Ce n'est pas la validation qui décide de
 * ce qu'on garde ; c'est elle qui décide qu'on avance.
 *
 * Le dossier naît au nom de la société.
 *
 * Rien n'est écrit avant : un dossier ouvert à la première frappe ferait une ligne en
 * base pour chaque visiteur qui passe, et une formalité sans nom en tête de la file de
 * l'avocat. Le nom est le second champ du formulaire, et c'est lui qui nomme le dossier
 * partout où il s'affiche - tant qu'il manque, il n'y a rien à montrer nulle part.
 */

/* Le temps d'écrire une ligne sans qu'un envoi parte à chaque lettre. */
const REPOS = 1_500;

interface Sauvegarde {
  /** Ouvre le dossier s'il n'existe pas, et rend son identifiant. */
  ouvrirLeDossier: () => Promise<number | null>;
  /** Écrit tout de suite, sans attendre le repos. */
  enregistrerMaintenant: () => Promise<void>;
}

export function useSauvegardeContinue(args: {
  brouillon: Brouillon;
  dossier: number | null;
  surOuverture: (identifiant: number) => void;
  /**
   * Le premier enregistrement d'un dossier qui vient de naître.
   *
   * Signalé après l'écriture, non à l'ouverture : c'est là que l'adresse peut porter
   * l'identifiant sans risque. Prévenir plus tôt ferait remonter la page pendant
   * qu'un envoi est en vol, et la dernière frappe se perdrait.
   */
  surPremierEnregistrement?: (identifiant: number) => void;
}): Sauvegarde {
  const { brouillon, dossier, surOuverture, surPremierEnregistrement } = args;

  /* Prévenir une fois : le dossier ne naît qu'une fois. */
  const annonce = useRef(false);

  /*
   * Ce qui est déjà en base, tel qu'on l'a envoyé.
   *
   * Initialisé à l'état d'ouverture : le brouillon reçu du serveur, augmenté des
   * réponses écrites d'avance. Sans cela, le premier rendu déclencherait un envoi qui
   * ne contient rien de nouveau - et ouvrirait un dossier pour une page seulement
   * ouverte.
   */
  const dernierEnvoi = useRef<string | null>(null);

  /* L'état courant, lisible depuis un envoi différé sans le refaire à chaque frappe. */
  const courant = useRef(brouillon);
  const identifiant = useRef(dossier);

  /*
   * Les références se mettent à jour après le rendu, non pendant.
   *
   * React interdit d'écrire dans une référence au fil du rendu : il peut le rejouer, et
   * la valeur écrite ne serait plus celle qu'il affiche. Cet effet s'exécute avant celui
   * du repos, déclaré plus bas : l'envoi différé lit donc toujours l'état courant.
   */
  useEffect(() => {
    courant.current = brouillon;
    identifiant.current = dossier;
    if (dernierEnvoi.current === null) dernierEnvoi.current = JSON.stringify(brouillon);
  }, [brouillon, dossier]);

  /*
   * Une seule ouverture, même si deux gestes la demandent ensemble.
   *
   * L'envoi différé et le « Continuer » peuvent partir à une seconde d'intervalle : la
   * promesse est partagée, sans quoi deux dossiers s'ouvriraient pour une seule saisie.
   */
  const ouverture = useRef<Promise<number | null> | null>(null);

  const ouvrirLeDossier = useCallback(async (): Promise<number | null> => {
    if (identifiant.current !== null) return identifiant.current;
    if (ouverture.current) return ouverture.current;

    ouverture.current = (async () => {
      const reponse = await fetch("/api/formalites/brouillon", { method: "POST" });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok || typeof corps.dossier !== "number") return null;

      identifiant.current = corps.dossier;
      surOuverture(corps.dossier);
      return corps.dossier;
    })();

    const ouvert = await ouverture.current;
    /* Un échec ne se garde pas : le geste suivant doit pouvoir réessayer. */
    if (ouvert === null) ouverture.current = null;
    return ouvert;
  }, [surOuverture]);

  const enregistrerMaintenant = useCallback(async () => {
    const brouillonCourant = courant.current;
    const serialise = JSON.stringify(brouillonCourant);
    if (serialise === dernierEnvoi.current) return;

    /* Tant que la société n'a pas de nom, il n'y a pas de dossier à ouvrir. */
    const nomme = !!brouillonCourant.denomination?.trim();
    if (identifiant.current === null && !nomme) return;

    const cible = await ouvrirLeDossier();
    if (cible === null) return;

    /*
     * `keepalive` porte l'envoi au-delà de la page.
     *
     * Le dernier enregistrement part quand on quitte : sans lui, la seconde et demie
     * de repos serait perdue, c'est-à-dire la dernière ligne écrite - celle qu'on
     * vient d'écrire, et donc celle dont on se souvient.
     */
    await fetch("/api/formalites/brouillon", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossier: cible, modifications: brouillonCourant }),
      keepalive: true,
    });

    dernierEnvoi.current = serialise;

    if (!annonce.current) {
      annonce.current = true;
      surPremierEnregistrement?.(cible);
    }
  }, [ouvrirLeDossier, surPremierEnregistrement]);

  /* Le repos : on écrit une fois la frappe retombée, non à chaque lettre. */
  useEffect(() => {
    if (JSON.stringify(brouillon) === dernierEnvoi.current) return;
    const minuterie = setTimeout(() => {
      void enregistrerMaintenant();
    }, REPOS);
    return () => clearTimeout(minuterie);
  }, [brouillon, enregistrerMaintenant]);

  /*
   * Quitter la page écrit sans attendre.
   *
   * `pagehide` couvre la fermeture et la navigation ; `visibilitychange` couvre le
   * téléphone qu'on repose, où la page n'est pas déchargée mais peut ne jamais revenir.
   */
  useEffect(() => {
    const partir = () => void enregistrerMaintenant();
    const auMasquage = () => {
      if (document.visibilityState === "hidden") partir();
    };

    window.addEventListener("pagehide", partir);
    document.addEventListener("visibilitychange", auMasquage);
    return () => {
      window.removeEventListener("pagehide", partir);
      document.removeEventListener("visibilitychange", auMasquage);
    };
  }, [enregistrerMaintenant]);

  return { ouvrirLeDossier, enregistrerMaintenant };
}
