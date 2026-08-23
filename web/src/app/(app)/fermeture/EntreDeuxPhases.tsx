"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Fermeture } from "@/infrastructure/db/depots/fermeture";
import { ATTESTATIONS, POURQUOI_LES_ATTESTATIONS } from "@/domain/fermeture/pieces";
import { termeDuMandat, echeancesFiscales } from "@/domain/fermeture/delais";
import { Opposition } from "./Parcours";
import styles from "../modification/Modification.module.css";

/**
 * L'écran d'attente, entre la dissolution et la clôture.
 *
 * C'est le seul moment de l'application où le client n'a rien à saisir et beaucoup à
 * faire. La liquidation lui appartient : c'est lui qui vend, qui paie, qui obtient les
 * attestations. Nous ne pouvons ni l'accélérer ni la faire à sa place - mais nous
 * pouvons éviter qu'il arrive à la clôture en découvrant qu'il lui manque une pièce que
 * le greffe met trois semaines à réclamer.
 *
 * D'où deux choses ici, et deux seulement : ce qu'il doit obtenir maintenant, et le
 * bouton qui rouvre le parcours quand il a fini.
 */
export function EntreDeuxPhases({
  dossier,
  fermeture,
}: {
  dossier: number;
  fermeture: Fermeture;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const tup = fermeture.voie === "tup";
  const terme = termeDuMandat(String(fermeture.valeurs.dateDissolution ?? ""));
  const echeances = echeancesFiscales({
    dateDissolution: String(fermeture.valeurs.dateDissolution ?? ""),
  }).filter((e) => e.limite);

  function basculer(cle: keyof Fermeture["jalons"], valeur: boolean) {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/fermeture", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, jalons: { [cle]: valeur } }),
      });
      if (!reponse.ok) {
        setRefus("Le suivi n'a pas pu être enregistré");
        return;
      }
      router.refresh();
    });
  }

  function ouvrirLaCloture() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/fermeture", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(corps.error ?? "La clôture n'a pas pu être ouverte");
        return;
      }
      router.push("/fermeture?dossier=" + dossier + "&phase=cloture");
    });
  }

  return (
    <div className={styles.parcours}>
      <div className={styles.contenu}>
        <div className={styles.etapeTete}>
          <h2 className={styles.etapeTitre}>
            {tup ? "Le délai d'opposition court" : "La liquidation est en cours"}
          </h2>
        </div>

        {tup ? (
          <SuiviDeLaTup fermeture={fermeture} />
        ) : (
          <>
            <p className={styles.description}>
              Votre dissolution est entre les mains du cabinet. Pendant que la liquidation
              se déroule, vous réalisez l&apos;actif, réglez les créanciers et réunissez
              les pièces de la radiation.
            </p>

            {terme && (
              <p className={styles.blocNote}>
                Le mandat du liquidateur expire le{" "}
                {terme.split("-").reverse().join("/")}. La clôture doit intervenir avant
                cette date, faute de quoi sa prorogation devra être demandée au président
                du tribunal.
              </p>
            )}
          </>
        )}

        <section className={styles.bloc}>
          <h3 className={styles.blocTitre}>À obtenir dès maintenant</h3>
          <p className={styles.blocTexte}>{POURQUOI_LES_ATTESTATIONS}</p>

          <ul className={styles.jalons}>
            {ATTESTATIONS.map((piece) => {
              const cle = (
                piece.cle === "fiscale" ? "attestationFiscale" : "attestationSociale"
              ) as keyof Fermeture["jalons"];
              const faite = Boolean(fermeture.jalons[cle]);

              return (
                <li
                  key={piece.cle}
                  className={faite ? `${styles.jalon} ${styles.jalonFait}` : styles.jalon}
                >
                  <button
                    type="button"
                    className={styles.jalonCase}
                    aria-pressed={faite}
                    aria-label={
                      (faite ? "Marquer comme à obtenir : " : "Marquer comme obtenue : ") +
                      piece.intitule
                    }
                    onClick={() => basculer(cle, !faite)}
                    disabled={enCours}
                  />
                  <div>
                    <p className={styles.jalonIntitule}>{piece.intitule}</p>
                    <p className={styles.jalonTexte}>{piece.ou}</p>
                    <p className={styles.jalonTexte}>{piece.aQuoiElleSert}</p>
                    {piece.malentendu && (
                      <p className={styles.jalonAlerte}>{piece.malentendu}</p>
                    )}
                    <p className={styles.jalonFondement}>{piece.fondement}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {echeances.length > 0 && (
          <section className={styles.bloc}>
            <h3 className={styles.blocTitre}>Vos échéances fiscales</h3>
            <dl className={styles.faits}>
              {echeances.map((echeance) => (
                <div className={styles.fait} key={echeance.intitule}>
                  <dt>{echeance.intitule}</dt>
                  <dd>
                    <span className={styles.faitValeur}>
                      {echeance.limite?.split("-").reverse().join("/")}
                    </span>
                    <span className={styles.faitPrecision}>{echeance.explication}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {refus && (
          <p className={styles.manques} role="alert">
            {refus}
          </p>
        )}

        {!tup && (
          <section className={styles.bloc}>
            <h3 className={styles.blocTitre}>Quand la liquidation sera terminée</h3>
            <p className={styles.blocTexte}>
              Rouvrez le dossier pour saisir les comptes définitifs. Rien de plus à régler :
              la clôture et la radiation sont comprises dans ce que vous avez payé.
            </p>
            <div className={styles.blocActions}>
              <button
                type="button"
                className={styles.blocPrincipal}
                onClick={ouvrirLaCloture}
                disabled={enCours}
              >
                {enCours ? "Ouverture…" : "Passer à la clôture de la liquidation"}
              </button>
              <Link className={styles.confieLien} href={"/messagerie?dossier=" + dossier}>
                Écrire à l&apos;avocat
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * Le suivi d'une dissolution sans liquidation.
 *
 * Elle n'a pas de seconde phase : elle a une date. Tout se joue sur le délai
 * d'opposition, dont le terme se calcule et se surveille - la radiation demandée un jour
 * trop tôt est refusée, et il faut tout reprendre.
 */
function SuiviDeLaTup({ fermeture }: { fermeture: Fermeture }) {
  const bodacc = String(fermeture.valeurs.publicationBodacc ?? "");

  return (
    <>
      <p className={styles.description}>
        La dissolution est déclarée. Sa publication au BODACC ouvre aux créanciers un
        délai de trente jours pour former opposition : la transmission du patrimoine et la
        radiation n&apos;interviendront qu&apos;à son terme.
      </p>

      {bodacc ? (
        <Opposition publicationBodacc={bodacc} />
      ) : (
        <p className={styles.blocNote}>
          La date de parution au BODACC n&apos;est pas encore connue. Le cabinet la
          renseignera dès l&apos;inscription de la dissolution : le décompte des trente
          jours s&apos;affichera alors ici.
        </p>
      )}
    </>
  );
}
