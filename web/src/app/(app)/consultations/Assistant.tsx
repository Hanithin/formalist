"use client";

import { useEffect, useState } from "react";
import {
  MATIERES,
  nomDeMatiere,
  nomDAvocat,
  initialesDe,
  type CleMatiere,
} from "@/domain/consultation/matieres";
import {
  DUREE_MINUTES,
  PRIX_HT_CENTIMES,
  TAUX_TVA_POURCENT,
  detailDuPrix,
  montantLisible,
} from "@/domain/consultation/offre";
import { PIECES_MAXIMUM, type PieceJointe } from "@/domain/consultation/pieces";
import { dateHeureLongue, heureCourte } from "@/lib/dates";
import { Croix, Televerser, Document, Alerte, IconeDeMatiere } from "./Icones";
import styles from "./Consultations.module.css";

export interface AvocatProposable {
  id: number;
  nom: string;
  email: string;
}

interface Journee {
  cle: string;
  libelle: string;
  creneaux: { debut: string; libelle: string }[];
}

/** Les créneaux d'un avocat, regroupés par journée comme le faisait renderCalDays. */
function grouper(creneaux: string[], maintenant: Date): Journee[] {
  const journees: Journee[] = [];
  const aujourdHui = new Date(maintenant);
  aujourdHui.setHours(0, 0, 0, 0);

  for (const iso of creneaux) {
    const debut = new Date(iso);
    const jour = new Date(debut);
    jour.setHours(0, 0, 0, 0);
    const cle = jour.toISOString().slice(0, 10);

    let journee = journees.find((j) => j.cle === cle);
    if (!journee) {
      const ecart = Math.round((jour.getTime() - aujourdHui.getTime()) / 86_400_000);
      const libelle =
        ecart === 0
          ? "Aujourd'hui"
          : ecart === 1
            ? "Demain"
            : new Intl.DateTimeFormat("fr-FR", {
                weekday: "short",
                day: "numeric",
                month: "short",
              }).format(jour);

      journee = { cle, libelle, creneaux: [] };
      journees.push(journee);
    }

    journee.creneaux.push({ debut: iso, libelle: heureCourte(debut) });
  }

  return journees;
}

const ETAPES = [1, 2, 3, 4] as const;

/**
 * L'assistant de réservation, en quatre étapes : la matière, l'avocat et le créneau,
 * la demande et ses pièces, le récapitulatif avant paiement.
 *
 * `matiereInitiale` permet d'ouvrir directement à la deuxième étape depuis les
 * raccourcis de l'écran vide : la matière est déjà choisie, la redemander serait
 * revenir en arrière.
 */
