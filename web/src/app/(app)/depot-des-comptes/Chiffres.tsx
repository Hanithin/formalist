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
          Déposez la liasse ou le bilan de l&apos;exercice : nous y relevons le résultat,
          le report à nouveau, la réserve légale et les chiffres qui décident de la
          confidentialité. Le document reste au dossier, c&apos;est lui que l&apos;avocat
          relira.
        </p>

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

        <div className={styles.blocActions}>
          <button
            type="button"
            className={etat.bilan ? undefined : styles.blocPrincipal}
            onClick={() => entree.current?.click()}
            disabled={enCours}
          >
            {enCours
              ? "Lecture du document…"
              : etat.bilan
                ? "Déposer un autre bilan"
                : "Déposer mon bilan"}
          </button>
        </div>

        {etat.bilan && (
          <p className={styles.blocNote}>Document au dossier : {etat.bilan.fichier}</p>
        )}
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
