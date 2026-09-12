"use client";

import { useEffect, useRef, useState } from "react";
import type { AirLu } from "@/domain/modification/lecture-air";
import type { NatureDuDepot } from "@/domain/modification/nature-accord";
import type { AccordDepose } from "./Accords";
import styles from "./Modification.module.css";

/**
 * Le dépôt des accords, en deux temps.
 *
 * Le bouton envoyait, lisait et ajoutait au dossier d'un seul geste. Se tromper de
 * fichier dans le sélecteur - ils portent des noms qui se ressemblent - laissait un
 * relevé bancaire dans la liste des accords, avec ses quatre champs vides, qu'il fallait
 * ensuite retrouver et retirer. Et rien ne disait ce qu'on venait de déposer : un
 * contrat qu'on n'a pas su lire et un fichier qui n'a rien à voir se ressemblaient trait
 * pour trait, quatre blancs dans un tableau.
 *
 * Ici, on voit avant d'engager. Les fichiers sont lus sans être écrits nulle part,
 * chaque ligne dit ce qu'elle est et ce qu'on en a tiré, et le dossier n'est touché
 * qu'au moment de valider. Fermer sans valider ne laisse rien - pas même un fichier
 * orphelin sur le disque.
 */

/** Une ligne de la fenêtre : un fichier, son sort, et ce qu'on en a lu. */
interface Ligne {
  cle: string;
  fichier: File;
  etat: "lecture" | "lu" | "echec";
  nature?: NatureDuDepot;
  libelle?: string;
  indices?: string[];
  retenu: boolean;
  lu?: AirLu;
}

interface Analyse {
  nom: string;
  taille: number;
  nature: NatureDuDepot;
  libelle: string;
  indices: string[];
  retenu: boolean;
  lu: AirLu;
}

const EUROS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** La pastille de chaque verdict : une couleur par nature, jamais un code. */
const TONS: Record<NatureDuDepot, string> = {
  air: "depotVerdictBon",
  autre_accord: "depotVerdictTiede",
  illisible: "depotVerdictTiede",
  hors_sujet: "depotVerdictMauvais",
};

/* La date est lue au format de stockage : on la montre au format qu'on lit. */
function enFrancais(iso: string): string {
  const [a, m, j] = iso.split("-");
  return j && m && a ? j + "/" + m + "/" + a : iso;
}

function poids(octets: number): string {
  if (octets < 1024) return octets + " o";
  if (octets < 1024 * 1024) return Math.round(octets / 1024) + " ko";
  return (octets / (1024 * 1024)).toFixed(1).replace(".", ",") + " Mo";
}

