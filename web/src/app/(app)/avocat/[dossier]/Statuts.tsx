"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Editeur } from "@/app/(app)/modification/Editeur";
import type { Introuvable, Retouche, Zone } from "@/domain/modification/edition";
import { nonConfirmes, suivreLesChangements } from "@/domain/modification/suivi";
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

export function Statuts({ dossier }: { dossier: number }) {
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [retouches, setRetouches] = useState<Retouche[]>([]);
  const [pagesRetirees, setPagesRetirees] = useState<number[]>([]);
  const [verifiees, setVerifiees] = useState<string[]>([]);
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
      setVerifiees(corps.verifiees ?? []);
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
        setVerifiees(corps.verifiees ?? []);
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
          <p className={styles.lectureDetail}>
            Chaque page est analysée pour retrouver les passages à remplacer. Sur un
            document numérisé, la reconnaissance de caractères peut prendre une minute.
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
                <>
                  <span className={styles.statutsCompte}>Tout est vérifié</span>
                  <span className={styles.statutsMention}>
                    {changements.length === 1
                      ? "le changement est confirmé"
                      : "les " + changements.length + " changements sont confirmés"}
                  </span>
                </>
              ) : (
                <>
                  <span className={styles.statutsCompte}>
                    {confirmes} sur {changements.length}
                  </span>
                  <span className={styles.statutsMention}>
                    {changements.length === 1 ? "changement confirmé" : "changements confirmés"}
                  </span>
                </>
              )}
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
            {/*
              Nommer ce qui n'est pas confirmé, non en donner le nombre.
              « 2 remplacements ne sont pas posés » n'apprend rien : c'est lequel qui
              compte, et sur quels emplacements l'ancienne valeur resterait.
            */}
            {restants.length === 1
              ? "« " + restants[0].titre + " » n'est pas confirmé."
              : restants.map((c) => c.titre).join(", ") + " ne sont pas confirmés."}{" "}
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
              Produire quand même
            </button>
          </div>
        </div>
      )}
    </>
  );
}
