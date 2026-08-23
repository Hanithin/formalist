"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { montantLisible } from "@/domain/modification/offre";
import { devisDeFermeture, HORS_FORFAIT } from "@/domain/fermeture/offre";
import {
  orientationDe,
  CE_QUE_FAIT_UN_AVOCAT,
  TUP_RESERVEE_AUX_SOCIETES,
} from "@/domain/fermeture/voie";
import { ATTESTATIONS, POURQUOI_LES_ATTESTATIONS } from "@/domain/fermeture/pieces";
import styles from "../modification/Modification.module.css";

/**
 * L'entrée du parcours de fermeture.
 *
 * C'est le seul écran de l'application qui puisse refuser d'ouvrir un dossier, et c'est
 * volontaire. Une société qui ne peut plus payer ses dettes n'a pas le droit de se
 * fermer à l'amiable : son dirigeant doit déclarer la cessation des paiements sous
 * quarante-cinq jours, et lui vendre des actes de dissolution reviendrait à l'aider à
 * laisser courir ce délai - qui l'engage sur son patrimoine.
 *
 * Deux questions suffisent à orienter. On les pose avant tout le reste, avant même de
 * demander quelle société, parce que la réponse à la première décide s'il y a un
 * parcours ou une consultation.
 */

const AUCUNE_REPONSE = null;

type Reponse = boolean | null;

export function Commencer() {
  const [dettes, setDettes] = useState<Reponse>(AUCUNE_REPONSE);
  const [associeSociete, setAssocieSociete] = useState<Reponse>(AUCUNE_REPONSE);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const repondu = dettes !== null && (dettes === true || associeSociete !== null);

  const orientation = useMemo(
    () =>
      repondu
        ? orientationDe({
            dettesImpayables: dettes === true,
            associeUniquePersonneMorale: associeSociete === true,
          })
        : null,
    [repondu, dettes, associeSociete]
  );

  const devis = devisDeFermeture({
    voie: orientation?.voie === "tup" ? "tup" : "liquidation-amiable",
    associeUniqueDirigeant: false,
  });

  function ouvrir() {
    if (enCours || !orientation?.possible) return;
    setErreur(null);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/fermeture", { method: "POST" });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setErreur(corps.error ?? "Le dossier n'a pas pu être ouvert");
        return;
      }

      /*
       * La situation part avec l'ouverture.
       *
       * Sans cela, le premier écran du parcours redemanderait ce qu'on vient de
       * répondre, et la voie ne serait connue qu'après un second aller-retour.
       */
      await fetch("/api/formalites/fermeture", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier: corps.dossier,
          situation: {
            dettesImpayables: dettes === true,
            associeUniquePersonneMorale: associeSociete === true,
          },
        }),
      });

      router.push("/fermeture?dossier=" + corps.dossier);
    });
  }

  return (
    <div className={styles.entree}>
      <div className={styles.entreeTete}>
        <h2 className={styles.entreeTitre}>Fermer votre société</h2>
        <p className={styles.entreeTexte}>
          Une fermeture amiable se fait en deux temps : on dissout, puis on liquide. Elle
          suppose une condition, et une seule : que la société puisse payer tout ce
          qu&apos;elle doit. Deux questions suffisent à savoir par où passer.
        </p>
      </div>

      <section className={styles.entreeBloc}>
        <h3 className={styles.blocTitre}>Votre situation</h3>

        <Question
          intitule="Votre société peut-elle payer toutes ses dettes avec ce qu'elle possède ?"
          precision="Fournisseurs, impôts, cotisations, emprunts, comptes courants d'associés. On compte ce qui est exigible aujourd'hui, non ce qui le deviendra."
          valeur={dettes === null ? null : !dettes}
          surReponse={(oui) => setDettes(!oui)}
        />

        {dettes === false && (
          <Question
            intitule="Votre société est-elle détenue en totalité par une autre société ?"
            precision="Une seule associée, qui est une personne morale. Détenue par un particulier, même à cent pour cent, la réponse est non."
            valeur={associeSociete}
            surReponse={setAssocieSociete}
          />
        )}
      </section>

      {orientation && (
        <section className={styles.entreeBloc}>
          <h3 className={styles.blocTitre}>{orientation.titre}</h3>
          <p className={styles.blocTexte}>{orientation.explication}</p>
          <p className={styles.entreeNote}>{orientation.fondement}</p>

          {orientation.voie === "liquidation-judiciaire" && <VersLAvocat />}

          {orientation.voie === "liquidation-amiable" && associeSociete === false && (
            <p className={styles.blocNote}>{TUP_RESERVEE_AUX_SOCIETES}</p>
          )}
        </section>
      )}

      {orientation?.possible && (
        <>
          <section className={styles.entreeBloc}>
            <h3 className={styles.blocTitre}>
              Ce qu&apos;il faudra fournir, et qu&apos;il vaut mieux demander maintenant
            </h3>
            <p className={styles.blocTexte}>{POURQUOI_LES_ATTESTATIONS}</p>
            <ul className={styles.entreeRepere}>
              {ATTESTATIONS.map((piece) => (
                <li key={piece.cle}>
                  {piece.intitule} - {piece.fondement}
                </li>
              ))}
            </ul>
          </section>

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
              <span className={styles.entreeMention}>
                pour la fermeture entière, réglés une seule fois : la clôture de la
                liquidation est comprise. S&apos;y ajoutent environ{" "}
                {montantLisible(devis.fraisTTC)} de frais réglementés - annonces légales
                et greffe - refacturés à l&apos;euro. {HORS_FORFAIT[0]}.
              </span>
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

/** Une question fermée, avec ce qu'il faut savoir pour y répondre juste. */
function Question({
  intitule,
  precision,
  valeur,
  surReponse,
}: {
  intitule: string;
  precision: string;
  valeur: Reponse;
  surReponse: (oui: boolean) => void;
}) {
  return (
    <div className={styles.orientation}>
      <p className={styles.orientationIntitule}>{intitule}</p>
      <p className={styles.orientationPrecision}>{precision}</p>
      <div className={styles.orientationChoix}>
        <button
          type="button"
          className={valeur === true ? styles.blocPrincipal : undefined}
          aria-pressed={valeur === true}
          onClick={() => surReponse(true)}
        >
          Oui
        </button>
        <button
          type="button"
          className={valeur === false ? styles.blocPrincipal : undefined}
          aria-pressed={valeur === false}
          onClick={() => surReponse(false)}
        >
          Non
        </button>
      </div>
    </div>
  );
}

/**
 * La sortie, quand la voie amiable est fermée.
 *
 * Elle ne vend rien et ne culpabilise pas : elle dit ce qu'un avocat fait, et mène au
 * calendrier avec la situation déjà écrite. Un dirigeant dans cet état a besoin d'un
 * rendez-vous, pas d'un formulaire de plus.
 */
function VersLAvocat() {
  const demande = [
    "Ma société ne peut plus payer ses dettes avec ce dont elle dispose.",
    "Je souhaite être accompagné pour déclarer la cessation des paiements et engager la procédure devant le tribunal de commerce.",
  ].join(" ");

  return (
    <>
      <p className={styles.blocNote}>{CE_QUE_FAIT_UN_AVOCAT}</p>
      <div className={styles.blocActions}>
        <Link
          className={styles.entreeBouton}
          href={
            "/consultations?matiere=droit_societes&demande=" + encodeURIComponent(demande)
          }
        >
          Prendre rendez-vous avec un avocat
        </Link>
      </div>
    </>
  );
}
