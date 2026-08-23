"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MODIFICATIONS, type TypeModification } from "@/domain/modification/types";
import {
  HONORAIRES_PARTICULIERS,
  HONORAIRES_PREMIERE_CENTIMES,
  HONORAIRES_SUIVANTE_CENTIMES,
  devis,
  montantLisible,
} from "@/domain/modification/offre";
import styles from "./Modification.module.css";

/**
 * L'entrée du parcours.
 *
 * On y choisit ce qu'on change, autant de changements qu'on veut, et le dossier
 * s'ouvre avec la réponse de l'étape 2 déjà donnée.
 *
 * Deux versions ont échoué avant celle-ci, pour des raisons opposées.
 *
 * La première faisait cocher les changements ici, puis l'étape 2 les redemandait :
 * on répondait deux fois à la même question, la seconde pour rien. Le choix fait ici
 * remplit maintenant l'étape 2 au lieu de la doubler.
 *
 * La seconde n'affichait que des pastilles inertes - le style d'un bouton, le
 * comportement d'une puce - puis des cartes qui s'ouvraient au premier clic. Une
 * assemblée décide pourtant couramment plusieurs changements le même jour, et un
 * écran qui part au premier clic dit exactement l'inverse : on n'y voyait pas comment
 * en demander deux.
 *
 * L'ordre reste celui du travail réel : la société se choisit à la première étape, par
 * recherche au registre, ce qui remplit la moitié du dossier.
 */
