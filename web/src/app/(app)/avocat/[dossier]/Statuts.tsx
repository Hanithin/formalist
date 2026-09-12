"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formaterDate } from "@/lib/dates";
import { DepotFichier } from "@/components/formulaire/DepotFichier";
import { natureLisible } from "@/domain/modification/actes";
import { Editeur } from "@/app/(app)/modification/Editeur";
import type { Introuvable, Retouche, Zone } from "@/domain/modification/edition";
import { nonConfirmes, suivreLesChangements } from "@/domain/modification/suivi";
import { phraseDesPagesEcartees } from "@/domain/modification/edition";
import { phraseDAttente, type Progression } from "@/domain/modification/lecture";
import type { EtapeDHistorique } from "@/domain/modification/historique";
import styles from "../Avocat.module.css";

/**
 * La mise à jour des statuts, guidée.
 *
 * L'avocat doit savoir tout ce qu'il a à remplacer, y compris ce que le repérage
 * automatique n'a pas su trouver. La première version ne rendait que les passages
 * localisés : on croyait avoir tout couvert, et un article restait à l'ancienne valeur
 * dans un document qui part au greffe.
 *
 * D'où la liste en tête : une ligne par remplacement attendu, avec son état. Celles
 * qui sont « à placer » se posent à la main, sur la page.
 */

interface Lecture {
  pages: { numero: number; largeur: number; hauteur: number }[];
  pagesRetirees: number[];
  verifiees: string[];
  historique: EtapeDHistorique[];
  positionHistorique: number;
  zones: Zone[];
  introuvables: Introuvable[];
  retouches: Retouche[];
  reconnus: boolean;
}

