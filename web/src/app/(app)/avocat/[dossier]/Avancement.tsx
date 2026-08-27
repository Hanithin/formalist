"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SOUS_PHASES_ORDONNEES,
  sousPhaseSuivante,
  passageSousPhasePermis,
  passageBloque,
} from "@/domain/formalite/avocat";
/*
 * Le nom de l'étape se lit selon le type de dossier.
 *
 * La table d'avocat.ts est fixe : elle nomme la dernière étape « KBIS » pour tout le
 * monde. Sur une modification, la carte annonçait donc « 5 KBIS » pendant que la tâche
 * voisine demandait de remettre un extrait à jour, et un dépôt de comptes attend un
 * récépissé. Celle de cabinet.ts les distingue.
 */
import { libelleSousPhase, type TypeDeDossier } from "@/domain/formalite/cabinet";
import styles from "./Avancement.module.css";

interface Props {
  dossierId: number;
  sousPhase: string | null;
  aLeKbis: boolean;
  /**
   * Le nom du document que le greffe délivre pour ce dossier.
   *
   * Il était écrit « Kbis » en dur, trois fois : l'avocat d'une modification lisait
   * qu'il devait remettre un Kbis, que le greffe ne délivre pas dans ce cas - il rend
   * un extrait à jour. Un dépôt de comptes reçoit un récépissé, une fermeture une
   * attestation de radiation. Le domaine les nomme déjà, dans DOCUMENT_FINAL.
   */
  documentFinal: string;
  aLeRbe: boolean;
  type: TypeDeDossier;
}

/**
 * Ce que l'étape déclenche du côté du client.
 *
 * Les cinq phrases étaient écrites pour une création : la deuxième invitait à déposer
 * une attestation de dépôt de capital, la cinquième annonçait une immatriculation. Un
 * dépôt de comptes n'immatricule rien, et une modification ne libère aucun capital.
 */
function explicationDe(
  etape: string,
  type: TypeDeDossier,
  documentFinal: string
): string {
  if (etape === "5a") {
    return "Le client a transmis son dossier. Contrôlez les informations et les pièces.";
  }
  if (etape === "5b") {
    return type === "creation"
      ? "Relecture des actes en cours. Le client est invité à déposer son attestation de dépôt de capital."
      : "Relecture des actes en cours. Le client sait que son dossier est entre vos mains.";
  }
  if (etape === "5c") {
    return "Le dossier est vérifié. Le client est invité à publier son annonce légale.";
  }
  if (etape === "5d") {
    return "Le dossier est déposé au guichet unique. Le client en est informé.";
  }
  return type === "creation"
    ? "La société est immatriculée. " + documentFinal + " est remis au client."
    : documentFinal + " est remis au client, et le dossier est clos.";
}

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
export function Avancement({ dossierId, sousPhase, aLeKbis, type, documentFinal }: Props) {
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

  const rangCourant = sousPhase ? SOUS_PHASES_ORDONNEES.indexOf(sousPhase as never) : -1;
  const nom = sousPhase ? libelleSousPhase(type, sousPhase) : "Rien n'est encore annoncé";

  return (
    <section className={styles.etat} aria-label="Avancement annoncé au client">
      <span className={styles.legende}>Le client voit</span>

      {/* Les cinq crans : la position se lit d'un coup, le nom la dit en toutes lettres. */}
      <span className={styles.crans} aria-hidden="true">
        {SOUS_PHASES_ORDONNEES.map((etape, rang) => (
          <span
            key={etape}
            className={rang <= rangCourant ? `${styles.cran} ${styles.atteint}` : styles.cran}
          />
        ))}
      </span>

      <span className={styles.nom}>{nom}</span>

      <span className={styles.actions}>
        {/* Le retour d'un cran corrige une saisie ; il ne défait pas le travail. */}
        {precedente && (
          <button
            type="button"
            className={styles.secondaire}
            onClick={() => avancer(precedente)}
            disabled={enCours}
          >
            Revenir à « {libelleSousPhase(type, precedente)} »
          </button>
        )}

        {suivante && passageSousPhasePermis(sousPhase, suivante) && (
          <button
            type="button"
            className={styles.principal}
            onClick={() => avancer(suivante)}
            disabled={enCours}
          >
            Passer à « {libelleSousPhase(type, suivante)} »
          </button>
        )}
      </span>

      <p className={styles.explication}>
        {sousPhase
          ? explicationDe(sousPhase, type, documentFinal)
          : "Le client n'est prévenu de rien tant qu'aucune étape n'est marquée."}
      </p>

      {erreur && (
        <p className={styles.erreur} role="alert">
          {erreur}
        </p>
      )}
    </section>
  );
}

/**
 * Les documents que le cabinet remet au client.
 *
 * Ils vivaient dans leur propre carte, sous l'avancement, au bas de la page. Ce sont
 * les pièces de l'étape « Déposer » : ils se rangent dans cette étape, avec les tâches
 * qui les réclament.
 */
export function Livrables({
  dossierId,
  documentFinal,
  aLeKbis,
  aLeRbe,
}: {
  dossierId: number;
  documentFinal: string;
  aLeKbis: boolean;
  aLeRbe: boolean;
}) {
  return (
    <div className={styles.livrables}>
      <p className={styles.livrablesTitre}>
        Documents remis au client. Ils apparaissent aussitôt dans ses documents.
      </p>
      <Livrable
        dossierId={dossierId}
        type="kbis"
        titre={documentFinal}
        precision="Exigé pour marquer le dossier abouti"
        depose={aLeKbis}
      />
      <Livrable
        dossierId={dossierId}
        type="rbe"
        titre="Registre des bénéficiaires effectifs"
        precision="Facultatif"
        depose={aLeRbe}
      />
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
