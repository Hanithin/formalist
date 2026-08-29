"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { filtresUtiles } from "@/domain/document/statuts";
import { FILTRES, adresseDuDossier, comptesParFiltre, correspond, dateRelative, gesteDuDossier, libelleDuFiltre, libelleDuType, nomAffichable, pageDe, paginer, parCeQuiPresse, retenu, type DossierListe, type ValeurFiltre } from "@/domain/formalite/liste";
import { avancementDuDossier, libelleDossier, tonDossier } from "@/domain/formalite/etapes";
import { signalerChangementDeColonne } from "@/lib/colonne";
import {
  BarreDOutils,
  Espace,
  Recherche,
  Selecteur,
} from "@/components/page/BarreDOutils";
import carte from "@/components/page/Carte.module.css";
import styles from "./Formalites.module.css";

/**
 * La liste des formalités, telle que la rendait public/formalites.html.
 *
 * Le filtre vit dans l'adresse : il se partage et survit à un rechargement, ce que
 * la page d'origine ne permettait pas. La recherche et la page, elles, restent ici -
 * une recherche doit répondre à la frappe, et changer de mot remet à la première
 * page, comme dans l'original.
 */

interface Props {
  dossiers: DossierListe[];
  filtre: ValeurFiltre;
  /*
   * La recherche préremplie, quand on arrive d'ailleurs.
   *
   * La fiche d'une société renvoie ici pour voir ses formalités dans la liste : sans
   * cela on atterrit sur les vingt dossiers du compte, et il faut retaper le nom qu'on
   * vient de quitter.
   */
  rechercheInitiale?: string;
}

/** Les tons du domaine, dans les classes de la page d'origine. */
const CLASSES_ETAT: Record<string, string> = {
  termine: carte.etatAbouti,
  attente: carte.etatAttente,
  avance: carte.etatNeutre,
};

