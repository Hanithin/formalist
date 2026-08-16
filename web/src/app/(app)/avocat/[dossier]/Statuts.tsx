"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Editeur } from "@/app/(app)/modification/Editeur";
import type { Recherche, Retouche, Zone } from "@/domain/modification/edition";
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
  zones: Zone[];
  introuvables: Recherche[];
  retouches: Retouche[];
  reconnus: boolean;
}

export function Statuts({ dossier }: { dossier: number }) {
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [retouches, setRetouches] = useState<Retouche[]>([]);
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
      } catch {
        if (vivant) setRefus("Les statuts n'ont pas pu être lus");
      }
    })();

    return () => {
      vivant = false;
    };
  }, [dossier]);

  /** Pose une zone au milieu de la première page, pour ce que rien n'a repéré. */
  function placer(recherche: Recherche) {
    const page = lecture?.pages[0];
    if (!page) return;

    setRetouches((precedentes) => [
      ...precedentes,
      {
        page: page.numero,
        x: page.largeur * 0.15,
        y: page.hauteur * 0.45,
        largeur: page.largeur * 0.55,
        hauteur: 14,
        texte: recherche.propose,
        taille: 11,
      },
    ]);
  }

  function appliquer() {
    setRefus(null);
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/retouches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, retouches }),
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

  const attendus = [
    ...lecture.zones.map((z) => ({ recherche: z as Recherche, trouve: z.trouve, place: true })),
    ...lecture.introuvables.map((r) => ({ recherche: r, trouve: null, place: false })),
  ];
  const restants = lecture.introuvables.filter(
    (r) => !retouches.some((t) => t.texte === r.propose)
  );

  return (
    <div className={styles.travail}>
      <div className={styles.travailTete}>
        <h2 className={styles.titre}>
          {attendus.length - restants.length} remplacement
          {attendus.length - restants.length > 1 ? "s" : ""} sur {attendus.length}
        </h2>
        <button
          type="button"
          className={styles.travailPrincipal}
          onClick={() => (restants.length > 0 ? setConfirmation(true) : appliquer())}
          disabled={enCours || retouches.length === 0}
        >
          {enCours ? "Application" : "Produire les statuts à jour"}
        </button>
      </div>

      {lecture.reconnus && (
        <p className={styles.tacheBlocage}>
          Ces statuts ont été lus par reconnaissance de caractères : le document déposé
          n&apos;a pas de couche texte. Vérifiez chaque emplacement avant d&apos;appliquer.
        </p>
      )}

      {/*
        Ce qu'il faut remplacer, y compris ce qui n'a pas été retrouvé.
        C'est cette seconde moitié qui manquait, et sans laquelle on croit avoir tout
        couvert.
      */}
      <ul className={styles.remplacements}>
        {attendus.map((attendu, rang) => (
          <li
            key={rang}
            className={
              attendu.place
                ? `${styles.remplacement} ${styles.remplacementPose}`
                : retouches.some((t) => t.texte === attendu.recherche.propose)
                  ? `${styles.remplacement} ${styles.remplacementPose}`
                  : `${styles.remplacement} ${styles.remplacementAPlacer}`
            }
          >
            <div>
              <span className={styles.remplacementArticle}>{attendu.recherche.article}</span>
              <span className={styles.remplacementAvant}>
                {attendu.trouve ?? attendu.recherche.cherche}
              </span>
              <span className={styles.remplacementApres}>{attendu.recherche.propose}</span>
            </div>

            {attendu.place || retouches.some((t) => t.texte === attendu.recherche.propose) ? (
              <span className={styles.remplacementEtat}>Posé</span>
            ) : (
              <button
                type="button"
                className={styles.travailSecondaire}
                onClick={() => placer(attendu.recherche)}
              >
                Placer à la main
              </button>
            )}
          </li>
        ))}
      </ul>

      {restants.length > 0 && (
        <p className={styles.tacheBlocage}>
          {restants.length === 1
            ? "Un passage n'a pas été retrouvé dans le document"
            : restants.length + " passages n'ont pas été retrouvés dans le document"}{" "}
          : les statuts le formulent peut-être autrement. Cherchez-le à l&apos;écran et
          posez la zone vous-même.
        </p>
      )}

      <Editeur
        dossier={dossier}
        pages={lecture.pages}
        zones={lecture.zones}
        retouches={retouches}
        reconnus={lecture.reconnus}
        surChangement={setRetouches}
      />

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

      {/*
        On ne bloque pas : les statuts peuvent formuler autrement, et l'avocat sait
        lire son document. On ne laisse pas passer en silence non plus.
      */}
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
    </div>
  );
}