export function Statuts({
  dossier,
  denomination,
}: {
  dossier: number;
  /**
   * La dénomination de la société, pour lire les actes du registre.
   *
   * Le greffe publie le nom du fichier du déposant, où la dénomination figure presque
   * toujours : la retirer de l'intitulé laisse ce qui distingue un acte d'un autre.
   */
  denomination?: string | null;
}) {
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [retouches, setRetouches] = useState<Retouche[]>([]);
  const [pagesRetirees, setPagesRetirees] = useState<number[]>([]);
  const [verifiees, setVerifiees] = useState<string[]>([]);
  const [historique, setHistorique] = useState<EtapeDHistorique[]>([]);
  const [position, setPosition] = useState(-1);
  /*
   * L'empreinte du document affiché.
   *
   * Les pages sont servies par une adresse qui ne dépend que du dossier et du numéro de
   * page, avec cinq minutes de cache : remplacer les statuts ne changeait rien à
   * l'écran. L'empreinte suit le fichier, et l'adresse change avec elle.
   */
  const [empreinte, setEmpreinte] = useState<string | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [retour, setRetour] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  /* Remplacer les statuts en vigueur efface les retouches : on le demande avant. */
  const [remplacement, setRemplacement] = useState(false);
  /*
   * Où en est la lecture, et si les statuts sont seulement là.
   *
   * L'écran n'avait qu'un refus pour trois situations : les statuts manquent, la
   * lecture a échoué, la lecture n'est pas finie. Il ouvrait le champ de dépôt dans les
   * trois - et proposait donc de redéposer un document déjà au dossier.
   */
  const [attente, setAttente] = useState<Progression | null>(null);
  const [manquants, setManquants] = useState(false);
  /* Le refus d'un dépôt, distinct de celui qui dit que les statuts manquent : le second
     est l'état de départ, et l'écran le dit sans alarme. */
  const [refusDuDepot, setRefusDuDepot] = useState<string | null>(null);
  /* Relancer la lecture, c'est rejouer l'effet : ce compteur en est la clé. */
  const [essai, setEssai] = useState(0);
  /*
   * Les actes que le registre national tient de cette société.
   *
   * La route existait, seul le parcours du client l'appelait : l'avocat n'avait pas de
   * chemin vers elle, et devait redemander au client un document déjà public. La liste
   * n'est chargée qu'à l'ouverture du panneau - c'est un appel à l'INPI.
   */
  const [actes, setActes] = useState<{ id: string; nature: string; deposeLe: string | null }[]>([]);
  const [registre, setRegistre] = useState<"attente" | "prêt" | "indisponible">("attente");
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  /** Recharge la lecture après un dépôt : le document vient de changer. */
  function relire() {
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/retouches?dossier=" + dossier);
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(corps.error ?? "Les statuts n'ont pas pu être lus");
        return;
      }
      setRefus(null);
      setLecture(corps as Lecture);
      setRetouches(corps.retouches ?? []);
      setPagesRetirees(corps.pagesRetirees ?? []);
      setVerifiees(corps.verifiees ?? []);
      setHistorique(corps.historique ?? []);
      setPosition(corps.positionHistorique ?? -1);
      /* L'empreinte change avec le document : c'est elle qui périme l'image des pages. */
      setEmpreinte(corps.empreinte ?? null);
    });
  }

  /**
   * Le dépôt des statuts par le cabinet.
   *
   * Une fois le dossier réglé, le client est renvoyé vers ses formalités : il ne peut
   * plus rien y déposer. Sans ce bouton, un dossier arrivé sans statuts restait
   * bloqué - ni le client ni l'avocat ne pouvaient les mettre au dossier, et l'écran
   * se contentait de dire qu'ils manquaient.
   */
  function deposer(fichier: File) {
    setRefus(null);
    setRefusDuDepot(null);
    demarrer(async () => {
      const corps = new FormData();
      corps.append("dossier", String(dossier));
      corps.append("fichier", fichier);

      const reponse = await fetch("/api/formalites/modification/statuts/depot", {
        method: "POST",
        body: corps,
      });
      const retour = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefusDuDepot(retour.error ?? "Le dépôt a été refusé");
        return;
      }
      setRetour("Statuts reçus. Les passages à remplacer sont repérés ci-dessous.");
      relire();
      router.refresh();
    });
  }

  /* Les actes du registre, cherchés à l'ouverture du panneau et pas avant. */
  useEffect(() => {
    if (!remplacement) return;

    let vivant = true;
    (async () => {
      setRegistre("attente");
      try {
        const reponse = await fetch("/api/formalites/modification/statuts?dossier=" + dossier);
        const corps = await reponse.json().catch(() => ({}));
        if (!vivant) return;
        if (!reponse.ok) {
          setRegistre("indisponible");
          return;
        }
        setActes(corps.actes ?? []);
        setRegistre("prêt");
      } catch {
        if (vivant) setRegistre("indisponible");
      }
    })();

    return () => {
      vivant = false;
    };
  }, [remplacement, dossier]);

  /**
   * Reprendre les statuts au registre national.
   *
   * Le serveur revérifie l'identifiant auprès de l'INPI avant de télécharger : accepter
   * celui du navigateur ferait de la route un relais vers n'importe quel acte.
   */
  function reprendreAuRegistre(acte: string) {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/statuts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, acte }),
      });
      const retour = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(retour.error ?? "La reprise au registre a été refusée");
        return;
      }
      setRemplacement(false);
      setRetour("Statuts repris au registre. Les passages à remplacer sont repérés ci-dessous.");
      relire();
      router.refresh();
    });
  }

  /*
   * La lecture se demande, puis se suit.
   *
   * La route répond 202 tant que la reconnaissance de caractères tourne : on redemande
   * toutes les deux secondes, en affichant l'avancement qu'elle rend. Rien n'attend
   * plus dans une requête, et une lecture de trois minutes ne ressemble plus à une
   * panne.
   */
  useEffect(() => {
    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout> | undefined;

    async function demander() {
      try {
        const reponse = await fetch("/api/formalites/modification/retouches?dossier=" + dossier);
        const corps = await reponse.json().catch(() => ({}));
        if (!vivant) return;

        if (reponse.status === 202) {
          setAttente(corps.progression ?? null);
          minuteur = setTimeout(demander, 2000);
          return;
        }

        if (!reponse.ok) {
          setManquants(corps.etat === "absents");
          setRefus(corps.error ?? "Les statuts n'ont pas pu être lus");
          return;
        }

        setAttente(null);
        setRefus(null);
        setLecture(corps as Lecture);
        setRetouches(corps.retouches ?? []);
        setPagesRetirees(corps.pagesRetirees ?? []);
        setVerifiees(corps.verifiees ?? []);
        setHistorique(corps.historique ?? []);
        setPosition(corps.positionHistorique ?? -1);
        /* L'empreinte change avec le document : c'est elle qui périme l'image des pages. */
        setEmpreinte(corps.empreinte ?? null);
      } catch {
        if (vivant) setRefus("Les statuts n'ont pas pu être lus");
      }
    }

    demander();

    return () => {
      vivant = false;
      if (minuteur) clearTimeout(minuteur);
    };
  }, [dossier, essai]);

  /**
   * Pose un cadre pour ce que le repérage n'a pas trouvé.
   *
   * Sous l'article quand on a su le localiser - c'est là que la valeur se trouve, même
   * écrite autrement - au milieu de la page sinon.
   */
  function placer(manque: Introuvable) {
    const page = manque.article
      ? lecture?.pages.find((p) => p.numero === manque.article!.page)
      : lecture?.pages[0];
    if (!page) return;

    const sousLArticle = manque.article;
    const taille = sousLArticle ? Math.round(sousLArticle.hauteur * 8) / 10 : 11;

    /*
     * Un cadre à la mesure de son texte, non de la page.
     *
     * La moitié de la largeur pour « 99 années » couvrait la ligne entière et une
     * partie de la clause voisine : on croyait le cadre mal posé, et il fallait le
     * rétrécir avant même de pouvoir juger. La largeur suit donc le texte proposé,
     * avec une marge pour ce qu'on y ajoutera, et la hauteur laisse respirer la ligne.
     */
    const largeur = Math.min(
      page.largeur * 0.5,
      Math.max(90, manque.recherche.propose.length * taille * 0.58 + 16)
    );
    /*
     * De quoi écrire à l'aise, sans mordre sur la ligne voisine.
     *
     * La hauteur vient de la ligne mesurée dans l'acte : la doubler couvrirait la
     * clause du dessus d'un rectangle blanc, dans un document qui part au greffe.
     */
    const hauteur = Math.max(22, Math.round(taille * 1.8));

    setRetouches((precedentes) => [
      ...precedentes,
      {
        cle: manque.recherche.cle,
        page: page.numero,
        x: sousLArticle ? sousLArticle.x : page.largeur * 0.15,
        y: sousLArticle
          ? Math.min(page.hauteur - hauteur, sousLArticle.y + sousLArticle.hauteur * 1.6)
          : page.hauteur * 0.45,
        largeur,
        hauteur,
        texte: manque.recherche.propose,
        taille,
      },
    ]);
  }

  /**
   * Recueille l'historique que l'enregistrement vient d'inscrire.
   *
   * Il est stable d'un rendu à l'autre : passé à l'éditeur, une fonction recréée à
   * chaque rendu relancerait l'enregistrement en boucle.
   */
  const inscrire = useCallback((suite: EtapeDHistorique[], rang: number) => {
    setHistorique(suite);
    setPosition(rang);
  }, []);

  /**
   * Revient à une étape de l'historique.
   *
   * C'est le serveur qui pose l'état, non l'écran : il détient l'historique, et une
   * position venue du navigateur se vérifie avant d'être suivie.
   */
  function reprendre(demandee: number) {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/retouches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, position: demandee }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "L'étape n'a pas pu être reprise");
        return;
      }

      setRetouches(corps.retouches ?? []);
      setPagesRetirees(corps.pagesRetirees ?? []);
      setVerifiees(corps.verifiees ?? []);
      setPosition(corps.position ?? demandee);
    });
  }

  function appliquer() {
    setRefus(null);
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/retouches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, retouches, pagesRetirees }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les retouches n'ont pas pu être appliquées");
        return;
      }
      setRetour("Statuts à jour produits et joints au dossier.");
      setConfirmation(false);

      /*
       * Le travail fini, on revient au dossier.
       *
       * L'éditeur restait ouvert sur un document qu'on venait de produire, avec plus
       * rien à y faire : le seul chemin était de remonter chercher « Revenir au
       * dossier », en haut de l'écran. Les statuts à jour, eux, viennent d'être joints
       * au dossier - c'est là qu'on les relit, et c'est là que la tâche suivante attend.
       */
      router.push("/avocat/" + dossier);
      router.refresh();
    });
  }

  /*
   * Une lecture qui échoue n'est pas un dossier sans statuts.
   *
   * Le champ de dépôt s'ouvrait dans les deux cas : sur une reconnaissance interrompue,
   * l'écran demandait de redéposer un document qui était déjà là - et le redéposer
   * n'aurait rien changé, puisque c'est sa lecture qui n'a pas abouti.
   */
  if (refus && !lecture && !manquants) {
    return (
      <div className={styles.travail}>
        <p className={styles.travailRefus} role="alert">
          {refus}
        </p>
        <p className={styles.tacheExplication}>
          Les statuts sont bien au dossier : c&apos;est leur lecture qui n&apos;a pas
          abouti. Sur un document numérisé, elle demande une reconnaissance de caractères
          page par page, et peut être interrompue.
        </p>
        <div className={styles.lectureReprise}>
          <button
            type="button"
            className={styles.travailPrincipal}
            onClick={() => {
              setRefus(null);
              setEssai((n) => n + 1);
            }}
          >
            Reprendre la lecture
          </button>
          <button
            type="button"
            className={styles.travailSecondaire}
            onClick={() => setRemplacement(true)}
          >
            Remplacer les statuts
          </button>
        </div>
      </div>
    );
  }

  /*
   * Les statuts manquent : c'est un début, non une panne.
   *
   * L'écran ouvrait sur un bandeau rouge - « Les statuts en vigueur ne sont pas au
   * dossier » - suivi d'un cadre en pointillés large comme la page, contenant le
   * sélecteur de fichier du navigateur, et de deux écrans de vide. Rien n'y était faux,
   * tout y semblait cassé : c'est pourtant l'état normal d'un dossier dont le client
   * n'a pas encore franchi l'étape des statuts.
   *
   * Une carte, ce qu'elle attend, et le geste qui l'apporte.
   */
  if (refus && !lecture) {
    return (
      <div className={styles.statutsAbsents}>
        <div className={styles.statutsAbsentsIcone} aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>

        <h2 className={styles.statutsAbsentsTitre}>Les statuts en vigueur manquent</h2>
        <p className={styles.statutsAbsentsTexte}>
          C&apos;est sur leur texte que les décisions se reportent : sans eux, il n&apos;y a
          rien à retoucher. Déposez le PDF, demandez-le au client par message, ou reprenez-le
          au registre national.
        </p>

        {/*
          L'étiquette fait le bouton : le champ natif est illisible et intraduisible -
          « Choisir un fichier / Aucun fichier choisi » en plein milieu d'une carte.
        */}
        <label
          className={
            enCours
              ? `${styles.statutsAbsentsBouton} ${styles.statutsAbsentsBoutonInactif}`
              : styles.statutsAbsentsBouton
          }
        >
          <input
            type="file"
            accept=".pdf"
            className={styles.statutsAbsentsChamp}
            aria-label="Déposer les statuts en vigueur, au format PDF"
            disabled={enCours}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) deposer(fichier);
            }}
          />
          {enCours ? "Dépôt en cours…" : "Déposer les statuts (PDF)"}
        </label>

        <p className={styles.statutsAbsentsMention}>
          Le document tel qu&apos;il a été déposé au greffe, en un seul fichier.
        </p>

        {refusDuDepot && (
          <p className={styles.statutsAbsentsRefus} role="alert">
            {refusDuDepot}
          </p>
        )}

        {retour && (
          <p className={styles.travailRetour} role="status">
            {retour}
          </p>
        )}
      </div>
    );
  }

  /*
   * L'attente est dite, parce qu'elle est longue.
   *
   * Des statuts numérisés n'ont pas de couche texte : les lire, c'est en reconnaître les
   * caractères page par page - une quarantaine de secondes pour dix-sept pages. L'écran
   * affichait « Lecture des statuts… » sans rien d'autre, et l'on croyait l'éditeur
   * cassé. La lecture est maintenant gardée : ce n'est long qu'une fois.
   */
  if (!lecture) {
    return (
      <div className={styles.lectureEnCours}>
        <span className={styles.lecturePoint} aria-hidden="true" />
        <div>
          <p className={styles.lectureTitre}>Lecture des statuts en cours</p>
          {/*
            Combien de temps encore, plutôt qu'un point qui clignote.

            « Lecture des statuts… » ne disait ni où en était le travail ni s'il fallait
            attendre dix secondes ou trois minutes : on rechargeait la page, ce qui ne
            l'accélérait pas. Le compte des pages vient du serveur, l'estimation du
            rythme déjà tenu.
          */}
          {attente && <p className={styles.lectureAvancement}>{phraseDAttente(attente)}</p>}
          <p className={styles.lectureDetail}>
            Chaque page est analysée pour retrouver les passages à remplacer. Sur un
            document numérisé, la reconnaissance de caractères se fait page par page.
            Elle n&apos;a lieu qu&apos;une fois : les prochaines ouvertures seront
            immédiates.
          </p>
        </div>
      </div>
    );
  }

  /*
   * L'avancement se compte par changement, non par cadre.
   *
   * « 2 sur 2 remplacements posés » s'affichait à côté d'une durée qui n'était pas
   * faite et d'une dénomination couverte à un endroit sur quatorze : compter les
   * cadres ne dit rien de ce qui reste à faire.
   */
  const changements = suivreLesChangements(
    lecture.zones,
    lecture.introuvables,
    retouches,
    verifiees
  );
  const restants = nonConfirmes(changements);
  const confirmes = changements.length - restants.length;

  return (
    <>
      {/*
        La page à gauche, tout le reste à droite.
        Le compte, la liste des remplacements et l'avertissement occupaient un pavé
        au-dessus : la page des statuts - le seul endroit où l'on travaille - passait
        sous la ligne de flottaison, et deux panneaux disaient la même chose.
      */}
      <Editeur
        dossier={dossier}
        empreinte={empreinte}
        pages={lecture.pages}
        zones={lecture.zones}
        retouches={retouches}
        reconnus={lecture.reconnus}
        surChangement={setRetouches}
        introuvables={lecture.introuvables}
        surPlacer={placer}
        pagesRetirees={pagesRetirees}
        surRetraitDePage={setPagesRetirees}
        changements={changements}
        verifiees={verifiees}
        surVerifier={(cle, fait) =>
          setVerifiees((precedentes) =>
            fait
              ? [...precedentes.filter((c) => c !== cle), cle]
              : precedentes.filter((c) => c !== cle)
          )
        }
        historique={historique}
        positionHistorique={position}
        surInscription={inscrire}
        surReprise={reprendre}
        entete={
          <div className={styles.statutsTete}>
            {/*
              Ce qui reste, non ce qui manque.
              « 0 sur 2 changements confirmés » ouvrait l'écran sur un zéro : le même
              fait se dit en annonçant le travail à faire, et le décompte ne paraît
              qu'une fois qu'il a commencé.
            */}
            <div className={styles.statutsPhrase}>
              {confirmes === 0 ? (
                <>
                  <span className={styles.statutsCompte}>{changements.length}</span>
                  <span className={styles.statutsMention}>
                    {changements.length === 1
                      ? "changement à vérifier"
                      : "changements à vérifier"}
                  </span>
                </>
              ) : confirmes === changements.length ? (
                /*
                  Rien sous « Tout est vérifié ».

                  « le changement est confirmé » disait le même fait avec d'autres mots,
                  et le bouton noir juste dessous dit déjà ce qui reste à faire.
                */
                <span className={styles.statutsCompte}>Tout est vérifié</span>
              ) : (
                <>
                  <span className={styles.statutsCompte}>
                    {confirmes} sur {changements.length}
                  </span>
                  <span className={styles.statutsMention}>
                    {changements.length === 1 ? "changement vérifié" : "changements vérifiés"}
                  </span>
                </>
              )}
            </div>

            {/*
              Quel changement, et pas seulement combien.
              
              « 1 changement à vérifier » ne dit pas lequel : sur un dossier qui déplace
              le siège et change la dénomination, il fallait descendre la colonne pour
              savoir ce qui restait. Un seul changement se nomme avec ses deux valeurs -
              c'est ce qu'on relit dans le document ; plusieurs se nomment tout court.
            */}
            {restants.length > 0 && (
              <p className={styles.statutsDetail}>
                {restants.length === 1 ? (
                  <>
                    <span className={styles.statutsDetailTitre}>{restants[0].titre}</span>
                    {restants[0].ancien && restants[0].nouveau && (
                      <span className={styles.statutsDetailValeurs}>
                        <span className={styles.statutsAncien}>{restants[0].ancien}</span>
                        <span aria-hidden="true"> → </span>
                        <span className={styles.statutsNouveau}>{restants[0].nouveau}</span>
                      </span>
                    )}
                  </>
                ) : (
                  <span className={styles.statutsDetailTitre}>
                    {restants.map((c) => c.titre).join(", ")}
                  </span>
                )}
              </p>
            )}

            <button
              type="button"
              className={styles.travailPrincipal}
              onClick={() => (restants.length > 0 ? setConfirmation(true) : appliquer())}
              disabled={enCours || retouches.length === 0}
            >
              {enCours ? "Application" : "Produire les statuts à jour"}
            </button>

            {/*
              Ce que le bouton produira, sous le bouton.

              La mention vivait sous « Remplacer les statuts », au bas des deux
              documents : on la lisait comme un commentaire du remplacement, alors
              qu'elle décrit le document à venir. Elle appartient au geste qui le crée.
            */}
            {pagesRetirees.length > 0 && (
              <p className={styles.travailProduira}>
                {phraseDesPagesEcartees(pagesRetirees)}
              </p>
            )}

            {/*
              Le document, et le geste qui le change - une seule carte.

              Les deux vivaient l'un sous l'autre : une carte bordée, puis une pastille,
              deux formes différentes pour un document et son remplacement, sans rien qui
              dise qu'ils parlent de la même chose. La carte porte maintenant les deux -
              on ouvre à gauche, on remplace à droite, séparés d'un trait.
            */}
            <div className={styles.versions}>
              <div className={styles.version}>
                <a
                  className={styles.versionLien}
                  href={"/api/formalites/modification/page?dossier=" + dossier + "&page=1"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <svg
                    className={styles.versionIcone}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                    <path d="M14 3v5h5" />
                  </svg>
                  <span className={styles.versionTextes}>
                    <span className={styles.versionNom}>Statuts en vigueur</span>
                    <span className={styles.versionMention}>l&apos;original, jamais modifié</span>
                  </span>
                </a>

                {/*
                  Se tromper de statuts arrive, et rien ne permettait d'en changer.

                  Le champ de dépôt n'apparaissait que lorsqu'ils manquaient : une fois
                  de mauvais statuts au dossier, l'éditeur s'ouvrait dessus et aucun
                  geste ne menait ailleurs. Le serveur, lui, savait déjà remplacer - il
                  archive l'ancienne version au lieu de l'écraser.
                */}
                <button
                  type="button"
                  className={styles.versionRemplacer}
                  onClick={() => setRemplacement(true)}
                  disabled={enCours}
                  title="Déposer d'autres statuts en vigueur à la place de celui-ci"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                  Remplacer
                </button>
              </div>
            </div>

            {retour && (
              <p className={styles.travailRetour} role="status">
                {retour}
              </p>
            )}
            {refus && (
              <p className={styles.travailRefus} role="alert">
                {refus}
              </p>
            )}
          </div>
        }
      />

      {remplacement && (
        <>
          <div
            className={styles.voile}
            onClick={() => setRemplacement(false)}
            aria-hidden="true"
          />

          {/*
            Un panneau, non un avertissement.

            Il empruntait le cadre des confirmations - fond crème, texte brun - qui est
            écrit pour une question de deux lignes. Il portait un formulaire : une liste
            d'actes, une zone de dépôt et deux issues, le tout en couleur d'alerte.
          */}
          <div className={styles.statutsRemplacer} role="dialog" aria-modal="true">
            <div className={styles.statutsRemplacerTete}>
              <div>
                <h3 className={styles.statutsRemplacerTitre}>Remplacer les statuts en vigueur</h3>
                <p className={styles.statutsRemplacerDetail}>
                  La version actuelle sera conservée et restera atteignable dans
                  l&apos;historique du document.
                </p>
              </div>
              <button
                type="button"
                className={styles.panneauFermer}
                onClick={() => setRemplacement(false)}
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

            {/*
              Ce que le remplacement coûte, dit avant et non après.

              Les repérages partent du document : changer le document les rend caducs.
              Mieux vaut l'apprendre devant la zone de dépôt qu'après avoir cliqué.
            */}
            {retouches.length > 0 && (
              <p className={styles.statutsRemplacerAlerte} role="alert">
                {retouches.length === 1
                  ? "La retouche déjà faite sera perdue : l'éditeur repartira du nouveau document."
                  : "Les " +
                    retouches.length +
                    " retouches déjà faites seront perdues : l'éditeur repartira du nouveau document."}
              </p>
            )}

            {/*
              Le registre d'abord, le fichier ensuite.

              Les statuts déposés au greffe y sont publics : les reprendre évite de les
              redemander au client, et garantit qu'on travaille sur la version que le
              greffe détient - non sur celle qui traînait dans une boîte mail.
            */}
            <div className={styles.statutsRemplacerVoie}>
              <p className={styles.statutsRemplacerLegende}>Reprendre un acte du registre national</p>

              {registre === "attente" && (
                <p className={styles.statutsRemplacerVide}>Lecture du registre…</p>
              )}

              {registre === "indisponible" && (
                <p className={styles.statutsRemplacerVide}>
                  Le registre n&apos;a rien rendu : déposez le fichier vous-même.
                </p>
              )}

              {registre === "prêt" && actes.length === 0 && (
                <p className={styles.statutsRemplacerVide}>
                  Aucun acte au registre pour cette société.
                </p>
              )}

              {registre === "prêt" && actes.length > 0 && (
                <ul className={styles.actesDuRegistre}>
                  {actes.map((acte) => (
                    <li key={acte.id}>
                      <button
                        type="button"
                        onClick={() => reprendreAuRegistre(acte.id)}
                        disabled={enCours}
                      >
                        <span className={styles.acteNature}>
                          {natureLisible(acte.nature, denomination)}
                        </span>
                        {acte.deposeLe && (
                          <span className={styles.acteDate}>
                            déposé le {formaterDate(new Date(acte.deposeLe))}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.statutsRemplacerVoie}>
              <p className={styles.statutsRemplacerLegende}>Ou déposer le PDF vous-même</p>
              <DepotFichier
                id="statuts-remplacement"
                accepte=".pdf"
                invite="Glissez les statuts ici"
                precision="PDF"
                desactive={enCours}
                surFichier={(fichier) => {
                  setRemplacement(false);
                  deposer(fichier);
                }}
              />
            </div>
          </div>
        </>
      )}

      {confirmation && (
        <>
          {/*
            La question se pose devant l'écran, non tout en bas.
            
            Elle était rendue à la suite de l'éditeur, dans le flux de la page : cliquer
            sur « Produire les statuts à jour » posait la question sous plusieurs
            écrans de hauteur de document, et l'on croyait le bouton mort.
          */}
          <div
            className={styles.voile}
            onClick={() => setConfirmation(false)}
            aria-hidden="true"
          />

          <div className={styles.confirmationBloc} role="alertdialog">
          <p>
            {/*
              Nommer ce qui manque, et le geste qui le comble.

              « n'est pas confirmé » décrivait un état sans dire lequel : l'avocat lisait
              « Siège social n'est pas confirmé » devant un panneau qui affichait
              « COUVERT » et « 3 sur 3 emplacements couverts », et cherchait ce qui
              n'allait pas dans son travail. Ce n'est pas le cadre qui manque, c'est la
              coche - « Marquer comme vérifié », la case par laquelle il atteste avoir
              relu le passage. Le message porte donc son intitulé, mot pour mot.
            */}
            {restants.length === 1
              ? "« " + restants[0].titre + " » n'est pas marqué comme vérifié."
              : restants.map((c) => c.titre).join(", ") +
                " ne sont pas marqués comme vérifiés."}{" "}
            {restants.some((c) => c.couverts < c.emplacements.length) &&
              "Des emplacements repérés restent découverts : les statuts produits y garderont l'ancienne valeur. "}
            Continuer ?
          </p>
          <div className={styles.confirmationActions}>
            <button
              type="button"
              className={styles.travailSecondaire}
              onClick={() => setConfirmation(false)}
            >
              Revenir
            </button>
            <button
              type="button"
              className={styles.travailPrincipal}
              onClick={appliquer}
              disabled={enCours}
            >
              {enCours ? "Production" : "Produire quand même"}
            </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