const TRAITS = {
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Liste({ dossiers, filtre, rechercheInitiale = "" }: Props) {
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [page, setPage] = useState(1);
  /*
   * Le brouillon dont on demande le retrait.
   *
   * Il tient lieu d'état d'ouverture de la fenêtre : sa présence l'ouvre, et son nom
   * s'y écrit. Deux variables séparées se seraient désaccordées le jour où l'on ferme
   * sans réinitialiser.
   */
  const [aSupprimer, setASupprimer] = useState<DossierListe | null>(null);

  const comptes = useMemo(() => comptesParFiltre(dossiers), [dossiers]);

  const visibles = useMemo(
    () =>
      parCeQuiPresse(dossiers.filter((d) => retenu(d, filtre) && correspond(d, recherche))),
    [dossiers, filtre, recherche]
  );

  const pagination = paginer(visibles.length, page);
  const affiches = pageDe(visibles, pagination.page);

  return (
    <>
      {/*
        Les trois compteurs sont partis.

        « En cours 23 - 100 % de vos formalités », « Terminée - 0 sur 23 finalisée »,
        « Total 23 - 23 formalités au total » : trois cartes, six lignes, un tiers de
        l'écran pour dire deux fois le même nombre - que les filtres, juste en dessous,
        annonçaient déjà chacun à côté de son nom.
      */}
      {/* ---------- Filtres et recherche ---------- */}
      <BarreDOutils>
        <Selecteur
        intitule="Filtrer les formalités"
        actif={filtre}
        surChoix={() => setPage(1)}
        choix={filtresUtiles(FILTRES, comptes, filtre).map((f) => ({
          valeur: f.valeur,
          lien: f.valeur === "tous" ? "/formalites" : "/formalites?filtre=" + f.valeur,
          libelle: libelleDuFiltre(f, comptes[f.valeur]),
          compte: comptes[f.valeur],
        }))}
      />

      <Espace />

      <Recherche
        valeur={recherche}
        invite="Société, forme, type…"
        libelle="Rechercher une formalité"
        surSaisie={(v) => {
          setRecherche(v);
          // Chercher remet à la première page : rester en page 3 sur deux résultats
          // montrerait une liste vide.
          setPage(1);
        }}
      />
      </BarreDOutils>

      {/* ---------- Les dossiers ---------- */}
      {affiches.length === 0 ? (
        <Rien
          filtre={filtre}
          recherche={recherche}
          aucunDossier={dossiers.length === 0}
          surReinitialisation={() => {
            setRecherche("");
            setPage(1);
          }}
        />
      ) : (
        <>
          <ul className={carte.grille} aria-label="Formalités">
            {affiches.map((d) => (
              <li key={d.id} className={carte.case}>
                <Carte dossier={d} />

                {/*
                  La corbeille et la pastille sont les sœurs de la carte, non ses
                  filles : un bouton dans un lien est du HTML invalide, et le clic y
                  devient imprévisible - selon le navigateur, on supprime, ou l'on
                  ouvre le dossier. La pastille les rejoint pour que la corbeille se
                  pose à sa gauche, à la place que l'angle de la carte lui laisse.
                */}
                {d.brouillon && (
                  <div className={styles.coinBrouillon}>
                    <button
                      type="button"
                      className={styles.corbeille}
                      onClick={() => setASupprimer(d)}
                      aria-label={"Supprimer le brouillon " + nomDuDossier(d)}
                      title="Supprimer ce brouillon"
                    >
                      <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.7" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    </button>

                    {/* Elle est hors du lien : les clics la traversent, sans quoi
                        toucher la pastille n'ouvrirait pas le dossier. */}
                    <span className={`${carte.etat} ${carte.etatNeutre}`}>
                      Brouillon
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {pagination.pages > 1 && (
            <div className={styles.pagination}>
              <p className={styles.pgCount}>
                {pagination.premier} à {pagination.dernier} sur {pagination.total}
              </p>

              <div className={styles.pgControls}>
                <button
                  type="button"
                  className={
                    pagination.page === 1
                      ? `${styles.pgArrow} ${styles.pgArrowInactif}`
                      : styles.pgArrow
                  }
                  aria-label="Page précédente"
                  disabled={pagination.page === 1}
                  onClick={() => setPage(pagination.page - 1)}
                >
                  <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                {pagination.fenetre.map((n, i) =>
                  n === null ? (
                    <span key={"coupure-" + i} className={styles.pgGap}>
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      className={
                        n === pagination.page
                          ? `${styles.pgNum} ${styles.pgNumActive}`
                          : styles.pgNum
                      }
                      aria-label={"Page " + n}
                      aria-current={n === pagination.page ? "page" : undefined}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )
                )}

                <button
                  type="button"
                  className={
                    pagination.page === pagination.pages
                      ? `${styles.pgArrow} ${styles.pgArrowInactif}`
                      : styles.pgArrow
                  }
                  aria-label="Page suivante"
                  disabled={pagination.page === pagination.pages}
                  onClick={() => setPage(pagination.page + 1)}
                >
                  <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {aSupprimer && (
        <Suppression dossier={aSupprimer} surFermeture={() => setASupprimer(null)} />
      )}
    </>
  );
}

/**
 * Le nom qu'une carte porte.
 *
 * Un dossier sans société n'en a pas : on dit alors ce qu'il est. La fenêtre de
 * suppression reprend le même, sans quoi elle demanderait de confirmer le retrait
 * d'un dossier qui ne s'appelle pas comme celui qu'on vient de désigner.
 */
function nomDuDossier(dossier: DossierListe): string {
  /*
   * Le type ne se redit pas ici : l'intitulé juste au-dessus le porte déjà. « COMPTES »
   * suivi de « Nouveau dossier · dépôt des comptes » écrivait deux fois la même chose,
   * et sur les seules cartes qui manquent de place - celles sans nom de société.
   */
  return nomAffichable(dossier.societe) ?? "Nouveau dossier";
}

/**
 * Ce qui situe le dossier sans avoir à l'ouvrir.
 *
 * La carte disait un nom, un état et un geste, et se refermait quatre lignes plus
 * bas : beaucoup de blanc pour peu de choses. Le capital dit de quel projet il
 * s'agit - deux SARL du même client ne se distinguent pas autrement - et la date dit
 * depuis quand il dort. Ni l'un ni l'autre n'est indispensable, et chacun s'efface
 * quand il n'a rien à dire.
 */
function detailsDuDossier(dossier: DossierListe): string[] {
  const details: string[] = [];

  if (typeof dossier.capital === "number" && dossier.capital > 0) {
    details.push("Capital " + dossier.capital.toLocaleString("fr-FR") + " €");
  }

  const quand = dateDuDossier(dossier);
  if (quand) details.push(quand);

  return details;
}

/**
 * La date, et ce qu'elle date.
 *
 * « Il y a 11h » seul ne disait pas de quoi : créé, modifié, déposé ? C'est la dernière
 * modification, et la carte le dit maintenant. Le « le » ne s'écrit que devant une date
 * absolue - on ne dit pas « modifié le il y a 11 h ».
 */
function dateDuDossier(dossier: DossierListe): string {
  const quand = dateRelative(dossier.modifieLe);
  if (!quand) return "";
  return quand.startsWith("Il y a") || quand === "À l'instant"
    ? "Modifié " + quand.charAt(0).toLowerCase() + quand.slice(1)
    : "Modifié le " + quand;
}

/**
 * Confirmer le retrait d'un brouillon.
 *
 * Jamais un `confirm()` du navigateur : il fige l'onglet, ne se traduit pas, et
 * n'annonce pas ce qui va disparaître. La fenêtre le dit - un brouillon, son nom, et
 * que c'est définitif.
 *
 * Le refus du serveur est montré ici plutôt qu'avalé : la liste a été rendue à un
 * instant donné, et le dossier a pu être réglé depuis un autre onglet entre-temps.
 * Le client doit apprendre pourquoi son brouillon ne part pas.
 */
function Suppression({
  dossier,
  surFermeture,
}: {
  dossier: DossierListe;
  surFermeture: () => void;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [refus, setRefus] = useState<string | null>(null);
  const fenetre = useRef<HTMLDivElement>(null);

  // Échap ferme, tant qu'on n'a pas lancé la suppression : fermer pendant l'envoi
  // laisserait croire qu'on l'a annulée, alors qu'elle se poursuit.
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape" && !enCours) surFermeture();
    }
    document.addEventListener("keydown", auClavier);
    fenetre.current?.focus();
    return () => document.removeEventListener("keydown", auClavier);
  }, [enCours, surFermeture]);

  async function supprimer() {
    setEnCours(true);
    setRefus(null);
    try {
      const reponse = await fetch("/api/formalites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossier.id }),
      });

      if (!reponse.ok) {
        const corps: unknown = await reponse.json().catch(() => null);
        const message =
          corps && typeof corps === "object" && typeof (corps as { error?: unknown }).error === "string"
            ? (corps as { error: string }).error
            : "Le brouillon n'a pas pu être supprimé.";
        setRefus(message);
        setEnCours(false);
        return;
      }

      // La liste, les trois compteurs et les décomptes de filtres sont calculés côté
      // serveur : les recalculer ici les ferait diverger de la base au premier écart.
      surFermeture();
      router.refresh();
      // La colonne ne se redemande qu'au changement de page : sans ce signal, elle
      // continuerait d'annoncer le dossier qu'on vient de supprimer.
      signalerChangementDeColonne();
    } catch {
      setRefus("Le brouillon n'a pas pu être supprimé. Vérifiez votre connexion.");
      setEnCours(false);
    }
  }

  return createPortal(
    <div className={styles.voile} onClick={() => !enCours && surFermeture()}>
      <div
        ref={fenetre}
        className={styles.fenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby="supprimer-brouillon"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="supprimer-brouillon" className={styles.fenetreTitre}>
          Supprimer ce brouillon ?
        </h2>

        <p className={styles.fenetreTexte}>
          <strong>{nomDuDossier(dossier)}</strong> n&apos;a pas été réglé ni transmis au
          cabinet. Le dossier et les pièces que vous y avez déposées seront supprimés
          définitivement.
        </p>

        {refus && (
          <p className={styles.fenetreRefus} role="alert">
            {refus}
          </p>
        )}

        <div className={styles.fenetreActions}>
          <button
            type="button"
            className={styles.boutonSecondaire}
            onClick={surFermeture}
            disabled={enCours}
          >
            Annuler
          </button>
          <button
            type="button"
            className={styles.boutonDanger}
            onClick={supprimer}
            disabled={enCours}
          >
            {enCours ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Où mène un dossier.
 *
 * Il n'existe pas de page de détail : cliquer un dossier rouvre le parcours là où il
 * en est, comme le faisait la liste d'origine (« /creation.html?id= »). La destination
 * suit le type - une modification ne se reprend pas dans le parcours de création.
 */
function Carte({ dossier }: { dossier: DossierListe }) {
  // Le type décide du vocabulaire : une auto-entreprise n'a ni capital ni signature.
  const pourcentage = avancementDuDossier(dossier);
  const etat = libelleDossier({
    type: dossier.type,
    status: dossier.status,
    phase: dossier.phase,
    sousPhase: dossier.sousPhase,
    banque: dossier.banque,
  });
  const ton = tonDossier({ status: dossier.status, phase: dossier.phase });

  /*
   * « Reprendre » signale que le formulaire est encore au client : c'est exactement
   * quand la jauge a un sens. « Suivre » dit l'inverse - il n'y a plus rien à remplir.
   */
  const geste = gesteDuDossier(dossier);
  const aJauge = geste === "Reprendre";

  return (
    <Link href={adresseDuDossier(dossier)} className={carte.carte}>
      <div
        className={
          dossier.brouillon
            ? `${carte.tete} ${styles.enteteAvecCorbeille}`
            : carte.tete
        }
      >
        {/*
          La nature du dossier, en intitulé et non en pastille.

          Elle en portait une, grise, jumelle de celle de l'état posée en face : deux
          registres - ce qu'est le dossier, où il en est - rendus à l'identique, que
          l'œil ne pouvait pas distinguer sans les lire. L'état est seul à garder sa
          pastille, et devient donc ce qu'on trouve en premier.

          Le type passe par `libelleDuType` : la colonne stocke « comptes », qu'il
          fallait lire tel quel, sans accent ni majuscule de mot.
        */}
        <span className={carte.nature}>
          {dossier.forme || libelleDuType(dossier.type) || "Formalité"}
        </span>

        {/*
          Un brouillon le dit, plutôt que d'annoncer une étape.
          « En attente d'attestation » sur un dossier que personne ne traite promet un
          travail en cours : rien n'avance tant que le dossier n'est ni réglé ni
          transmis, et l'attente qu'il annonce est la sienne.

          Sa pastille est rendue hors du lien, avec la corbeille : c'est le seul moyen
          de poser un bouton à sa gauche. L'en-tête lui réserve la place.
        */}
        {!dossier.brouillon && (
          <span
            className={`${carte.etat} ${
              dossier.urgent ? carte.etatAttente : (CLASSES_ETAT[ton] ?? "")
            }`}
          >
            {etat}
          </span>
        )}
      </div>

      <span className={carte.titre}>
        {/*
          Le nom, ou ce que le dossier est.
          « Société à identifier » est un marqueur de base : posé en titre, il se lit
          comme un nom de société, et l'on ouvre le dossier pour découvrir laquelle.
        */}
        {nomDuDossier(dossier)}
        {dossier.nonLus > 0 && (
          <span
            className={styles.notifBadge}
            aria-label={
              dossier.nonLus + (dossier.nonLus > 1 ? " messages non lus" : " message non lu")
            }
          >
            {dossier.nonLus}
          </span>
        )}
      </span>

      {/*
        Ce que le dossier attend, non la date de sa dernière modification.

        « Modifié le 9 août 2026 » est la métadonnée la plus faible de la carte : on
        ouvre cette page pour savoir ce qui nous attend, pas pour retrouver ce qu'on a
        fait. La date reste lisible sur la page du dossier.
      */}
      <span className={carte.etape}>{dossier.etape || dateDuDossier(dossier)}</span>

      <span className={carte.details}>{detailsDuDossier(dossier).join(" · ")}</span>

      {/*
        La jauge ne s'affiche que tant qu'elle mesure quelque chose.

        Elle dit l'avancée du client dans son formulaire. Une fois le dossier parti au
        cabinet ou terminé, elle est à cent pour cent et ne mesure plus rien : sur une
        carte terminée, une barre noire pleine largeur et « 100% complété » disaient une
        troisième fois ce que la pastille verte annonçait déjà.

        Une version antérieure l'affichait partout, au motif qu'un retrait faisait un
        escalier de hauteurs. La rangée du pied reste ici dans les deux cas - seule la
        jauge s'en absente - et les cartes gardent leur ligne.
      */}
      <div className={carte.pied}>
        {aJauge && (
          /*
            La jauge se tait.

            « 20 % complété » écrivait ce que le trait montre déjà, et se contredisait
            avec le geste : un dossier annoncé à cent pour cent proposait encore de le
            reprendre. Le trait garde le coup d'œil « où j'en suis » ; la ligne
            au-dessus dit quoi faire, ce que le chiffre n'a jamais su dire.
          */
          <span
            className={carte.jauge}
            role="img"
            aria-label={"Avancement : " + pourcentage + " %"}
          >
            <span className={carte.jaugeRemplie} style={{ width: pourcentage + "%" }} />
          </span>
        )}
        <span className={carte.geste}>
          {geste}
          <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="2" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

/**
 * Rien à montrer.
 *
 * Un compte sans aucune formalité n'a pas le même besoin qu'un filtre trop étroit :
 * le premier veut une porte d'entrée, le second veut savoir qu'il suffit d'élargir.
 */
function Rien({
  filtre,
  recherche,
  aucunDossier,
  surReinitialisation,
}: {
  filtre: ValeurFiltre;
  recherche: string;
  aucunDossier: boolean;
  /** La recherche vit dans l'état, non dans l'adresse : le lien ne l'efface pas seul. */
  surReinitialisation: () => void;
}) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24" {...TRAITS} strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>

      {aucunDossier ? (
        <>
          <p className={styles.emptyStateTitle}>Aucune formalité</p>
          <p className={styles.emptyStateDesc}>
            Vos créations, modifications et fermetures de société se suivent ici, étape par étape.
          </p>
          <div className={styles.emptyStateActions}>
            <Link
              href="/creation?type=creation"
              className={`${styles.bouton} ${styles.boutonPrincipal}`}
            >
              Créer une société
            </Link>
            <Link href="/auto-entrepreneur" className={styles.bouton}>
              Créer une auto-entreprise
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={styles.emptyStateTitle}>Aucune formalité trouvée</p>
          <p className={styles.emptyStateDesc}>
            Modifiez vos filtres ou lancez une nouvelle démarche
          </p>
          <div className={styles.emptyStateActions}>
            {(filtre !== "tous" || recherche) && (
              /*
                Le lien remet la pastille à « Toutes » et vide la recherche.

                Il ne faisait que la première : la recherche vit dans l'état, non dans
                l'adresse, si bien que revenir sur /formalites laissait le mot tapé en
                place - et le même écran vide, avec le même bouton qui ne menait à rien.
              */
              <Link href="/formalites" className={styles.bouton} onClick={surReinitialisation}>
                Voir toutes les formalités
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
