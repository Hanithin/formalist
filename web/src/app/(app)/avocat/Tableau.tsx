"use client";

import { useEffect, useState } from "react";
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
}

function majuscule(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1);
}

/** « 1 490 € » : les centimes n'apparaissent pas dans un tableau de suivi. */
function montant(centimes: number): string {
  return Math.round(centimes / 100).toLocaleString("fr-FR") + " €";
}

/**
 * Le tableau des dossiers, et le panneau qui s'ouvre sur l'un d'eux.
 *
 * Ouvrir un dossier faisait quitter la liste : on perdait sa recherche, son tri et sa
 * page pour lire trois lignes, et il fallait revenir pour passer au suivant. Le
 * panneau donne l'essentiel sans quitter la liste, et la page complète reste à un
 * clic pour qui veut travailler dessus.
 *
 * C'est aussi le bon endroit pour accepter la révision : on décide en voyant ce qu'on
 * prend.
 */
export function Tableau({ lignes }: { lignes: Ligne[] }) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  const choisi = lignes.find((l) => l.id === ouvert) ?? null;

  // La touche Échap referme : c'est ce qu'on essaie d'abord sur un panneau.
  useEffect(() => {
    if (!choisi) return;

    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(null);
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [choisi]);

  return (
    <>
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
                <tr
                  key={d.id}
                  className={d.id === ouvert ? styles.ligneOuverte : undefined}
                  onClick={() => setOuvert(d.id)}
                >
                  <td className={styles.ref}>{d.reference}</td>
                  <td>
                    <span className={styles.societeCellule}>
                      {/* Le bouton porte le nom : une ligne entière cliquable ne
                          s'atteint pas au clavier. */}
                      <button
                        type="button"
                        className={styles.societeNom}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOuvert(d.id);
                        }}
                      >
                        {d.societe}
                      </button>
                      {d.forme && <span className={styles.forme}>{d.forme}</span>}
                      {d.nonLus > 0 && (
                        <span className={`${styles.badge} ${styles.unread}`}>{d.nonLus}</span>
                      )}
                      {d.monDossier && (
                        <span className={`${styles.badge} ${styles.purple}`}>Assigné à vous</span>
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
                  <td style={{ textAlign: "right" }}>
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
              );
            })}
          </tbody>
        </table>
      </div>

      {choisi && <Panneau dossier={choisi} surFermeture={() => setOuvert(null)} />}
    </>
  );
}

/**
 * Le détail d'un dossier, sans quitter la liste.
 *
 * Il porte ce qu'on regarde pour décider : de quoi il s'agit, qui l'a ouvert, ce qui
 * attend une vérification, et ce qu'il reste à faire. Le reste - les pièces, les
 * notes, le journal - vit dans la page du dossier, à un clic.
 */
function Panneau({ dossier, surFermeture }: { dossier: Ligne; surFermeture: () => void }) {
  const etat = etatCabinet(dossier);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();

  async function prendre() {
    setEnCours(true);
    setErreur(null);

    const reponse = await fetch("/api/avocat/prise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dossier: dossier.id }),
    });

    setEnCours(false);

    if (reponse.status === 409) {
      const donnees = await reponse.json().catch(() => ({}));
      setErreur((donnees.error as string) ?? "Ce dossier a déjà été pris en charge.");
      return;
    }
    if (!reponse.ok) {
      setErreur("La prise en charge n'a pas abouti.");
      return;
    }

    /*
     * On emmène l'avocat sur le dossier qu'il vient de prendre.
     *
     * Le panneau se fermait sur la liste : le dossier était accepté, et rien ne
     * disait où aller pour le réviser. Le lien « Ouvrir le dossier » disparaissait
     * avec le panneau.
     */
    surFermeture();
    router.push("/avocat/" + dossier.id);
  }

  return (
    <>
      {/* Le voile ne masque pas la liste : on garde le contexte de ce qu'on lisait. */}
      <div className={styles.voile} onClick={surFermeture} aria-hidden="true" />

      <aside className={styles.panneau} role="dialog" aria-label={"Dossier " + dossier.societe}>
        <div className={styles.panneauTete}>
          <div>
            <p className={styles.panneauRef}>{dossier.reference}</p>
            <h2 className={styles.panneauTitre}>{dossier.societe}</h2>
            <p className={styles.panneauSousTitre}>
              {[
                dossier.forme,
                libelleDuType(dossier.type),
                dossier.capital ? "capital de " + Number(dossier.capital).toLocaleString("fr-FR") + " €" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <button
            type="button"
            className={styles.panneauFermer}
            onClick={surFermeture}
            aria-label="Fermer"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.panneauBadges}>
          <span className={`${styles.badge} ${styles[etat.teinte]}`}>{etat.libelle}</span>
          <span className={`${styles.badge} ${styles[dossier.offre ?? "starter"] ?? ""}`}>
            {majuscule(dossier.offre ?? "starter")}
          </span>
          {dossier.monDossier && (
            <span className={`${styles.badge} ${styles.purple}`}>Assigné à vous</span>
          )}
        </div>

        <dl className={styles.panneauFaits}>
          <Fait libelle="Client" valeur={dossier.client} />
          {dossier.clientEmail && <Fait libelle="Adresse" valeur={dossier.clientEmail} />}
          <Fait libelle="Ouverte le" valeur={dateCourte(new Date(dossier.creeLe))} />
          <Fait libelle="Dernier mouvement" valeur={depuis(new Date(dossier.majLe))} />
          {dossier.payeCentimes > 0 && (
            <Fait libelle="Encaissé" valeur={montant(dossier.payeCentimes)} />
          )}
        </dl>

        {/* Ce qui attend un geste, avant tout le reste. */}
        {(dossier.documentsAVerifier > 0 || dossier.nonLus > 0) && (
          <ul className={styles.panneauAttentes}>
            {dossier.documentsAVerifier > 0 && (
              <li>
                {dossier.documentsAVerifier} pièce{dossier.documentsAVerifier > 1 ? "s" : ""} à
                vérifier
              </li>
            )}
            {dossier.nonLus > 0 && (
              <li>
                {dossier.nonLus} message{dossier.nonLus > 1 ? "s" : ""} non lu
                {dossier.nonLus > 1 ? "s" : ""}
              </li>
            )}
          </ul>
        )}

        {erreur && (
          <p className={styles.panneauErreur} role="status">
            {erreur}
          </p>
        )}

        <div className={styles.panneauActions}>
          {dossier.libre && !erreur && (
            <button
              type="button"
              className={styles.panneauPrincipal}
              onClick={prendre}
              disabled={enCours}
            >
              {enCours ? "…" : "Accepter la révision"}
            </button>
          )}

          <Link href={"/avocat/" + dossier.id} className={styles.panneauSecondaire}>
            Ouvrir le dossier
          </Link>
        </div>
      </aside>
    </>
  );
}

function Fait({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className={styles.fait}>
      <dt>{libelle}</dt>
      <dd>{valeur}</dd>
    </div>
  );
}
