"use client";

import { useState, useTransition } from "react";
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
 *
 * La troisième disait « le client est invité à publier son annonce légale ». L'avis est
 * rédigé et publié par le cabinet, ici comme partout ailleurs sur le site - et un dépôt
 * de comptes n'en publie aucun.
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
    return "Le dossier est vérifié. Il ne reste qu'à le déposer au guichet.";
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

      {/*
        Un seul geste : celui qui ne se devine pas.

        Les quatre autres étapes se déduisent du travail fait - le dossier pris, les
        informations relues, les pièces décidées, les actes validés, le document du
        greffe déposé - et s'avancent d'elles-mêmes. Le dépôt au guichet, lui, se passe
        hors de l'application : c'est le seul que l'avocat déclare.
      */}
      <span className={styles.actions}>
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

        {suivante === "5d" && passageSousPhasePermis(sousPhase, suivante) && (
          <button
            type="button"
            className={styles.principal}
            onClick={() => avancer(suivante)}
            disabled={enCours}
          >
            J&apos;ai déposé au guichet
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
 * Déposer un document que le cabinet remet au client.
 *
 * Les deux livrables tenaient leur propre carte, sous l'avancement : « Récépissé de
 * dépôt » y attendait un fichier pendant que la tâche « Remettre récépissé de dépôt »
 * demandait la même chose vingt lignes plus haut. Le dépôt appartient à la tâche ; il
 * ne reste ici que le chemin vers le serveur.
 *
 * Rend le motif du refus, ou rien du tout quand c'est passé.
 */
export async function deposerUnLivrable(
  dossierId: number,
  type: "kbis" | "rbe",
  fichier: File
): Promise<string | null> {
  const corps = new FormData();
  corps.append("dossier", String(dossierId));
  corps.append("type", type);
  corps.append("fichier", fichier);

  const reponse = await fetch("/api/avocat/livrables", { method: "POST", body: corps });
  if (reponse.ok) return null;

  const donnees = await reponse.json().catch(() => ({}));
  return (donnees.error as string) ?? "Le dépôt n'a pas abouti.";
}
