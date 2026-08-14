"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ONGLETS,
  MATIERES_COURANTES,
  nomDeMatiere,
  nomDAvocat,
  dansLOnglet,
  comptesParOnglet,
  delaiAvant,
  type Onglet,
  type CleMatiere,
} from "@/domain/consultation/matieres";
import {
  DUREE_MINUTES,
  DELAI_REPONSE,
  PRIX_HT_CENTIMES,
  montantLisible,
} from "@/domain/consultation/offre";
import { DELAI_REMBOURSEMENT_HEURES } from "@/domain/consultation/paiement";
import { libelleEtat, libelleEtatDetaille, type EtatAffiche } from "@/domain/consultation/creneaux";
import { dateHeureLongue } from "@/lib/dates";
import { Calendrier, Horloge, Personne, Euro, Camera, Document, Croix, Chevron } from "./Icones";
import { Assistant, type AvocatProposable } from "./Assistant";
import styles from "./Consultations.module.css";

export interface ConsultationAffichee {
  id: number;
  debut: string;
  dureeMinutes: number;
  matiere: string | null;
  description: string | null;
  pieces: { fichier: string; nom: string }[];
  avocat: string;
  lienVisio: string | null;
  compteRendu: string | null;
  prixHtCentimes: number;
  etat: "demandee" | "confirmee" | "faite" | "annulee";
  etatAffiche: EtatAffiche;
  annulable: boolean;
  remboursementAutomatique: boolean;
}

const BADGES: Record<EtatAffiche, string> = {
  attente: styles.badgeAttente,
  confirmee: styles.badgeConfirmee,
  faite: styles.badgeFaite,
  annulee: styles.badgeAnnulee,
};

/** Ce que le retour de paiement a laissé dans l'adresse. */
const AVIS: Record<string, { ton: string; texte: string }> = {
  regle: {
    ton: styles.avisRegle,
    texte:
      "Paiement reçu. Votre demande est transmise à l'avocat : il confirme le créneau et vous envoie le lien de visio par email.",
  },
  attente: {
    ton: styles.avisAttente,
    texte:
      "Le paiement n'est pas encore confirmé par la banque. Votre créneau est retenu ; la page se mettra à jour dès la confirmation.",
  },
  abandonne: {
    ton: styles.avisAttente,
    texte: "Paiement abandonné : le créneau a été rendu. Vous pouvez reprendre quand vous voulez.",
  },
};

