"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Editeur } from "@/app/(app)/modification/Editeur";
import type { Introuvable, Retouche, Zone } from "@/domain/modification/edition";
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
  historique: EtapeDHistorique[];
  positionHistorique: number;
  zones: Zone[];
  introuvables: Introuvable[];
  retouches: Retouche[];
  reconnus: boolean;
}

export function Statuts({ dossier }: { dossier: number }) {
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [retouches, setRetouches] = useState<Retouche[]>([]);
  const [pagesRetirees, setPagesRetirees] = useState<number[]>([]);
  const [historique, setHistorique] = useState<EtapeDHistorique[]>([]);
  const [position, setPosition] = useState(-1);
  const [refus, setRefus] = useState<string | null>(null);
  const [retour, setRetour] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
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
      setHistorique(corps.historique ?? []);
      setPosition(corps.positionHistorique ?? -1);
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
        setRefus(retour.error ?? "Le dépôt a été refusé");
        return;
      }
      setRetour("Statuts reçus. Les passages à remplacer sont repérés ci-dessous.");
      relire();
      router.refresh();
    });
  }

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const reponse = await fetch("/api/formalites/modification/retouches?dossier=" + dossier);
        const corps = await reponse.json().catch(() => ({}));
        if (!vivant) return;

        if (!reponse.ok) {
          setRefus(corps.error ?? "Les statuts n'ont pas pu être lus");
          return;
        }
        setLecture(corps as Lecture);
        setRetouches(corps.retouches ?? []);
        setPagesRetirees(corps.pagesRetirees ?? []);
        setHistorique(corps.historique ?? []);
        setPosition(corps.positionHistorique ?? -1);
      } catch {
        if (vivant) setRefus("Les statuts n'ont pas pu être lus");
      }
    })();

    return () => {
      vivant = false;
    };
  }, [dossier]);

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
    setRetouches((precedentes) => [
      ...precedentes,
      {
        page: page.numero,
        x: sousLArticle ? sousLArticle.x : page.largeur * 0.15,
        y: sousLArticle
          ? Math.min(page.hauteur - 20, sousLArticle.y + sousLArticle.hauteur * 1.6)
          : page.hauteur * 0.45,
        largeur: page.largeur * 0.55,
        hauteur: sousLArticle ? sousLArticle.hauteur : 14,
        texte: manque.recherche.propose,
        taille: sousLArticle ? Math.round(sousLArticle.hauteur * 8) / 10 : 11,
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
      router.refresh();
    });
  }

  if (refus && !lecture) {
    return (
      <div className={styles.travail}>
        <p className={styles.travailRefus} role="alert">
          {refus}
        </p>

        {/*
          Le client ne peut plus rien déposer une fois le dossier réglé : c'est donc
          au cabinet de le faire, avec ce que le client lui a envoyé.
        */}
        <div className={styles.depotStatuts}>
          <p className={styles.tacheExplication}>
            Déposez les statuts en vigueur, au format PDF. Vous pouvez les demander au
            client par message, ou les reprendre au registre national.
          </p>
          <input
            type="file"
            accept=".pdf"
            disabled={enCours}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) deposer(fichier);
            }}
          />
        </div>

        {retour && (
          <p className={styles.travailRetour} role="status">
            {retour}
          </p>
        )}
      </div>
    );
  }

  if (!lecture) return <p className={styles.tacheExplication}>Lecture des statuts…</p>;

  const attendus = [...lecture.zones, ...lecture.introuvables];
  const restants = lecture.introuvables.filter(
    (m) => !retouches.some((t) => t.texte === m.recherche.propose)
  );
  const poses = attendus.length - restants.length;

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
        pages={lecture.pages}
        zones={lecture.zones}
        retouches={retouches}
        reconnus={lecture.reconnus}
        surChangement={setRetouches}
        introuvables={restants}
        surPlacer={placer}
        pagesRetirees={pagesRetirees}
        surRetraitDePage={setPagesRetirees}
        historique={historique}
        positionHistorique={position}
        surInscription={inscrire}
        surReprise={reprendre}
        entete={
          <div className={styles.statutsTete}>
            <div>
              <span className={styles.statutsCompte}>
                {poses} sur {attendus.length}
              </span>
              <span className={styles.statutsMention}>
                {attendus.length === 1 ? "remplacement posé" : "remplacements posés"}
              </span>
            </div>

            <button
              type="button"
              className={styles.travailPrincipal}
              onClick={() => (restants.length > 0 ? setConfirmation(true) : appliquer())}
              disabled={enCours || retouches.length === 0}
            >
              {enCours ? "Application" : "Produire les statuts à jour"}
            </button>

            {/*
              Les deux versions, toujours au dossier.
              La retouche part des statuts en vigueur et produit un second document :
              l'original ne bouge jamais, et l'on peut recommencer sans l'avoir perdu.
            */}
            <div className={styles.versions}>
              <a
                className={styles.version}
                href={"/api/formalites/modification/page?dossier=" + dossier + "&page=1"}
                target="_blank"
                rel="noreferrer"
              >
                Statuts en vigueur
                <span className={styles.versionMention}>l&apos;original, jamais modifié</span>
              </a>

              {pagesRetirees.length > 0 && (
                <span className={styles.versionMention}>
                  {pagesRetirees.length === 1
                    ? "1 page écartée du document produit"
                    : pagesRetirees.length + " pages écartées du document produit"}
                </span>
              )}
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

      {confirmation && (
        <div className={styles.confirmationBloc} role="alertdialog">
          <p>
            {restants.length === 1
              ? "Un remplacement n'est pas posé."
              : restants.length + " remplacements ne sont pas posés."}{" "}
            Les statuts produits garderont l&apos;ancienne valeur à cet endroit. Continuer ?
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
              Produire quand même
            </button>
          </div>
        </div>
      )}
    </>
  );
}