export function Assistant({
  avocats,
  matiereInitiale,
  onFermer,
}: {
  avocats: AvocatProposable[];
  matiereInitiale: CleMatiere | null;
  onFermer: () => void;
}) {
  const [etape, setEtape] = useState(matiereInitiale ? 2 : 1);
  const [matiere, setMatiere] = useState<CleMatiere | null>(matiereInitiale);
  const [avocatId, setAvocatId] = useState<number | null>(null);
  const [journees, setJournees] = useState<Journee[] | null>(null);
  const [jour, setJour] = useState<string | null>(null);
  const [creneau, setCreneau] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [pieces, setPieces] = useState<PieceJointe[]>([]);
  const [depotEnCours, setDepotEnCours] = useState(false);
  const [avis, setAvis] = useState<string | null>(null);
  const [champFautif, setChampFautif] = useState(false);
  const [envoi, setEnvoi] = useState(false);

  // L'avis disparaît de lui-même, comme le faisait showWizToast.
  useEffect(() => {
    if (!avis) return;
    const minuteur = setTimeout(() => setAvis(null), 3500);
    return () => clearTimeout(minuteur);
  }, [avis]);

  /*
   * Le changement d'avocat remet le calendrier à zéro ici, dans le geste, et non
   * dans l'effet qui charge : un effet qui écrit l'état déclenche un second rendu
   * en cascade, et les créneaux de l'avocat précédent resteraient affichés le temps
   * de ce rendu.
   */
  function choisirAvocat(id: number) {
    setAvocatId(id);
    setJournees(null);
    setJour(null);
    setCreneau(null);
  }

  useEffect(() => {
    if (avocatId === null) return;

    let abandonne = false;

    fetch("/api/consultations/creneaux?avocat=" + avocatId + "&jours=21")
      .then((r) => r.json())
      .then((donnees: { creneaux?: { debut: string }[] }) => {
        if (abandonne) return;
        const listes = grouper(
          (donnees.creneaux ?? []).map((c) => c.debut),
          new Date()
        );
        setJournees(listes);
      })
      .catch(() => {
        if (!abandonne) setJournees([]);
      });

    return () => {
      abandonne = true;
    };
  }, [avocatId]);

  const avocat = avocats.find((a) => a.id === avocatId) ?? null;
  const journeeChoisie = journees?.find((j) => j.cle === jour) ?? null;
  const prix = detailDuPrix();

  async function deposer(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;

    if (pieces.length + fichiers.length > PIECES_MAXIMUM) {
      setAvis("Vous pouvez joindre " + PIECES_MAXIMUM + " documents au plus.");
      return;
    }

    setDepotEnCours(true);
    for (const fichier of Array.from(fichiers)) {
      const corps = new FormData();
      corps.append("fichier", fichier);

      try {
        const reponse = await fetch("/api/consultations/documents", {
          method: "POST",
          body: corps,
        });
        const donnees = await reponse.json();

        if (!reponse.ok) {
          setAvis(donnees.error ?? "Ce document n'a pas pu être joint.");
          continue;
        }
        setPieces((precedentes) => [...precedentes, donnees.piece as PieceJointe]);
      } catch {
        setAvis("Ce document n'a pas pu être joint.");
      }
    }
    setDepotEnCours(false);
  }

  async function payer() {
    if (!matiere || !creneau) return;

    setEnvoi(true);
    try {
      const reponse = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avocat: avocatId,
          debut: creneau,
          matiere,
          description,
          pieces,
        }),
      });
      const donnees = await reponse.json();

      if (!reponse.ok || !donnees.paiement) {
        setAvis(donnees.error ?? "La réservation n'a pas abouti.");
        setEnvoi(false);
        return;
      }

      // Le navigateur quitte l'application pour la page de paiement : on ne rend
      // pas la main à l'assistant, il n'y a plus rien à y faire.
      window.location.assign(donnees.paiement as string);
    } catch {
      setAvis("La réservation n'a pas abouti.");
      setEnvoi(false);
    }
  }

  function suivant() {
    if (etape === 1 && !matiere) {
      setAvis("Choisissez une matière juridique pour continuer.");
      return;
    }
    if (etape === 2 && !creneau) {
      setAvis("Choisissez un avocat et un créneau pour continuer.");
      return;
    }
    if (etape === 3 && description.trim().length < 10) {
      setAvis("Décrivez votre besoin en quelques mots (minimum 10 caractères).");
      setChampFautif(true);
      setTimeout(() => setChampFautif(false), 2500);
      return;
    }
    if (etape === 4) {
      void payer();
      return;
    }
    setEtape(etape + 1);
  }

  return (
    <div
      className={styles.voileAssistant}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className={styles.assistant}
        role="dialog"
        aria-modal="true"
        aria-label="Prendre rendez-vous"
      >
        <div className={styles.aTete}>
          <h2>Prendre rendez-vous</h2>
          <button type="button" className={styles.aFermer} onClick={onFermer} aria-label="Fermer">
            <Croix />
          </button>
        </div>

        <div className={styles.aProgres}>
          {ETAPES.map((n) => (
            <div
              key={n}
              className={
                styles.aEtape +
                (n < etape ? " " + styles.aEtapeFaite : "") +
                (n === etape ? " " + styles.aEtapeActive : "")
              }
            />
          ))}
        </div>

        <div className={styles.aCorps}>
          {etape === 1 && (
            <>
              <p className={styles.aTitre}>Choisissez votre matière</p>
              <p className={styles.aSous}>
                Sélectionnez le domaine juridique de votre consultation.
              </p>
              <div className={styles.matiereGrille}>
                {MATIERES.map((m) => (
                  <button
                    type="button"
                    key={m.cle}
                    className={
                      styles.matiereCarte + (matiere === m.cle ? " " + styles.matiereChoisie : "")
                    }
                    onClick={() => setMatiere(m.cle)}
                    aria-pressed={matiere === m.cle}
                  >
                    <span className={styles.matiereIc}>
                      <IconeDeMatiere matiere={m.cle} />
                    </span>
                    <span className={styles.matiereNom}>{m.nom}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {etape === 2 && (
            <>
              <p className={styles.aTitre}>Avocat et créneau</p>
              <p className={styles.aSous}>Choisissez un avocat puis un créneau disponible.</p>

              <div className={styles.avocatListe}>
                {avocats.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    className={
                      styles.avocatPastille + (avocatId === a.id ? " " + styles.avocatChoisi : "")
                    }
                    onClick={() => choisirAvocat(a.id)}
                    aria-pressed={avocatId === a.id}
                  >
                    <span className={styles.av}>{initialesDe(a.nom)}</span>
                    <span>
                      <span className={styles.avNom}>{nomDAvocat(a.nom)}</span>
                      <span className={styles.avEmail}>{a.email}</span>
                    </span>
                  </button>
                ))}
              </div>

              {avocatId !== null && (
                <div className={styles.calWrap}>
                  <div className={styles.calJours}>
                    {journees === null && <div className={styles.calVide}>Chargement…</div>}
                    {journees !== null && journees.length === 0 && (
                      <div className={styles.calVide}>
                        Aucune disponibilité dans les 3 prochaines semaines.
                      </div>
                    )}
                    {journees?.map((j) => (
                      <button
                        type="button"
                        key={j.cle}
                        className={
                          styles.calJour + (jour === j.cle ? " " + styles.calJourChoisi : "")
                        }
                        onClick={() => {
                          setJour(j.cle);
                          setCreneau(null);
                        }}
                        aria-pressed={jour === j.cle}
                      >
                        <span className={styles.dNom}>{j.libelle}</span>
                        <span className={styles.dCompte}>
                          {j.creneaux.length} créneau{j.creneaux.length > 1 ? "x" : ""}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className={styles.calCreneaux}>
                    {!journeeChoisie && journees !== null && journees.length > 0 && (
                      <div className={styles.calVide}>
                        Choisissez une date pour voir les horaires.
                      </div>
                    )}
                    {journeeChoisie?.creneaux.map((c) => (
                      <button
                        type="button"
                        key={c.debut}
                        className={
                          styles.calCreneau +
                          (creneau === c.debut ? " " + styles.calCreneauChoisi : "")
                        }
                        onClick={() => setCreneau(c.debut)}
                        aria-pressed={creneau === c.debut}
                      >
                        {c.libelle}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {etape === 3 && (
            <>
              <p className={styles.aTitre}>Décrivez votre besoin</p>
              <p className={styles.aSous}>
                Plus c&apos;est précis, plus l&apos;avocat pourra préparer la consultation.
              </p>

              <label className={styles.champLabel} htmlFor="description">
                Sujet de la consultation
              </label>
              <textarea
                id="description"
                className={styles.champTexte + (champFautif ? " " + styles.champErreur : "")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex : création d'une SAS pour mon activité de conseil. J'ai 2 associés et je m'interroge sur le pacte d'associés et la répartition des parts…"
              />

              <div className={styles.blocPieces}>
                <span className={styles.champLabel}>Documents (facultatif)</span>
                <label className={styles.depot} htmlFor="pieces">
                  <Televerser />
                  <span className={styles.depotT}>
                    {depotEnCours ? "Dépôt en cours…" : "Déposer des documents"}
                  </span>
                  <span className={styles.depotS}>
                    PDF, images, Word. 10 Mo par fichier au plus.
                  </span>
                </label>
                <input
                  id="pieces"
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    void deposer(e.target.files);
                    e.target.value = "";
                  }}
                />

                {pieces.length > 0 && (
                  <div className={styles.depots}>
                    {pieces.map((piece) => (
                      <div className={styles.depotFichier} key={piece.fichier}>
                        <Document taille={14} />
                        <span className={styles.dfNom}>{piece.nom}</span>
                        <button
                          type="button"
                          className={styles.dfRetirer}
                          onClick={() =>
                            setPieces(pieces.filter((p) => p.fichier !== piece.fichier))
                          }
                          aria-label={"Retirer " + piece.nom}
                        >
                          <Croix taille={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {etape === 4 && (
            <>
              <p className={styles.aTitre}>Récapitulatif</p>
              <p className={styles.aSous}>Vérifiez les détails avant de confirmer le paiement.</p>

              <div className={styles.recap}>
                <div className={styles.recapLigne}>
                  <span className={styles.k}>Matière</span>
                  <span className={styles.v}>{matiere ? nomDeMatiere(matiere) : "-"}</span>
                </div>
                <div className={styles.recapLigne}>
                  <span className={styles.k}>Avocat</span>
                  <span className={styles.v}>{nomDAvocat(avocat?.nom)}</span>
                </div>
                <div className={styles.recapLigne}>
                  <span className={styles.k}>Date et heure</span>
                  <span className={styles.v}>
                    {creneau ? dateHeureLongue(new Date(creneau)) : "-"}
                  </span>
                </div>
                <div className={styles.recapLigne}>
                  <span className={styles.k}>Durée</span>
                  <span className={styles.v}>{DUREE_MINUTES} minutes</span>
                </div>
                <div className={styles.recapLigne}>
                  <span className={styles.k}>Documents joints</span>
                  <span className={styles.v}>
                    {pieces.length > 0 ? pieces.length + " fichier(s)" : "Aucun"}
                  </span>
                </div>
                <div className={styles.recapLigne}>
                  <span className={styles.k}>Consultation</span>
                  <span className={styles.v}>{montantLisible(PRIX_HT_CENTIMES)} HT</span>
                </div>
                <div className={styles.recapLigne}>
                  <span className={styles.k}>TVA {TAUX_TVA_POURCENT} %</span>
                  <span className={styles.v}>{montantLisible(prix.tva)}</span>
                </div>
              </div>

              <div className={styles.recapTotal}>
                <span className={styles.recapLab}>Total à payer</span>
                <span className={styles.recapVal}>{montantLisible(prix.ttc)}</span>
              </div>

              <p className={styles.recapMention}>
                Paiement sécurisé par Stripe. Vous êtes intégralement remboursé en cas
                d&apos;absence de l&apos;avocat.
              </p>
            </>
          )}
        </div>

        <div className={styles.aPied}>
          <button
            type="button"
            className={styles.aBtn + " " + styles.aBtnPrec}
            onClick={() => setEtape(etape - 1)}
            disabled={etape === 1 || envoi}
          >
            ← Retour
          </button>
          <button
            type="button"
            className={styles.aBtn + " " + (etape === 4 ? styles.aBtnPayer : styles.aBtnSuiv)}
            onClick={suivant}
            disabled={envoi}
          >
            {etape === 4
              ? envoi
                ? "Ouverture du paiement…"
                : "Payer " + montantLisible(prix.ttc) + " et confirmer"
              : "Continuer →"}
          </button>
        </div>
      </div>

      {avis && (
        <div className={styles.aAvis} role="status">
          <Alerte />
          <span>{avis}</span>
        </div>
      )}
    </div>
  );
}
