"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { montantLisible } from "@/domain/modification/offre";
import { devisDeCessation, PRESTATIONS } from "@/domain/cessation/offre";
import {
  CESSATION_EST_DEFINITIVE,
  FORMALITE_GRATUITE,
  RADIATION_D_OFFICE,
  suspensionExpliquee,
  type Nature,
} from "@/domain/cessation/regles";
import styles from "../modification/Modification.module.css";

/**
 * L'entrée : fermer, ou mettre en pause.
 *
 * C'est la seule question qui compte, et presque personne ne sait qu'elle se pose. Une
 * cessation définitive ferme le SIRET pour de bon : reprendre suppose une nouvelle
 * immatriculation, un nouveau numéro, et la franchise en base qui repart de zéro. La
 * suspension existe précisément pour éviter cela, et elle est invisible partout.
 *
 * On la met donc à égalité avec la fermeture, avant même de demander quelle entreprise.
 */
export function Commencer() {
  const [nature, setNature] = useState<Nature | null>(null);
  const [commerciale, setCommerciale] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const devis = devisDeCessation(nature ?? "definitive");

  function ouvrir() {
    if (enCours || !nature) return;
    setErreur(null);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/cessation", { method: "POST" });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(corps.error ?? "Le dossier n'a pas pu être ouvert");
        return;
      }

      await fetch("/api/formalites/cessation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: corps.dossier, nature }),
      });

      router.push("/cessation?dossier=" + corps.dossier);
    });
  }

  return (
    <div className={styles.entree}>
      <div className={styles.entreeTete}>
        <h2 className={styles.entreeTitre}>Fermer votre auto-entreprise</h2>
        <p className={styles.entreeTexte}>
          La déclaration se fait au guichet unique, en trente jours, et elle ne coûte
          rien. Ce qui coûte cher, c&apos;est ce qu&apos;on oublie ensuite : une dernière
          déclaration de chiffre d&apos;affaires manquée laisse un compte URSSAF ouvert,
          avec ses mises en demeure.
        </p>
      </div>

      <section className={styles.entreeBloc}>
        <h3 className={styles.blocTitre}>Définitive, ou une pause ?</h3>
        <p className={styles.blocTexte}>
          C&apos;est la seule question qui engage. Une cessation définitive ne se défait
          pas ; une suspension se reprend quand vous voulez.
        </p>

        <div className={styles.orientation}>
          <p className={styles.orientationIntitule}>
            Votre activité est-elle commerciale ?
          </p>
          <p className={styles.orientationPrecision}>
            Achat-revente, restauration, hébergement. Elle seule peut suspendre deux ans ;
            les autres, un an.
          </p>
          <div className={styles.orientationChoix}>
            <button
              type="button"
              className={commerciale ? styles.blocPrincipal : undefined}
              aria-pressed={commerciale}
              onClick={() => setCommerciale(true)}
            >
              Oui
            </button>
            <button
              type="button"
              className={!commerciale ? styles.blocPrincipal : undefined}
              aria-pressed={!commerciale}
              onClick={() => setCommerciale(false)}
            >
              Non
            </button>
          </div>
        </div>

        <ul className={styles.entreeChoix}>
          <li>
            <button
              type="button"
              className={styles.entreeCarte}
              aria-pressed={nature === "definitive"}
              onClick={() => setNature("definitive")}
            >
              <span className={styles.entreeCase} aria-hidden="true" />
              <span className={styles.entreeCarteTitre}>Fermer définitivement</span>
              <span className={styles.entreeCarteTexte}>{CESSATION_EST_DEFINITIVE}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={styles.entreeCarte}
              aria-pressed={nature === "temporaire"}
              onClick={() => setNature("temporaire")}
            >
              <span className={styles.entreeCase} aria-hidden="true" />
              <span className={styles.entreeCarteTitre}>Mettre en pause</span>
              <span className={styles.entreeCarteTexte}>
                {suspensionExpliquee(commerciale)}
              </span>
            </button>
          </li>
        </ul>

        {nature === "temporaire" && <p className={styles.blocNote}>{RADIATION_D_OFFICE}</p>}
      </section>

      {nature && (
        <>
          <ul className={styles.entreeRepere}>
            {PRESTATIONS.map((prestation) => (
              <li key={prestation}>{prestation}</li>
            ))}
          </ul>

          {erreur && (
            <p className={styles.entreeRefus} role="alert">
              {erreur}
            </p>
          )}

          <div className={styles.entreePied}>
            <div className={styles.entreePrix}>
              <span className={styles.entreeMontant}>
                {montantLisible(devis.honorairesHT)} HT
              </span>
              <span className={styles.entreeMention}>{FORMALITE_GRATUITE}</span>
            </div>

            <div className={styles.entreeActions}>
              <button
                type="button"
                className={styles.entreeBouton}
                onClick={ouvrir}
                disabled={enCours}
              >
                {enCours ? "Ouverture…" : "Commencer"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
