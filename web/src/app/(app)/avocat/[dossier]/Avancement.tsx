"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SOUS_PHASES_ORDONNEES,
  libelleSousPhase,
  sousPhaseSuivante,
  passageSousPhasePermis,
  passageBloque,
} from "@/domain/formalite/avocat";
import styles from "./Avancement.module.css";

interface Props {
  dossierId: number;
  sousPhase: string | null;
  aLeKbis: boolean;
  aLeRbe: boolean;
}

/** Ce que chaque étape veut dire pour le cabinet, et ce qu'elle déclenche côté client. */
const EXPLICATIONS: Record<string, string> = {
  "5a": "Le client a transmis son dossier. Contrôlez les informations et les pièces.",
  "5b": "Relecture des actes en cours. Le client est invité à déposer son attestation de dépôt de capital.",
  "5c": "Le dossier est vérifié. Le client est invité à publier son annonce légale.",
  "5d": "Le dossier est déposé au guichet unique. Le client en est informé.",
  "5e": "La société est immatriculée. Le Kbis est remis au client.",
};

/**
 * L'avancement du travail du cabinet, et les documents qu'il remet.
 *
 * Les cinq pastilles existaient dans la liste et aucune ne s'allumait : aucune route
 * n'écrivait la colonne. Et le Kbis n'avait aucun chemin pour arriver dans le dossier
 * du client, alors que le message de fin le lui promettait.
 *
 * Un seul bouton d'avancement : celui de l'étape suivante. Offrir les cinq
 * reviendrait à demander de connaître leur ordre, et à permettre d'en sauter une.
 */
export function Avancement({ dossierId, sousPhase, aLeKbis, aLeRbe }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const suivante = sousPhaseSuivante(sousPhase);
  const precedente =
    sousPhase && SOUS_PHASES_ORDONNEES.indexOf(sousPhase as never) > 0
      ? SOUS_PHASES_ORDONNEES[SOUS_PHASES_ORDONNEES.indexOf(sousPhase as never) - 1]
      : null;

  function avancer(vers: string) {
    const refus = passageBloque(vers, aLeKbis);
    if (refus) {
      setErreur(refus);
      return;
    }
    setErreur(null);

    demarrer(async () => {
      const reponse = await fetch("/api/avocat/dossier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, sousPhase: vers }),
      });

      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur((donnees.error as string) ?? "Le changement n'a pas abouti.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={styles.bloc}>
      <section className={styles.carte}>
        <h2 className={styles.titre}>Avancement du dossier</h2>
        <p className={styles.sousTitre}>
          Chaque étape prévient le client de ce qui le concerne. Il n&apos;en est
          informé qu&apos;ici.
        </p>

        <ol className={styles.etapes}>
          {SOUS_PHASES_ORDONNEES.map((etape) => {
            const rang = SOUS_PHASES_ORDONNEES.indexOf(etape);
            const rangCourant = sousPhase
              ? SOUS_PHASES_ORDONNEES.indexOf(sousPhase as never)
              : -1;
            const etat = rang < rangCourant ? "faite" : rang === rangCourant ? "courante" : "avenir";

            return (
              <li key={etape} className={`${styles.etape} ${styles[etat]}`}>
                <span className={styles.puce} aria-hidden="true">
                  {rang + 1}
                </span>
                <span className={styles.corps}>
                  <span className={styles.nom}>{libelleSousPhase(etape)}</span>
                  <span className={styles.explication}>{EXPLICATIONS[etape]}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {erreur && (
          <p className={styles.erreur} role="alert">
            {erreur}
          </p>
        )}

        <div className={styles.actions}>
          {suivante && passageSousPhasePermis(sousPhase, suivante) && (
            <button
              type="button"
              className={styles.principal}
              onClick={() => avancer(suivante)}
              disabled={enCours}
            >
              Passer à « {libelleSousPhase(suivante)} »
            </button>
          )}

          {/* Le retour d'un cran corrige une saisie ; il ne défait pas le travail. */}
          {precedente && (
            <button
              type="button"
              className={styles.secondaire}
              onClick={() => avancer(precedente)}
              disabled={enCours}
            >
              Revenir à « {libelleSousPhase(precedente)} »
            </button>
          )}
        </div>
      </section>

      <section className={styles.carte}>
        <h2 className={styles.titre}>Documents remis au client</h2>
        <p className={styles.sousTitre}>
          Ils apparaissent aussitôt dans ses documents. Le Kbis est exigé pour marquer
          le dossier immatriculé ; le registre des bénéficiaires ne l&apos;est pas.
        </p>

        <Livrable
          dossierId={dossierId}
          type="kbis"
          titre="Kbis"
          precision="Exigé"
          depose={aLeKbis}
        />
        <Livrable
          dossierId={dossierId}
          type="rbe"
          titre="Registre des bénéficiaires effectifs"
          precision="Facultatif"
          depose={aLeRbe}
        />
      </section>
    </div>
  );
}

function Livrable({
  dossierId,
  type,
  titre,
  precision,
  depose,
}: {
  dossierId: number;
  type: string;
  titre: string;
  precision: string;
  depose: boolean;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function deposer(fichier: File) {
    setErreur(null);

    demarrer(async () => {
      const corps = new FormData();
      corps.append("dossier", String(dossierId));
      corps.append("type", type);
      corps.append("fichier", fichier);

      const reponse = await fetch("/api/avocat/livrables", { method: "POST", body: corps });
      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur((donnees.error as string) ?? "Le dépôt n'a pas abouti.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={depose ? `${styles.livrable} ${styles.remis}` : styles.livrable}>
      <span className={styles.livrableCorps}>
        <span className={styles.livrableTitre}>{titre}</span>
        <span className={styles.livrableEtat}>
          {depose ? "Déposé - le client y a accès" : precision}
        </span>
        {erreur && (
          <span className={styles.erreur} role="alert">
            {erreur}
          </span>
        )}
      </span>

      <button
        type="button"
        className={styles.deposer}
        onClick={() => champ.current?.click()}
        disabled={enCours}
      >
        {depose ? "Remplacer" : "Déposer"}
      </button>

      <input
        ref={champ}
        type="file"
        className={styles.fichier}
        accept=".pdf,.jpg,.jpeg,.png"
        aria-label={"Déposer " + titre}
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          if (fichier) deposer(fichier);
          e.target.value = "";
        }}
      />
    </div>
  );
}
