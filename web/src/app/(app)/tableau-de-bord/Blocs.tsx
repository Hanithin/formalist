import Link from "next/link";
import { accorder } from "@/domain/formalite/etapes";
import { ATTENTES_MONTREES, attentesOrdonnees } from "@/domain/formalite/actions";
import type { ActionAttendue } from "@/domain/formalite/actions";
import { ToutesLesAttentes } from "./ToutesLesAttentes";
import { dateRelative, phraseJournal, seSuffitAElleMeme } from "@/domain/formalite/journal";
import type { EntreeJournal } from "@/domain/formalite/journal";
import { Vide } from "@/components/liste/Vide";
import styles from "./TableauDeBord.module.css";

/**
 * Les deux cartes communes aux états à un et à plusieurs dossiers : ce qu'on
 * attend du client, et l'activité récente.
 *
 * La page d'origine les écrivait deux fois - renderTodos pour le dossier unique,
 * renderMultiTodos pour les autres - avec des sous-titres qui avaient divergé.
 * Elles ne diffèrent en réalité que par la précision du sous-titre, selon qu'il y
 * a un dossier ou plusieurs.
 */

/* Le type des actions est celui du domaine : le redéclarer ici l'avait fait
   diverger - « urgent » y était devenu facultatif. */
interface SocieteAvecActions {
  id: number;
  societe: string;
  actions: ActionAttendue[];
}

export function Attentes({
  societes,
  nbActions,
}: {
  societes: SocieteAvecActions[];
  nbActions: number;
}) {
  const plusieurs = societes.length > 1;

  /*
   * Cinq actions au plus, les bloquantes d'abord.
   *
   * La carte montrait tout : sur une trentaine de dossiers elle devenait une liste à
   * faire défiler, et l'activité récente disparaissait sous elle. L'ordre compte dès
   * qu'on tronque - une signature manquante ne doit pas se cacher derrière
   * « Voir tout ».
   */
  const toutes = attentesOrdonnees(societes);
  const montrees = toutes.slice(0, ATTENTES_MONTREES);

  return (
    <section className={styles.dashCard} aria-labelledby="ce-qu-on-attend">
      <div className={styles.dashCardHead}>
        <div>
          {/* Un titre de section reste un titre : la page d'origine le posait en
              div, ce qui le rendait invisible à la navigation par titres. */}
          <h2 id="ce-qu-on-attend" className={styles.dashCardTitle}>
            Ce qu&apos;on attend de vous
          </h2>
          <div className={styles.dashCardSub}>
            {nbActions === 0
              ? "Aucune action en attente"
              : plusieurs
                ? accorder(nbActions, "action", "actions") +
                  " sur " +
                  accorder(societes.length, "dossier", "dossiers")
                : accorder(nbActions, "action à traiter", "actions à traiter")}
          </div>
        </div>

        {toutes.length > ATTENTES_MONTREES && (
          <ToutesLesAttentes actions={toutes} plusieurs={plusieurs} />
        )}
      </div>

      {nbActions === 0 ? (
        <Vide
          ton="encart"
          positif
          icone="/formalites"
          texte={
            <>
              <strong>Rien à faire pour l&apos;instant.</strong> Nous traitons{" "}
              {plusieurs ? "vos dossiers" : "votre dossier"}, vous serez prévenu dès qu&apos;une
              action vous attend.
            </>
          }
        />
      ) : (
        <div className={styles.todoList}>
          {montrees.map((a, i) => (
            <Link
              key={a.dossierId + "-" + i}
              href={a.lien}
              className={a.urgent ? `${styles.todo} ${styles.urgent}` : styles.todo}
            >
              <span className={styles.todoDot} />
              <span className={styles.todoBody}>
                <span className={styles.todoTitle}>{a.titre}</span>
                <span className={styles.todoDesc}>
                  {/* Le nom du dossier ne sert à rien quand il n'y en a qu'un. */}
                  {plusieurs ? (
                    <>
                      <strong>{a.societe}</strong> · {a.precision}
                    </>
                  ) : (
                    a.precision
                  )}
                </span>
              </span>
              <span className={styles.todoCta}>{a.bouton}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

type Entree = EntreeJournal & { dossierId: number; societe: string };

export function ActiviteRecente({
  activite,
  lienDossier,
  /** Une carte titrée quand elle est en colonne, à côté des documents. */
  avecTitre = false,
}: {
  activite: Entree[];
  lienDossier: (id: number) => string;
  avecTitre?: boolean;
}) {
  return (
    <section className={styles.dashCard} aria-labelledby={avecTitre ? "activite" : undefined}>
      {avecTitre && (
        <div className={styles.dashCardHead}>
          <div>
            <h2 id="activite" className={styles.dashCardTitle}>
              Activité récente
            </h2>
            <div className={styles.dashCardSub}>Les dernières actions sur votre dossier</div>
          </div>
        </div>
      )}

      {activite.length === 0 ? (
        <Vide
          ton="encart"
          texte={
            avecTitre
              ? "Rien ne s'est encore passé sur ce dossier."
              : "Rien ne s'est encore passé sur vos dossiers."
          }
        />
      ) : (
        <div className={styles.actCols}>
          {activite.slice(0, 6).map((e, i) => {
            const cestMoi = e.auteurRole === "user";
            const qui = cestMoi ? "Vous" : (e.auteur ?? "Formalist");

            return (
              <Link
                key={i}
                href={lienDossier(e.dossierId)}
                className={`${styles.actRow} ${styles.actRowLink}`}
              >
                <span className={styles.actDot} />
                <span className={styles.actBody}>
                  <span className={styles.actText}>
                    {seSuffitAElleMeme(e) ? (
                      <strong>{e.valeur}</strong>
                    ) : (
                      <>
                        <strong>{qui}</strong> {phraseJournal(e, cestMoi)}
                      </>
                    )}
                  </span>
                  {e.commentaire && <span className={styles.actNote}>{e.commentaire}</span>}
                  <span className={styles.actTime}>
                    {e.societe} · {dateRelative(e.quand)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
