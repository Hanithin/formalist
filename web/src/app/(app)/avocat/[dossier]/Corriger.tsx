"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Champ } from "@/app/(app)/modification/Parcours";
import type { ChampModification } from "@/domain/modification/types";
import {
  ParcoursQuiSEnregistre,
  type EnregistrerLeParcours,
} from "@/components/formulaire/enregistrement-du-parcours";
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
  /*
   * Les actes que la reproduction n'a pas refaits.
   *
   * Un acte signé, vérifié ou déposé au greffe est figé : le remplacer détruirait une
   * signature ou changerait une pièce que le greffe a reçue. La fenêtre le taisait, et
   * l'avocat repartait en croyant avoir corrigé un procès-verbal qui n'avait pas bougé.
   */
  const [conserves, setConserves] = useState<string[]>([]);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  /* Ce que le parcours affiché sait écrire de lui-même - voir enregistrement-du-parcours. */
  const enregistrerLeParcours = useRef<EnregistrerLeParcours | null>(null);

  function poser(identifiant: string, valeur: string | number) {
    setSaisie((avant) => ({ ...avant, [identifiant]: valeur }));
  }

  /*
   * Le parcours écrit, puis les actes se refont.
   *
   * Envoyer les valeurs des champs à plat écraserait ce que le formulaire vient
   * d'enregistrer, avec l'état qu'ils avaient à l'ouverture de la fenêtre : le corps
   * part donc vide, et c'est le parcours qui a la main sur ce qu'il enregistre.
   *
   * Encore faut-il qu'il l'ait fait. Le parcours de modification n'écrit qu'au
   * changement d'étape, et ce bouton n'en est pas un : l'avocat corrigeait le montant
   * d'un apport, cliquait ici, et le serveur reproduisait les actes à partir du dossier
   * tel qu'il était avant sa correction. Aucune erreur, aucune trace, et un
   * procès-verbal identique à celui qu'il venait de corriger.
   */
  function reproduireSeulement() {
    setRefus(null);
    setManques([]);
    setConserves([]);

    demarrer(async () => {
      const ecrire = enregistrerLeParcours.current;
      if (ecrire && !(await ecrire())) {
        setRefus("Vos corrections n'ont pas pu être enregistrées");
        return;
      }

      const reponse = await fetch("/api/avocat/correction", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, valeurs: {} }),
      });

      const retour = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(retour.error ?? "La correction n'a pas abouti");
        setManques(Array.isArray(retour.manques) ? retour.manques : []);
        return;
      }

      router.refresh();

      /*
       * La fenêtre reste ouverte quand un acte n'a pas suivi.
       *
       * Se fermer sur une réussite partielle revient à taire la moitié de la réponse :
       * l'avocat lirait « reproduit » sur un procès-verbal figé. Il ferme lui-même une
       * fois qu'il a vu lequel, et ce qu'il lui reste à faire - reprendre l'acte, ou
       * refaire le dépôt.
       */
      const figes: string[] = Array.isArray(retour.conserves) ? retour.conserves : [];
      if (figes.length > 0) {
        setConserves(figes);
        return;
      }

      setOuverte(false);
    });
  }

  function enregistrer() {
    setRefus(null);
    setManques([]);
    setConserves([]);

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

      const retour = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(retour.error ?? "La correction n'a pas abouti");
        setManques(Array.isArray(retour.manques) ? retour.manques : []);
        return;
      }

      router.refresh();

      /*
       * La fenêtre reste ouverte quand un acte n'a pas suivi.
       *
       * Se fermer sur une réussite partielle revient à taire la moitié de la réponse :
       * l'avocat lirait « reproduit » sur un procès-verbal figé. Il ferme lui-même une
       * fois qu'il a vu lequel, et ce qu'il lui reste à faire - reprendre l'acte, ou
       * refaire le dépôt.
       */
      const figes: string[] = Array.isArray(retour.conserves) ? retour.conserves : [];
      if (figes.length > 0) {
        setConserves(figes);
        return;
      }

      setOuverte(false);
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
        onClick={() => {
          /* Ce qu'on a lu la fois d'avant ne vaut plus : la fenêtre s'ouvre nette. */
          setRefus(null);
          setManques([]);
          setConserves([]);
          setOuverte(true);
        }}
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

            {/*
              Ce qui n'a pas été refait se dit aussi.

              Un acte signé, vérifié ou déposé au greffe est figé : le reproduire
              détruirait une signature, ou changerait une pièce que le greffe a déjà
              reçue. La fenêtre se contentait de se fermer, et l'avocat repartait en
              croyant avoir corrigé un procès-verbal qui n'avait pas bougé d'un mot.
            */}
            {conserves.length > 0 && (
              <div className={styles.correctionConserves} role="status">
                <p className={styles.correctionRefusTitre}>
                  {conserves.length === 1
                    ? "Un acte n'a pas été reproduit"
                    : conserves.length + " actes n'ont pas été reproduits"}
                </p>
                <p className={styles.correctionRefusNote}>
                  Ils sont figés - signés, vérifiés ou déjà déposés - et n&apos;ont pas été
                  remplacés. Reprenez-les depuis leur ligne pour les refaire.
                </p>
                <ul className={styles.correctionManques}>
                  {conserves.map((titre) => (
                    <li key={titre}>{titre}</li>
                  ))}
                </ul>
              </div>
            )}

            {parcours ? (
              /*
                Le parcours écrit lui-même, et le bouton le lui fait faire avant de
                reproduire : les champs à plat n'ont donc rien à soumettre ici.
              */
              <div className={styles.correctionParcours}>
                <ParcoursQuiSEnregistre
                  surInscription={(ecrire) => {
                    enregistrerLeParcours.current = ecrire;
                  }}
                >
                  {parcours}
                </ParcoursQuiSEnregistre>
              </div>
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
                    /*
                      L'adresse s'écrit dans le champ du dossier, non dans un champ deviné.
                      
                      Le nouveau siège passe sa frappe par ici et non par `surChangement` :
                      c'est le seul champ rendu en deux morceaux, la voie d'un côté, le code
                      postal et la ville de l'autre. Cette fenêtre écrivait dans « adresse »,
                      « codePostal » et « ville », qui n'existent pas dans une modification -
                      elle en a trois autres, « nouvelleAdresse », « nouveauCodePostal » et
                      « nouvelleVille ». Le champ étant piloté par ce qu'on lui rend, la
                      frappe se perdait sans trace : la valeur restait figée, et l'on croyait
                      le formulaire inerte.
                    */
                    surAdresse={(adresse, complements) => {
                      /* Une complétion ne porte que le code postal et la ville : la voie
                         vient du rappel précédent, dans le même cycle. */
                      if (adresse) poser(champ.identifiant, adresse);
                      if (champ.identifiant === "nouvelleAdresse" && complements) {
                        if (complements.codePostal) {
                          poser("nouveauCodePostal", complements.codePostal);
                        }
                        if (complements.ville) poser("nouvelleVille", complements.ville);
                      }
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
                {enCours ? "Reproduction…" : "Enregistrer et reproduire les actes"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