export function Commencer() {
  const [choisis, setChoisis] = useState<TypeModification[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function basculer(code: TypeModification) {
    setErreur(null);
    setChoisis((actuels) =>
      actuels.includes(code) ? actuels.filter((c) => c !== code) : [...actuels, code]
    );
  }

  /*
   * Le prix suit la sélection, calculé par le devis plutôt que recopié.
   *
   * C'est le même calcul qu'au récapitulatif : le montant vu en entrant est celui
   * qu'on retrouvera à la fin, aux frais réels près. Sans société choisie, on ne sait
   * pas encore si le transfert change de ressort - les frais sont donc ceux du cas
   * courant, et la mention le dit.
   */
  const compte = choisis.length;
  /*
   * Les honoraires viennent du devis, non d'une addition refaite ici.
   *
   * Ils étaient recalculés sur place - le premier changement, puis les suivants - ce
   * qui était juste tant que tous se valaient. L'apport de titres a son propre tarif :
   * la formule d'ici annonçait alors un prix que l'étape du règlement démentait.
   */
  const honorairesHT = useMemo(
    () => (compte === 0 ? HONORAIRES_PREMIERE_CENTIMES : devis({ codes: choisis }).honorairesHT),
    [choisis, compte]
  );

  /*
   * Rien de coché : le devis ne facture aucun frais, puisqu'il n'y a rien à publier
   * ni à déposer. Ce zéro serait un mensonge affiché à l'entrée - on montre alors ce
   * que coûte le cas le plus simple, un changement de nom.
   */
  const fraisTTC = useMemo(
    () => devis({ codes: compte ? choisis : ["denomination"] }).fraisTTC,
    [choisis, compte]
  );

  /** Les changements cochés qui ont leur propre tarif, hors dégressivité. */
  const aPart = MODIFICATIONS.filter(
    (m) => choisis.includes(m.code) && HONORAIRES_PARTICULIERS[m.code] !== undefined
  );

  function ouvrir() {
    if (enCours) return;
    setErreur(null);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: choisis }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(corps.error ?? "Le dossier n'a pas pu être ouvert");
        return;
      }
      router.push("/modification?dossier=" + corps.dossier);
    });
  }

  return (
    <div className={styles.entree}>
      <div className={styles.entreeTete}>
        <h2 className={styles.entreeTitre}>Que voulez-vous changer ?</h2>
        <p className={styles.entreeTexte}>
          Cochez tout ce que votre assemblée décide - il n&apos;y a pas de limite, et
          plusieurs changements groupés coûtent bien moins cher que séparés. Nous
          rédigeons les actes, mettons les statuts à jour article par article, publions
          l&apos;annonce légale et déposons au guichet unique, jusqu&apos;à
          l&apos;extrait à jour.
        </p>
      </div>

      <div className={styles.entreeBloc}>
        {/* Des cases à cocher, non des liens : on en prend plusieurs avant de partir. */}
        <ul className={styles.entreeChoix}>
          {MODIFICATIONS.map((m) => {
            const pris = choisis.includes(m.code);

            return (
              <li key={m.code}>
                <button
                  type="button"
                  className={styles.entreeCarte}
                  onClick={() => basculer(m.code)}
                  disabled={enCours}
                  aria-pressed={pris}
                >
                  <span className={styles.entreeCase} aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className={styles.entreeCarteTitre}>{m.libelle}</span>
                  <span className={styles.entreeCarteTexte}>{m.description}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className={styles.entreeNote}>
          {compte > 1
            ? "Ces " +
              compte +
              " changements tiennent dans une seule assemblée : un procès-verbal, une annonce légale, un dépôt - les frais ne sont payés qu'une fois."
            : "Une assemblée qui décide plusieurs changements ne paie qu'une fois les frais d'annonce et de greffe."}
        </p>
      </div>

      {erreur && (
        <p className={styles.entreeRefus} role="alert">
          {erreur}
        </p>
      )}

      {/*
        Ce qui attend derrière le clic : sept étapes, deux pièces à réunir, et le
        règlement à la fin. Rien ne le disait, et l'on s'engageait à l'aveugle.
      */}
      <ul className={styles.entreeRepere}>
        <li>Sept étapes, reprises où vous les laissez</li>
        <li>Munissez-vous du SIREN et des statuts en vigueur</li>
        <li>Le règlement n&apos;intervient qu&apos;à la dernière étape</li>
      </ul>

      <div className={styles.entreePied}>
        <div className={styles.entreePrix} aria-live="polite">
          <span className={styles.entreeMontant}>{montantLisible(honorairesHT)} HT</span>
          <span className={styles.entreeMention}>
            {/*
              Ce qui compose le montant, quand la composition n'est pas évidente.
              L'apport de titres échappe à la dégressivité : l'annoncer comme un
              changement de plus, à 49 €, ferait mentir le total affiché au-dessus.
            */}
            {aPart.length > 0 ? (
              <>
                dont{" "}
                {aPart
                  .map((d) => montantLisible(HONORAIRES_PARTICULIERS[d.code]!) + " pour " + d.libelleCourt.toLowerCase())
                  .join(", ")}
                , facturé à part car il donne lieu à un acte distinct.
              </>
            ) : compte > 1 ? (
              <>
                {montantLisible(HONORAIRES_PREMIERE_CENTIMES)} pour le premier
                changement, puis {montantLisible(HONORAIRES_SUIVANTE_CENTIMES)} pour
                chacun des {compte - 1} autres.
              </>
            ) : (
              <>
                pour le premier changement, puis{" "}
                {montantLisible(HONORAIRES_SUIVANTE_CENTIMES)} HT par changement
                supplémentaire décidé dans la même assemblée.
              </>
            )}{" "}
            S&apos;y ajoutent les frais d&apos;annonce et de greffe, refacturés à
            l&apos;euro - environ {montantLisible(fraisTTC)}, quel que soit le nombre de
            changements.
          </span>
        </div>

        <div className={styles.entreeActions}>
          <button
            type="button"
            className={styles.entreeSecondaire}
            onClick={ouvrir}
            disabled={enCours || compte > 0}
          >
            Je ne sais pas encore
          </button>

          <button
            type="button"
            className={styles.entreeBouton}
            onClick={ouvrir}
            disabled={enCours || compte === 0}
          >
            {enCours
              ? "Ouverture…"
              : compte > 1
                ? "Continuer avec ces " + compte + " changements"
                : "Continuer"}
          </button>
        </div>
      </div>
    </div>
  );
}
