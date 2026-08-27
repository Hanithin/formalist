"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import { Champ } from "../modification/Parcours";
import { champVisible } from "@/domain/modification/types";
import { CHAMPS_COMPTES } from "@/domain/comptes/types";
import type { Comptes } from "@/infrastructure/db/depots/comptes";
import styles from "../modification/Modification.module.css";

/**
 * Les chiffres de l'exercice, lus dans le bilan ou saisis à la main.
 *
 * Le dépôt du bilan précède la saisie, parce qu'il la remplit. Ce qui vient du
 * document est signalé comme tel, avec la ligne d'où il sort : un montant mal lu se
 * repère alors d'un coup d'œil, là qu'un chiffre posé sans origine passerait pour
 * vérifié.
 *
 * Rien n'est imposé. L'extraction propose, et chaque case reste modifiable - une
 * liasse scannée peut confondre un 8 et un 3, et c'est un dividende qui en dépend.
 */

interface ChiffreExtrait {
  champ: string;
  valeur: number;
  origine: string;
  par: "reperes" | "modele";
}

const GROUPE = "Les chiffres de l'exercice";

export function Chiffres({
  dossier,
  etat,
  majValeurs,
  marquerExtraits,
  refusDe,
}: {
  dossier: number;
  etat: Comptes;
  majValeurs: (maj: (v: Comptes["valeurs"]) => Comptes["valeurs"]) => void;
  marquerExtraits: (champs: string[]) => void;
  refusDe: (champ: string) => string | undefined;
}) {
  const [origines, setOrigines] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const [enCours, demarrer] = useTransition();
  const entree = useRef<HTMLInputElement>(null);

  function deposer(fichier: File) {
    setRefus(null);
    setMessage(null);

    demarrer(async () => {
      const formulaire = new FormData();
      formulaire.append("dossier", String(dossier));
      formulaire.append("fichier", fichier);

      const reponse = await fetch("/api/formalites/comptes/bilan", {
        method: "POST",
        body: formulaire,
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Le document n'a pas pu être lu");
        return;
      }

      const chiffres = (corps.chiffres ?? []) as ChiffreExtrait[];
      if (chiffres.length === 0) {
        setRefus(
          "Le document a bien été déposé, mais aucun chiffre n'y a été reconnu. Saisissez-les à la main."
        );
        return;
      }

      majValeurs((valeurs) => {
        const suite = { ...valeurs };
        for (const chiffre of chiffres) suite[chiffre.champ] = chiffre.valeur;
        return suite;
      });
      setOrigines(Object.fromEntries(chiffres.map((c) => [c.champ, c.origine])));
      marquerExtraits(chiffres.map((c) => c.champ));

      setMessage(
        chiffres.length +
          (chiffres.length > 1 ? " chiffres relevés" : " chiffre relevé") +
          (corps.source === "reconnaissance"
            ? " par reconnaissance de caractères : votre document est un scan, vérifiez-les de près."
            : " dans la couche texte du document. Vérifiez-les avant de continuer.")
      );
    });
  }

  const champs = CHAMPS_COMPTES.filter(
    (champ) => champ.groupe === GROUPE && champVisible(champ, etat.valeurs)
  );

  return (
    <>
      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Votre bilan</h3>
        <p className={styles.blocTexte}>
          Deux façons d&apos;arriver aux chiffres : nous les lisons dans votre bilan, ou
          vous les remplissez vous-même juste en dessous.
        </p>

        {/*
          Les deux chemins, côte à côte.

          L'écran n'en présentait qu'un : un bouton noir sous quatre lignes de texte,
          qui avait l'air d'un passage obligé. Qui n'a pas son bilan sous la main
          refermait la page.
        */}
        <ul className={styles.depotBilanChemins}>
          <li className={styles.depotBilanChemin}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            <span>
              <strong>Vous l&apos;uploadez</strong>
              Nous l&apos;analysons et remplissons les chiffres pour vous. Vous les
              vérifiez, vous corrigez ce qu&apos;il faut.
            </span>
          </li>
          <li className={styles.depotBilanChemin}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>
              <strong>Vous les saisissez</strong>
              Quatre montants à recopier, si vous préférez ou si vous n&apos;avez pas le
              document sous la main.
            </span>
          </li>
        </ul>

        <input
          ref={entree}
          type="file"
          accept=".pdf"
          hidden
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            if (fichier) deposer(fichier);
            e.target.value = "";
          }}
        />

        {/*
          Le glisser-déposer est le geste que tout le monde essaie d'abord.
          Rien ne l'offrait, et rien ne disait qu'il était possible.
        */}
        <button
          type="button"
          className={[
            styles.depotBilan,
            survol ? styles.depotBilanSurvol : "",
            etat.bilan ? styles.depotBilanFait : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => entree.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setSurvol(true);
          }}
          onDragLeave={() => setSurvol(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurvol(false);
            const fichier = e.dataTransfer.files?.[0];
            if (fichier) deposer(fichier);
          }}
          disabled={enCours}
        >
          {enCours ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={styles.depotBilanIcone} aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-6.2-8.6" />
              </svg>
              <span className={styles.depotBilanTitre}>Analyse de votre bilan</span>
              <span className={styles.depotBilanAide}>
                Nous y cherchons le résultat, le report à nouveau et la réserve légale.
              </span>
            </>
          ) : etat.bilan ? (
            <>
              <span className={styles.depotBilanNom}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" width="17" height="17">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {etat.bilan.fichier}
              </span>
              <span className={styles.depotBilanRemplacer}>Uploader un autre bilan</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className={styles.depotBilanIcone} aria-hidden="true">
                <path d="M12 16V4" />
                <path d="m7 9 5-5 5 5" />
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
              <span className={styles.depotBilanTitre}>Uploader mon bilan</span>
              <span className={styles.depotBilanAide}>
                Glissez votre PDF ici, ou cliquez pour le choisir. Il reste au dossier :
                c&apos;est lui que l&apos;avocat relira.
              </span>
            </>
          )}
        </button>

        {message && <p className={styles.blocNote}>{message}</p>}
        {refus && (
          <p className={styles.paiementManque} role="alert">
            {refus}
          </p>
        )}
      </section>

      <div className={styles.champs}>
        {champs.map((champ, rang) => (
          <Fragment key={champ.identifiant}>
            {rang === 0 && <h4 className={styles.champsGroupe}>{GROUPE}</h4>}
            <Champ
              champ={champ}
              valeur={etat.valeurs[champ.identifiant]}
              refus={refusDe(champ.identifiant)}
              surChangement={(identifiant, valeur) =>
                majValeurs((v) => ({ ...v, [identifiant]: valeur }))
              }
              surSociete={() => {}}
              surAdresse={(adresse) =>
                majValeurs((v) => ({ ...v, [champ.identifiant]: adresse }))
              }
            />
            {origines[champ.identifiant] && (
              <p className={styles.origineDuChiffre}>
                Lu dans votre document : « {origines[champ.identifiant]} »
              </p>
            )}
          </Fragment>
        ))}
      </div>
    </>
  );
}