export function DepotDesAccords({
  dossier,
  surFermeture,
  surDepot,
}: {
  dossier: number;
  surFermeture: () => void;
  surDepot: (accords: AccordDepose[]) => void;
}) {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const champFichier = useRef<HTMLInputElement>(null);

  /* Échap ferme, comme sur toute fenêtre de ce genre - sauf pendant l'envoi, où
     l'interrompre laisserait une partie des accords déposés et l'autre non. */
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape" && !envoi) surFermeture();
    }
    document.addEventListener("keydown", auClavier);
    return () => document.removeEventListener("keydown", auClavier);
  }, [surFermeture, envoi]);

  /**
   * Lit les fichiers choisis, sans rien déposer.
   *
   * Les lignes paraissent d'abord en lecture, puis se remplissent : sur une dizaine de
   * contrats la lecture prend quelques secondes, et un écran qui ne bouge pas pendant ce
   * temps passe pour un écran bloqué.
   */
  async function analyser(choisis: FileList | null) {
    if (!choisis || choisis.length === 0) return;
    setErreur(null);

    const arrivants: Ligne[] = Array.from(choisis).map((fichier, i) => ({
      cle: fichier.name + ":" + fichier.size + ":" + Date.now() + ":" + i,
      fichier,
      etat: "lecture",
      retenu: true,
    }));
    setLignes((avant) => [...avant, ...arrivants]);

    try {
      const formulaire = new FormData();
      formulaire.append("dossier", String(dossier));
      for (const ligne of arrivants) formulaire.append("fichiers", ligne.fichier);

      const reponse = await fetch("/api/formalites/modification/air/analyse", {
        method: "POST",
        body: formulaire,
      });
      const corps = (await reponse.json()) as { analyses?: Analyse[]; error?: string };
      if (!reponse.ok) throw new Error(corps.error ?? "La lecture a échoué");

      /*
       * Chaque réponse retrouve sa ligne par son rang, non par son nom.
       *
       * Deux fichiers peuvent porter le même nom - un accord téléchargé deux fois depuis
       * deux boîtes - et le serveur rend ses analyses dans l'ordre où il les a reçues.
       */
      const analyses = corps.analyses ?? [];
      setLignes((avant) =>
        avant.map((ligne) => {
          const rang = arrivants.findIndex((a) => a.cle === ligne.cle);
          const vu = rang >= 0 ? analyses[rang] : undefined;
          if (!vu) return ligne;
          return {
            ...ligne,
            etat: "lu",
            nature: vu.nature,
            libelle: vu.libelle,
            indices: vu.indices,
            retenu: vu.retenu,
            lu: vu.lu,
          };
        })
      );
    } catch (e) {
      console.error("[Formalist] Lecture d'accords interrompue :", e);
      setErreur(e instanceof Error ? e.message : "La lecture a échoué");
      setLignes((avant) =>
        avant.map((l) =>
          arrivants.some((a) => a.cle === l.cle) ? { ...l, etat: "echec", retenu: false } : l
        )
      );
    } finally {
      if (champFichier.current) champFichier.current.value = "";
    }
  }

  /** Le dépôt effectif : seul ce qui est coché rejoint le dossier. */
  async function valider() {
    const retenues = lignes.filter((l) => l.retenu && l.etat === "lu");
    if (retenues.length === 0) return;

    setErreur(null);
    setEnvoi(true);
    try {
      const formulaire = new FormData();
      formulaire.append("dossier", String(dossier));
      for (const ligne of retenues) formulaire.append("fichiers", ligne.fichier);
      /* La lecture voyage avec les fichiers : les relire coûterait une seconde
         extraction, et une reconnaissance de caractères pour un document numérisé. */
      formulaire.append(
        "lectures",
        JSON.stringify(retenues.map((l) => ({ nom: l.fichier.name, ...l.lu })))
      );

      const reponse = await fetch("/api/formalites/modification/air", {
        method: "POST",
        body: formulaire,
      });
      const corps = (await reponse.json()) as { air?: AccordDepose[]; error?: string };
      if (!reponse.ok) throw new Error(corps.error ?? "Le dépôt a échoué");

      surDepot(corps.air ?? []);
      surFermeture();
    } catch (e) {
      console.error("[Formalist] Dépôt d'un accord interrompu :", e);
      setErreur(e instanceof Error ? e.message : "Le dépôt a échoué");
    } finally {
      setEnvoi(false);
    }
  }

  const lues = lignes.filter((l) => l.etat === "lu");
  const retenues = lues.filter((l) => l.retenu);
  const enLecture = lignes.some((l) => l.etat === "lecture");

  return (
    <div className={styles.depotVoile} onClick={() => !envoi && surFermeture()}>
      <div
        className={styles.depotFenetre}
        role="dialog"
        aria-modal="true"
        aria-label="Déposer des accords"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.depotEntete}>
          <div>
            <p className={styles.depotTitre}>Déposer des accords</p>
            <p className={styles.depotSous}>
              Rien n&apos;entre au dossier avant que vous ne validiez.
            </p>
          </div>
          <button
            type="button"
            className={styles.depotFermer}
            aria-label="Fermer"
            onClick={surFermeture}
            disabled={envoi}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.depotCorps}>
          <input
            ref={champFichier}
            id="depot-air-fenetre"
            type="file"
            accept=".pdf"
            multiple
            className={styles.accordsFichier}
            onChange={(e) => analyser(e.target.files)}
          />
          <label htmlFor="depot-air-fenetre" className={styles.depotChoisir}>
            {lignes.length === 0 ? "Choisir des fichiers PDF" : "Ajouter d'autres fichiers"}
          </label>

          {lignes.length === 0 && (
            <p className={styles.depotVide}>
              Plusieurs à la fois. Chacun sera lu et présenté ici avant d&apos;être déposé.
            </p>
          )}

          {lignes.length > 0 && (
            <ul className={styles.depotListe}>
              {lignes.map((ligne) => (
                <li key={ligne.cle} className={styles.depotLigne}>
                  {/* Coché ou non : c'est le seul choix qui décide de ce qui entre. */}
                  {ligne.etat === "lu" ? (
                    <input
                      type="checkbox"
                      className={styles.depotCase}
                      checked={ligne.retenu}
                      disabled={envoi}
                      aria-label={"Retenir " + ligne.fichier.name}
                      onChange={(e) =>
                        setLignes((avant) =>
                          avant.map((l) =>
                            l.cle === ligne.cle ? { ...l, retenu: e.target.checked } : l
                          )
                        )
                      }
                    />
                  ) : (
                    <span className={styles.depotCaseVide} aria-hidden="true" />
                  )}

                  <div className={styles.depotInfos}>
                    <p className={styles.depotNom}>
                      {ligne.fichier.name}
                      <span className={styles.depotPoids}>{poids(ligne.fichier.size)}</span>
                    </p>

                    {ligne.etat === "lecture" && (
                      <p className={styles.depotEnCours}>
                        <span className={styles.depotRoue} aria-hidden="true" />
                        Lecture du document…
                      </p>
                    )}

                    {ligne.etat === "echec" && (
                      <p className={styles.depotVerdictMauvais}>La lecture n&apos;a pas abouti</p>
                    )}

                    {ligne.etat === "lu" && ligne.nature && (
                      <>
                        <p className={styles[TONS[ligne.nature]]}>{ligne.libelle}</p>

                        {/* Ce qu'on a tiré du contrat : c'est cela qui remplira le tableau. */}
                        {/*
                          Ce qui n'est pas un accord n'a pas de lecture à montrer.

                          « Souscripteur non lu · montant non lu · valorisation non lue »
                          sous un extrait Kbis est un bruit : le verdict a déjà tout
                          dit. Sous un accord au gabarit inconnu, la même ligne est
                          utile - elle annonce la saisie à faire.
                        */}
                        {ligne.lu &&
                          ligne.nature !== "illisible" &&
                          ligne.nature !== "hors_sujet" && (
                            <p className={styles.depotLu}>
                              {ligne.lu.investisseur ?? "Souscripteur non lu"}
                              {" · "}
                              {ligne.lu.montant
                                ? EUROS.format(ligne.lu.montant) + " €"
                                : "montant non lu"}
                              {" · "}
                              {ligne.lu.valorisation
                                ? "valorisation " + EUROS.format(ligne.lu.valorisation) + " €"
                                : "valorisation non lue"}
                              {ligne.lu.signeLe
                                ? " · signé le " + enFrancais(ligne.lu.signeLe)
                                : ""}
                            </p>
                          )}

                        {/* Le motif du verdict : sans lui, il ne se discute pas. */}
                        {ligne.indices && ligne.indices.length > 0 && (
                          <p className={styles.depotIndices}>
                            {ligne.nature === "illisible" ? "" : "Reconnu sur : "}
                            {ligne.indices.join(", ")}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    className={styles.depotRetirer}
                    aria-label={"Retirer " + ligne.fichier.name}
                    disabled={envoi}
                    onClick={() => setLignes((avant) => avant.filter((l) => l.cle !== ligne.cle))}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {erreur && (
            <p className={styles.accordsErreur} role="alert">
              {erreur}
            </p>
          )}
        </div>

        <div className={styles.depotPied}>
          <span className={styles.depotCompte}>
            {enLecture
              ? "Lecture en cours…"
              : retenues.length === 0
                ? "Aucun accord retenu"
                : retenues.length === 1
                  ? "1 accord sera ajouté au dossier"
                  : retenues.length + " accords seront ajoutés au dossier"}
          </span>

          <div className={styles.depotGestes}>
            <button
              type="button"
              className={styles.depotAnnuler}
              onClick={surFermeture}
              disabled={envoi}
            >
              Annuler
            </button>
            <button
              type="button"
              className={styles.depotValider}
              onClick={valider}
              disabled={envoi || enLecture || retenues.length === 0}
            >
              {envoi ? "Dépôt en cours…" : "Valider"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
