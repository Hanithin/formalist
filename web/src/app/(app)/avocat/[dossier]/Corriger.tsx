"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Champ } from "@/app/(app)/modification/Parcours";
import type { ChampModification } from "@/domain/modification/types";
import styles from "../Avocat.module.css";

type Valeurs = Record<string, string | number | undefined>;

/**
 * Corriger le dossier, puis reproduire ses actes.
 *
 * L'avocat qui voyait une coquille n'avait qu'un chemin : télécharger le Word, le
 * corriger à la main, redéposer sa version. La faute restait dans le dossier, l'acte
 * suivant la reprenait, et le document remis ne correspondait plus aux données dont il
 * était censé sortir. Ici, on corrige la source.
 *
 * Les champs sont ceux du parcours, rendus par le même composant : ce que le client a
 * rempli, l'avocat le relit sous la même forme, avec les mêmes aides.
 */
export function Corriger({
  dossier,
  champs,
  valeurs,
  parcours,
}: {
  dossier: number;
  champs: ChampModification[];
  valeurs: Valeurs;
  /**
   * Le formulaire du client, tel qu'il l'a rempli.
   *
   * Les champs à plat vont vite pour une coquille et perdent tout ce qui les entoure :
   * l'ordre des étapes, les aides, les listes de personnes. Quand le parcours du type
   * sait s'afficher dans une fenêtre - la création aujourd'hui - c'est lui qu'on rend,
   * avec son « Continuer » d'une étape à l'autre.
   */
  parcours?: React.ReactNode;
}) {
  const [ouverte, setOuverte] = useState(false);
  const [saisie, setSaisie] = useState<Valeurs>(valeurs);
  const [refus, setRefus] = useState<string | null>(null);
  const [manques, setManques] = useState<{ champ: string; message: string }[]>([]);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function poser(identifiant: string, valeur: string | number) {
    setSaisie((avant) => ({ ...avant, [identifiant]: valeur }));
  }

  /*
   * Le parcours a déjà tout écrit : il ne reste qu'à refaire les actes.
   *
   * Envoyer les valeurs des champs à plat écraserait ce que le formulaire vient
   * d'enregistrer, avec l'état qu'ils avaient à l'ouverture de la fenêtre.
   */
  function reproduireSeulement() {
    setRefus(null);
    setManques([]);

    demarrer(async () => {
      const reponse = await fetch("/api/avocat/correction", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, valeurs: {} }),
      });

      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "La correction n'a pas abouti");
        setManques(Array.isArray(retour.manques) ? retour.manques : []);
        return;
      }

      setOuverte(false);
      router.refresh();
    });
  }

  function enregistrer() {
    setRefus(null);
    setManques([]);

    demarrer(async () => {
      /* Seules les valeurs des champs affichés partent : le reste du dossier ne bouge pas. */
      const corrections: Record<string, string | number> = {};
      for (const champ of champs) {
        const valeur = saisie[champ.identifiant];
        if (valeur !== undefined) corrections[champ.identifiant] = valeur;
      }

      const reponse = await fetch("/api/avocat/correction", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, valeurs: corrections }),
      });

      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "La correction n'a pas abouti");
        setManques(Array.isArray(retour.manques) ? retour.manques : []);
        return;
      }

      setOuverte(false);
      router.refresh();
    });
  }

  if (champs.length === 0) return null;

  return (
    <>
      {/*
        « Ouvrir », non « Corriger ».
        
        Deux boutons se partageaient le même formulaire : l'un emmenait sur le parcours
        du client, l'autre l'ouvrait en fenêtre pour le reprendre. Il n'en reste qu'un,
        et il fait les deux - on lit le formulaire, on le corrige si besoin.
      */}
      <button
        type="button"
        className={styles.decisionSecondaire}
        onClick={() => setOuverte(true)}
      >
        Ouvrir le formulaire
      </button>

      {ouverte && (
        <>
          <div
            className={styles.voile}
            onClick={() => setOuverte(false)}
            aria-hidden="true"
          />

          <div
            className={
              parcours ? `${styles.correction} ${styles.correctionLarge}` : styles.correction
            }
            role="dialog"
            aria-modal="true"
            aria-label="Corriger le dossier"
          >
            <div className={styles.correctionTete}>
              <div>
                <h3 className={styles.correctionTitre}>Corriger le dossier</h3>
                <p className={styles.correctionDetail}>
                  Les actes seront reproduits à partir de ces valeurs, et repasseront en
                  relecture. Les versions actuelles restent atteignables.
                </p>
              </div>

              <button
                type="button"
                className={styles.panneauFermer}
                onClick={() => setOuverte(false)}
                aria-label="Fermer"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/*
              Ce qui manque se lit, et ce qui est écrit se dit.
              
              Le message ne disait que « Le dossier est incomplet » : l'avocat ne savait
              ni quoi corriger, ni que ses valeurs étaient déjà enregistrées. La
              vérification porte sur tout le dossier - la société, les associés,
              l'affectation - et ce qui manque n'est pas toujours un champ de cette
              fenêtre.
            */}
            {refus && (
              <div className={styles.correctionRefus} role="alert">
                <p className={styles.correctionRefusTitre}>{refus}</p>
                <p className={styles.correctionRefusNote}>
                  Vos corrections sont enregistrées ; les actes n&apos;ont pas pu être
                  reproduits.
                </p>
                {manques.length > 0 && (
                  <ul className={styles.correctionManques}>
                    {manques.map((manque) => (
                      <li key={manque.champ}>{manque.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {parcours ? (
              /*
                Le parcours enregistre au fil de la frappe : il n'y a rien à
                soumettre, seulement à reproduire les actes quand on a fini.
              */
              <div className={styles.correctionParcours}>{parcours}</div>
            ) : (
            <div className={styles.correctionChamps}>
              {champs.map((champ, rang) => (
                <Fragment key={champ.identifiant}>
                  {champ.groupe && champ.groupe !== champs[rang - 1]?.groupe && (
                    <h4 className={styles.correctionGroupe}>{champ.groupe}</h4>
                  )}
                  <Champ
                    champ={champ}
                    valeur={saisie[champ.identifiant]}
                    refus={manques.find((m) => m.champ === champ.identifiant)?.message}
                    surChangement={poser}
                    surAdresse={(adresse, complements) => {
                      poser("adresse", adresse);
                      if (complements?.codePostal) poser("codePostal", complements.codePostal);
                      if (complements?.ville) poser("ville", complements.ville);
                    }}
                    /*
                     * La recherche au registre ne sert pas ici : l'avocat corrige une
                     * valeur, il ne change pas la société du dossier.
                     */
                    surSociete={() => {}}
                  />
                </Fragment>
              ))}
            </div>
            )}

            <div className={styles.correctionActions}>
              <button
                type="button"
                className={styles.decisionSecondaire}
                onClick={() => setOuverte(false)}
                disabled={enCours}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.decisionValider}
                onClick={parcours ? reproduireSeulement : enregistrer}
                disabled={enCours}
              >
                {enCours
                  ? "Reproduction…"
                  : parcours
                    ? "Reproduire les actes"
                    : "Enregistrer et reproduire les actes"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
