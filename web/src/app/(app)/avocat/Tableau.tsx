"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { etatCabinet, dateCourte, depuis } from "@/domain/formalite/avocat";
import { libelleDuType } from "@/domain/formalite/liste";
import styles from "./Avocat.module.css";

export interface Ligne {
  id: number;
  reference: string;
  societe: string;
  forme: string | null;
  capital: number | null;
  type: string;
  sousType: string | null;
  status: string | null;
  phase: number;
  sousPhase: string | null;
  offre: string | null;
  creePar: "avocat" | "client";
  creeLe: string;
  majLe: string;
  client: string;
  clientEmail: string | null;
  documentsAVerifier: number;
  notes: number;
  nonLus: number;
  payeCentimes: number;
  monDossier: boolean;
  libre: boolean;
  /** Ce que le client demande : les changements décidés, ou l'activité déclarée. */
  demande: string[];
}

function majuscule(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/** « 1 490 € » : les centimes n'apparaissent pas dans un tableau de suivi. */
function montant(centimes: number): string {
  return Math.round(centimes / 100).toLocaleString("fr-FR") + " €";
}

/**
 * Prendre un dossier en charge.
 *
 * Le dossier est proposé à tout le cabinet : le premier qui accepte le prend, et les
 * autres lisent le refus.
 */
async function demanderLaPrise(dossierId: number): Promise<string | null> {
  const reponse = await fetch("/api/avocat/prise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dossier: dossierId }),
  });

  if (reponse.status === 409) {
    const donnees = await reponse.json().catch(() => ({}));
    return (donnees.error as string) ?? "Ce dossier a déjà été pris en charge.";
  }
  if (!reponse.ok) return "La prise en charge n'a pas abouti.";
  return null;
}

/**
 * Le tableau des dossiers.
 *
 * Un clic sur une ligne ouvrait un panneau : il redisait ce que la ligne montrait
 * déjà - la société, le type, l'offre, l'état, le client - et son seul geste propre
 * était un bouton « Ouvrir le dossier ». Il fallait donc deux clics et une lecture
 * pour arriver là où l'on allait de toute façon. La ligne y mène directement.
 *
 * Le geste de prise reste sur la ligne : accepter un dossier se décide de la liste,
 * sans l'ouvrir.
 */
export function Tableau({ lignes }: { lignes: Ligne[] }) {
  const router = useRouter();
  /*
   * Un refus de prise se lit sous la ligne concernée.
   *
   * « Ce dossier a déjà été pris par X » ne tient pas dans une cellule, et il n'y a
   * plus de panneau où l'afficher : la rangée qui suit le porte, le temps qu'on le
   * lise.
   */
  const [refus, setRefus] = useState<{ dossier: number; message: string } | null>(null);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.dossiersTable}>
        <thead>
          <tr>
            <th>Réf.</th>
            <th>Société</th>
            <th>Type</th>
            <th>Offre</th>
            <th>Phase</th>
            <th>Client</th>
            <th>Créée</th>
            <th>Modifiée</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lignes.map((d) => {
            const etat = etatCabinet(d);
            const type =
              (libelleDuType(d.type) ?? majuscule(d.type)) +
              (d.sousType ? " (" + d.sousType.replace(/_/g, " ") + ")" : "");

            return (
              <Fragment key={d.id}>
                <tr onClick={() => router.push("/avocat/" + d.id)}>
                  <td className={styles.ref}>{d.reference}</td>
                  <td>
                    <span className={styles.societeCellule}>
                      {/* Le nom porte le lien : une rangée cliquable ne s'atteint ni au
                          clavier, ni d'un clic du milieu. */}
                      <Link
                        href={"/avocat/" + d.id}
                        className={styles.societeNom}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {d.societe}
                      </Link>
                      {d.forme && <span className={styles.forme}>{d.forme}</span>}
                      {d.nonLus > 0 && (
                        <span className={`${styles.badge} ${styles.unread}`}>{d.nonLus}</span>
                      )}
                      {d.creePar === "avocat" && (
                        <span className={`${styles.badge} ${styles.avocatCreated}`}>Avocat</span>
                      )}
                    </span>
                    {!!d.capital && d.capital > 0 && (
                      <span className={styles.sousTitre}>
                        Capital de {Number(d.capital).toLocaleString("fr-FR")} €
                      </span>
                    )}
                  </td>
                  <td>{type}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[d.offre ?? "starter"] ?? ""}`}>
                      {majuscule(d.offre ?? "starter")}
                    </span>
                    {d.payeCentimes > 0 && (
                      <div className={styles.paye}>{montant(d.payeCentimes)} payés</div>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${styles[etat.teinte]}`}>{etat.libelle}</span>
                  </td>
                  <td>{d.client}</td>
                  <td className={styles.quand}>{dateCourte(new Date(d.creeLe))}</td>
                  <td className={styles.quand}>{depuis(new Date(d.majLe))}</td>
                  <td className={styles.celluleAction}>
                    {/*
                      Le geste est sur la ligne.

                      Il fallait ouvrir chaque dossier pour découvrir lequel portait le
                      bouton : la liste montre lesquels attendent un preneur, et on les
                      prend d'ici.
                    */}
                    {d.monDossier && (
                      <span className={`${styles.badge} ${styles.purple} ${styles.badgeAssigne}`}>
                        Assigné à vous
                      </span>
                    )}
                    {d.libre && (
                      <BoutonPrise
                        dossier={d}
                        surRefus={(message) => setRefus({ dossier: d.id, message })}
                      />
                    )}
                    <svg
                      className={styles.chevron}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </td>
                </tr>

                {refus?.dossier === d.id && (
                  <tr className={styles.ligneRefus}>
                    <td colSpan={9}>
                      <span role="status">{refus.message}</span>
                      <button
                        type="button"
                        className={styles.ligneRefusFermer}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRefus(null);
                        }}
                      >
                        Fermer
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Le bouton de prise posé sur la ligne.
 *
 * Il emmène sur le dossier pris : accepter puis rester devant la liste laisserait
 * l'avocat sans rien à faire de ce qu'il vient d'accepter.
 */
function BoutonPrise({
  dossier,
  surRefus,
}: {
  dossier: Ligne;
  surRefus: (message: string) => void;
}) {
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();

  return (
    <button
      type="button"
      className={styles.boutonPrise}
      disabled={enCours}
      aria-label={"Prendre en charge le dossier " + dossier.societe}
      onClick={async (e) => {
        // La ligne entière mène au dossier : le bouton, lui, le prend.
        e.stopPropagation();
        setEnCours(true);
        const refus = await demanderLaPrise(dossier.id);
        setEnCours(false);
        if (refus) {
          surRefus(refus);
          return;
        }
        router.push("/avocat/" + dossier.id);
      }}
    >
      {/* Un mot suffit dans un tableau : la pastille « À prendre » dit déjà quoi. */}
      {enCours ? "…" : "Prendre"}
    </button>
  );
}