export function Consultations({
  consultations,
  avocats,
  paiement,
}: {
  consultations: ConsultationAffichee[];
  avocats: AvocatProposable[];
  paiement: string | null;
}) {
  const router = useRouter();
  const [onglet, setOnglet] = useState<Onglet>("toutes");
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [assistant, setAssistant] = useState<{ matiere: CleMatiere | null } | null>(null);
  const [avis, setAvis] = useState(paiement);
  const [confirmeAnnulation, setConfirmeAnnulation] = useState(false);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);

  const rangees = consultations.map((c) => ({ etat: c.etat, debut: new Date(c.debut) }));
  const comptes = comptesParOnglet(rangees);

  const affichees = consultations.filter((c, i) => dansLOnglet(rangees[i], onglet));

  // Le prochain rendez-vous : le plus proche qui n'a pas encore eu lieu.
  const aVenir = consultations
    .filter((c) => c.etat !== "annulee" && c.etat !== "faite" && new Date(c.debut) > new Date())
    .sort((a, b) => new Date(a.debut).getTime() - new Date(b.debut).getTime());
  const prochain = aVenir[0] ?? null;

  const detail = consultations.find((c) => c.id === ouverte) ?? null;

  function fermerPanneau() {
    setOuverte(null);
    setConfirmeAnnulation(false);
  }

  async function annuler(id: number) {
    setAnnulationEnCours(true);
    try {
      const reponse = await fetch("/api/consultations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultation: id }),
      });
      if (reponse.ok) {
        fermerPanneau();
        router.refresh();
      }
    } finally {
      setAnnulationEnCours(false);
    }
  }

  const avisMontre = avis ? AVIS[avis] : undefined;

  return (
    <>
      <div className={styles.content}>
        {avisMontre && (
          <div className={styles.avis + " " + avisMontre.ton} role="status">
            <span className={styles.avisPoint} />
            <span className={styles.avisTexte}>{avisMontre.texte}</span>
            <button
              type="button"
              className={styles.avisFermer}
              onClick={() => setAvis(null)}
              aria-label="Fermer cet avis"
            >
              <Croix taille={16} />
            </button>
          </div>
        )}

        {/*
          Le bandeau remplace la carte d'appel dès qu'un rendez-vous est pris : ce
          qu'on vient chercher n'est plus « comment réserver » mais « c'est quand ».
        */}
        {prochain ? (
          <div className={styles.nextBanner}>
            <span className={styles.nbIc}>
              <Calendrier />
            </span>
            <div className={styles.nbBody}>
              <span className={styles.nbTag + (prochain.lienVisio ? " " + styles.nbTagLive : "")}>
                {prochain.lienVisio ? (
                  <>
                    <span className={styles.pulse} />
                    Prochain rendez-vous
                  </>
                ) : (
                  "En attente de confirmation"
                )}
              </span>
              <span className={styles.nbTitle}>
                {nomDeMatiere(prochain.matiere)} avec {nomDAvocat(prochain.avocat)}
              </span>
              <span className={styles.nbMeta}>
                {dateHeureLongue(new Date(prochain.debut))} · {delaiAvant(new Date(prochain.debut))}
              </span>
            </div>
            <div className={styles.nbActions}>
              {prochain.lienVisio ? (
                <a
                  className={styles.nbJoin}
                  href={prochain.lienVisio}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <Camera />
                  Rejoindre la visio
                </a>
              ) : (
                <span className={styles.nbLinkWait}>Lien envoyé après confirmation</span>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.heroCard}>
            <div>
              <h2>Réservez une consultation</h2>
              <p>
                Choisissez la matière, l&apos;avocat et le créneau qui vous arrange. L&apos;avocat
                confirme et vous envoie le lien de visio.
              </p>
              {/* Ce qu'on veut savoir avant de cliquer : prix, durée, délai. */}
              <ul className={styles.hFacts}>
                <li>
                  <strong>{montantLisible(PRIX_HT_CENTIMES)} HT</strong> par consultation
                </li>
                <li>
                  <strong>{DUREE_MINUTES} minutes</strong> en visio
                </li>
                <li>
                  Réponse de l&apos;avocat sous <strong>{DELAI_REPONSE}</strong>
                </li>
              </ul>
            </div>
            {/*
              Sans avocat ayant publié ses disponibilités, l'assistant n'aurait aucun
              créneau à proposer : le bouton mènerait à une impasse. On donne alors
              une sortie plutôt qu'un geste inutile.
            */}
            {avocats.length > 0 ? (
              <button
                type="button"
                className={styles.hCta}
                onClick={() => setAssistant({ matiere: null })}
              >
                Prendre rendez-vous
              </button>
            ) : (
              <Link className={styles.hCta} href="/messagerie">
                Écrire au support
              </Link>
            )}
          </div>
        )}

        <div className={styles.section}>
          <h2 className={styles.sectionTitre}>
            Mes consultations
            {consultations.length > 0 && (
              <span className={styles.ct}>· {consultations.length} au total</span>
            )}
          </h2>

          <div className={styles.tabs}>
            {ONGLETS.map((o) => (
              <button
                type="button"
                key={o.valeur}
                className={styles.tab + (onglet === o.valeur ? " " + styles.tabActif : "")}
                onClick={() => setOnglet(o.valeur)}
                aria-pressed={onglet === o.valeur}
              >
                {o.libelle}
                <span className={styles.compte}>{comptes[o.valeur]}</span>
              </button>
            ))}
          </div>

          {affichees.length === 0 && consultations.length === 0 && (
            <div className={styles.vide}>
              <div className={styles.videIc}>
                <Calendrier trait="1.6" />
              </div>
              <span className={styles.videT}>Aucune consultation pour le moment</span>
              <span className={styles.videS}>
                {avocats.length > 0
                  ? "Sur quoi avez-vous besoin d'un avocat ?"
                  : "Les avocats n'ont pas encore publié leurs disponibilités. Écrivez-nous : nous vous proposerons un rendez-vous par un autre moyen."}
              </span>
              {/*
                Plutôt qu'un message seul : les matières les plus demandées, qui
                ouvrent l'assistant avec le sujet déjà choisi.
              */}
              <div className={styles.videMatieres} hidden={avocats.length === 0}>
                {MATIERES_COURANTES.map((cle) => (
                  <button
                    type="button"
                    key={cle}
                    className={styles.videMatiere}
                    onClick={() => setAssistant({ matiere: cle })}
                  >
                    {nomDeMatiere(cle)}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.videMatiere + " " + styles.videMatiereAutre}
                  onClick={() => setAssistant({ matiere: null })}
                >
                  Autre sujet
                </button>
              </div>
            </div>
          )}

          {affichees.length === 0 && consultations.length > 0 && (
            <div className={styles.videCategorie}>Aucune consultation dans cette catégorie</div>
          )}

          {affichees.length > 0 && (
            <div className={styles.liste}>
              {affichees.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={
                    styles.carte +
                    (c.etat === "faite" ? " " + styles.carteFaite : "") +
                    (c.etat === "annulee" ? " " + styles.carteAnnulee : "")
                  }
                  onClick={() => setOuverte(c.id)}
                >
                  <span className={styles.ic}>
                    <Horloge />
                  </span>
                  <span className={styles.corps}>
                    <span className={styles.ligneTitre}>
                      <span className={styles.titre}>{nomDeMatiere(c.matiere)}</span>
                      <span className={styles.puce}>{c.dureeMinutes} min</span>
                    </span>
                    <span className={styles.sous}>
                      <span className={styles.avecIcone}>
                        <Personne />
                        {nomDAvocat(c.avocat)}
                      </span>
                      <span className={styles.avecIcone}>
                        <Calendrier trait="2" />
                        {dateHeureLongue(new Date(c.debut))}
                        {c.etat !== "faite" && c.etat !== "annulee"
                          ? " · " + delaiAvant(new Date(c.debut))
                          : ""}
                      </span>
                    </span>
                  </span>
                  <span className={styles.droite}>
                    <span className={styles.badge + " " + BADGES[c.etatAffiche]}>
                      {libelleEtat(c.etatAffiche)}
                    </span>
                    {c.etatAffiche === "confirmee" && c.lienVisio && (
                      <a
                        className={styles.boutonRejoindre}
                        href={c.lienVisio}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Camera />
                        Rejoindre
                      </a>
                    )}
                    <span className={styles.chevron}>
                      <Chevron />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {detail && (
        <>
          <div className={styles.voile} onClick={fermerPanneau} />
          <div
            className={styles.panneau}
            role="dialog"
            aria-modal="true"
            aria-label="Détail de la consultation"
          >
            <div className={styles.pTete}>
              <h2>Détail de la consultation</h2>
              <button
                type="button"
                className={styles.pFermer}
                onClick={fermerPanneau}
                aria-label="Fermer"
              >
                <Croix />
              </button>
            </div>

            <div className={styles.pCorps}>
              <div className={styles.pHero}>
                <span className={styles.pHeroPuce}>{nomDeMatiere(detail.matiere)}</span>
                <h3>Consultation juridique</h3>
                <span className={styles.pAvec}>Avec {nomDAvocat(detail.avocat)}</span>
                <div className={styles.pEtat}>
                  <span className={styles.badge + " " + BADGES[detail.etatAffiche]}>
                    {libelleEtatDetaille(detail.etatAffiche)}
                  </span>
                </div>
              </div>

              <div className={styles.pSection}>
                <div className={styles.pSectionTitre}>Informations</div>
                <div className={styles.pMetaCarte}>
                  <div className={styles.pMetaLigne}>
                    <span className={styles.k}>
                      <Calendrier trait="2" />
                      Date et heure
                    </span>
                    <span className={styles.v}>{dateHeureLongue(new Date(detail.debut))}</span>
                  </div>
                  <div className={styles.pMetaLigne}>
                    <span className={styles.k}>
                      <Horloge trait="2" />
                      Durée
                    </span>
                    <span className={styles.v}>{detail.dureeMinutes} minutes</span>
                  </div>
                  <div className={styles.pMetaLigne}>
                    <span className={styles.k}>
                      <Personne />
                      Avocat
                    </span>
                    <span className={styles.v}>{nomDAvocat(detail.avocat)}</span>
                  </div>
                  <div className={styles.pMetaLigne}>
                    <span className={styles.k}>
                      <Euro />
                      Prix
                    </span>
                    <span className={styles.v}>{montantLisible(detail.prixHtCentimes)} HT</span>
                  </div>
                </div>
              </div>

              {detail.description && (
                <div className={styles.pSection}>
                  <div className={styles.pSectionTitre}>Votre demande</div>
                  <div className={styles.pDesc}>{detail.description}</div>
                </div>
              )}

              {detail.pieces.length > 0 && (
                <div className={styles.pSection}>
                  <div className={styles.pSectionTitre}>
                    Documents partagés ({detail.pieces.length})
                  </div>
                  <div className={styles.pDocs}>
                    {detail.pieces.map((piece) => (
                      <a
                        className={styles.pDoc}
                        key={piece.fichier}
                        href={
                          "/api/fichier?nom=" +
                          encodeURIComponent(piece.fichier) +
                          "&titre=" +
                          encodeURIComponent(piece.nom)
                        }
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <span className={styles.docIc}>
                          <Document />
                        </span>
                        <span className={styles.docNom}>{piece.nom}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {detail.compteRendu && (
                <div className={styles.pSection}>
                  <div className={styles.pSectionTitre}>Compte-rendu de l&apos;avocat</div>
                  <div className={styles.pDesc}>{detail.compteRendu}</div>
                </div>
              )}

              {/*
                Le panneau se terminait sur un grand vide : on y met ce qu'on se
                demande à ce moment-là, comment ça va se passer et jusqu'à quand
                annuler.
              */}
              {detail.etat !== "faite" && detail.etat !== "annulee" && (
                <div className={styles.pAide}>
                  <div className={styles.pAideTitre}>Comment ça se passe</div>
                  <ol className={styles.pEtapes}>
                    <li>
                      {detail.lienVisio ? (
                        <>
                          Le lien de visio est prêt : cliquez sur{" "}
                          <strong>Rejoindre la visio</strong> le jour du rendez-vous.
                        </>
                      ) : (
                        <>
                          L&apos;avocat confirme le créneau et vous envoie le lien de visio par
                          email.
                        </>
                      )}
                    </li>
                    <li>
                      Préparez vos questions et les documents utiles, la consultation dure{" "}
                      {detail.dureeMinutes} minutes.
                    </li>
                    <li>
                      Un empêchement ? Annulez jusqu&apos;à {DELAI_REMBOURSEMENT_HEURES} h avant, la
                      consultation vous est remboursée.
                    </li>
                  </ol>
                  <Link className={styles.pAideLien} href="/messagerie">
                    Une question avant le rendez-vous ? Écrivez-nous
                  </Link>
                </div>
              )}
            </div>

            {/*
              La confirmation d'annulation se fait dans le panneau : une fenêtre du
              navigateur ne peut rien dire du remboursement, alors que c'est la
              question qu'on se pose à ce moment-là.
            */}
            {detail.annulable && !confirmeAnnulation && (
              <div className={styles.pActions}>
                {detail.lienVisio && (
                  <a
                    className={styles.pBtn + " " + styles.pBtnRejoindre}
                    href={detail.lienVisio}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Camera taille={16} />
                    Rejoindre la visio
                  </a>
                )}
                <button
                  type="button"
                  className={styles.pBtn + " " + styles.pBtnAnnuler}
                  onClick={() => setConfirmeAnnulation(true)}
                >
                  Annuler {detail.lienVisio ? "" : "la consultation"}
                </button>
              </div>
            )}

            {detail.annulable && confirmeAnnulation && (
              <div className={styles.pConfirmation}>
                <p className={styles.pConfirmationTexte}>
                  {detail.remboursementAutomatique
                    ? "Annuler cette consultation ? Le rendez-vous étant à plus de " +
                      DELAI_REMBOURSEMENT_HEURES +
                      " h, vous êtes remboursé automatiquement."
                    : "Annuler cette consultation ? Le rendez-vous étant à moins de " +
                      DELAI_REMBOURSEMENT_HEURES +
                      " h, elle n'est pas remboursée automatiquement : écrivez-nous si vous pensez que votre situation le justifie."}
                </p>
                <div className={styles.pConfirmationActions}>
                  <button
                    type="button"
                    className={styles.pBtn + " " + styles.pBtnGarder}
                    onClick={() => setConfirmeAnnulation(false)}
                    disabled={annulationEnCours}
                  >
                    Garder le rendez-vous
                  </button>
                  <button
                    type="button"
                    className={styles.pBtn + " " + styles.pBtnAnnuler}
                    onClick={() => void annuler(detail.id)}
                    disabled={annulationEnCours}
                  >
                    {annulationEnCours ? "Annulation…" : "Confirmer l'annulation"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {assistant && (
        <Assistant
          avocats={avocats}
          matiereInitiale={assistant.matiere}
          onFermer={() => setAssistant(null)}
        />
      )}
    </>
  );
}
