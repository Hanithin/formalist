import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirModification, confirmerAuRetour } from "@/infrastructure/db/depots/modifications";
import { Parcours, type EtatDuDossier } from "./Parcours";
import { Commencer } from "./Commencer";
import { Suivi } from "@/components/formalite/Suivi";
import { definitions } from "@/domain/modification/types";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { actesDuDossier, documentsDuDossier } from "@/infrastructure/db/depots/documents";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import styles from "./Modification.module.css";

export const metadata: Metadata = {
  title: "Modifier ma société - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Le parcours de modification.
 *
 * Sans dossier en cours, la page en ouvre un : la société se choisit à la première
 * étape, par recherche au registre. C'est ce qui permet de modifier une société créée
 * ailleurs - c'est-à-dire la plupart d'entre elles.
 */

/** Le chevron d'un chemin : il dit qu'on va ailleurs, non qu'on déclenche une action. */
function Chevron() {
  return (
    <svg
      className={styles.confieChevron}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default async function Modification({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; etape?: string; session?: string; paiement?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape, session, paiement } = await searchParams;

  if (!dossier) {
    return (
      <main className={styles.page}>
        <div className={styles.topbar}>
          <Link href="/formalites">Mes formalités</Link>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Modifier ma société</span>
        </div>

        {/*
          L'entrée est plus large que le parcours.

          Les 900 px du parcours conviennent à un formulaire, qu'on lit ligne à ligne ;
          ici on compare neuf changements, et cette largeur les rangeait sur deux
          colonnes de cinq lignes - le bouton tombait alors sous le pli.
        */}
        <div className={`${styles.content} ${styles.contentLarge}`}>
          <h1 className={styles.titre}>Modifier ma société</h1>
          <Commencer />
        </div>
      </main>
    );
  }

  const dossierId = Number(dossier);

  /*
   * Le retour de paiement est relu ici, avant tout affichage.
   *
   * Sans cela, le client revient de sa banque sur la page du devis, sans savoir si
   * quelque chose a été débité - et paie une seconde fois.
   */
  let issue: "regle" | "annule" | undefined;
  if (session) {
    const { paye } = await confirmerAuRetour(utilisateur, dossierId, session);
    if (paye) issue = "regle";
  } else if (paiement === "annule") {
    issue = "annule";
  }

  const { modification, dossier: ligne } = await ouvrirModification(utilisateur, dossierId);

  /*
   * Un dossier réglé n'a plus rien à saisir, mais il a tout à suivre.
   *
   * Il renvoyait à « Mes formalités », d'où l'on venait justement de cliquer sur sa
   * carte : le clic ne faisait rien du tout, et le client n'avait aucun endroit où
   * voir où en était sa modification ni ce que l'avocat lui demandait.
   */
  /*
   * Réglé : on suit, on ne saisit plus - y compris au retour de la banque.
   *
   * Ce retour menait à l'étape des actes, où le client n'a rien à faire : ils sont
   * produits à l'encaissement, et c'est l'avocat qui les relit. Il arrive donc là où
   * son dossier avance, avec un mot qui confirme le paiement.
   */
  if (modification.paye && issue !== "annule") {
    const etat = await etatDuDossier(ligne);

    return (
      <main className={styles.page}>
        <div className={styles.topbar}>
          <Link href="/formalites">Mes formalités</Link>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>{modification.societe.denomination || "Modifier ma société"}</span>
        </div>

        <div className={`${styles.content} ${styles.contentLarge}`}>
          <h1 className={styles.titre}>
            {modification.societe.denomination || "Modifier ma société"}
          </h1>

          {/* Le paiement se confirme là où l'on arrive, sans fenêtre à refermer. */}
          {issue === "regle" && (
            <p className={styles.reglementConfirme}>
              Paiement effectué. Votre dossier est confié à un avocat : il relit le
              procès-verbal et les statuts à jour, et vous écrit si quelque chose doit
              être repris.
            </p>
          )}

          {/*
            L'avancement à gauche, le dossier à droite.
            Le mot du cabinet et ses deux liens s'étalaient sur toute la largeur, sous
            un avancement qui en faisait autant : la page était une pile de bandes, et
            l'on descendait pour trouver un bouton. En colonne, ce qui avance se lit
            d'un côté, ce qu'on peut faire de l'autre.
          */}
          <div className={styles.suiviColonnes}>
            <div className={styles.suiviPrincipal}>
              <Suivi
                etat={etat}
                demande={await derniereDemandeDeCorrections(dossierId)}
                lienAction={"/modification?dossier=" + dossierId}
                lienMessagerie={"/messagerie?dossier=" + dossierId}
              />
            </div>

            <aside className={styles.suiviColonne}>
              <div className={styles.confie}>
                <h2 className={styles.confieTitre}>Votre dossier</h2>

                <dl className={styles.confieFaits}>
                  <div>
                    <dt>Société</dt>
                    <dd>{modification.societe.denomination || "À identifier"}</dd>
                  </div>
                  {modification.societe.siren && (
                    <div>
                      <dt>SIREN</dt>
                      <dd>{modification.societe.siren}</dd>
                    </div>
                  )}
                </dl>

                {/* Ce qui a été décidé, en pastilles : la liste sert de rappel, non de
                    formulaire, et six changements en phrase font deux lignes pleines. */}
                {definitions(modification.codes).length > 0 && (
                  <ul className={styles.confieChangements}>
                    {definitions(modification.codes).map((d) => (
                      <li key={d.code}>{d.libelleCourt}</li>
                    ))}
                  </ul>
                )}

                <p className={styles.confieTexte}>
                  Vous n&apos;avez rien à remplir : l&apos;avancement dit où en est votre
                  modification, et vous serez prévenu si quelque chose doit être repris.
                </p>

                {/*
                  Deux destinations, non deux boutons.

                  Côte à côte et de même poids, ils se disputaient l'œil sans que rien
                  ne dise lequel choisir - et l'un des deux portait le liseré noir du
                  bouton principal, qu'aucun des deux n'est. Ce sont des chemins : une
                  icône, un intitulé, un chevron, comme partout ailleurs dans l'app.
                */}
                <div className={styles.confieLiens}>
                  <Link className={styles.confieLien} href={"/messagerie?dossier=" + dossierId}>
                    <span className={styles.confieIcone} aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                      </svg>
                    </span>
                    <span className={styles.confieLienTexte}>
                      Écrire à l&apos;avocat
                      <span className={styles.confieLienPrecision}>
                        Une question sur votre dossier
                      </span>
                    </span>
                    <Chevron />
                  </Link>

                  <Link className={styles.confieLien} href="/documents">
                    <span className={styles.confieIcone} aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </span>
                    <span className={styles.confieLienTexte}>
                      Voir mes documents
                      <span className={styles.confieLienPrecision}>
                        Vos actes dès qu&apos;ils sont relus
                      </span>
                    </span>
                    <Chevron />
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    );
  }

  const initial: EtatDuDossier = {
    codes: modification.codes,
    societe: modification.societe,
    valeurs: modification.valeurs,
    assemblee: modification.assemblee,
    cessions: modification.cessions,
    statuts: modification.statuts,
    retouches: modification.retouches,
    statutsAJour: modification.statutsAJour,
    paye: modification.paye,
  };

  const demandee = Number(etape);
  const dansLeParcours =
    Number.isInteger(demandee) && demandee >= 1 && demandee <= 7 ? demandee : 1;

  /*
   * La dernière étape attend le règlement.
   *
   * Le procès-verbal et les statuts à jour sont le travail commandé : les produire
   * avant paiement reviendrait à les donner. Le contrôle est ici, sur le serveur, et
   * non seulement dans la frise - une adresse tapée à la main, un favori gardé sur
   * `?etape=7`, un retour d'historique y mèneraient sans cela.
   *
   * Le retour de la banque échappe à la règle : il porte la session de paiement, que
   * la page confirme juste au-dessus. Sans quoi on reviendrait sur l'étape du
   * règlement, dossier payé, à se demander si quelque chose a été débité.
   */
  const etapeInitiale =
    dansLeParcours === 7 && !modification.paye && issue !== "regle" ? 6 : dansLeParcours;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/formalites">Mes formalités</Link>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{modification.societe.denomination || "Modifier ma société"}</span>
      </div>

      <div className={styles.content}>
        <h1 className={styles.titre}>Modifier ma société</h1>
        <Parcours
          dossier={dossierId}
          initial={initial}
          etapeInitiale={etapeInitiale}
          issueDuPaiement={issue}
          /*
            Les actes déjà produits, pour que l'étape 6 les retrouve au retour.
            Elle partait d'une liste vide : quitter l'étape et y revenir effaçait les
            actes de l'écran, et le bouton proposait de reproduire ce qui existait.
          */
          actesInitiaux={await actesDuDossier(utilisateur, dossierId)}
          /*
           * Les justificatifs déjà remis.
           *
           * Ils se déposent à l'étape du règlement, qui refuse de payer tant qu'il en
           * manque un. La liste vient du serveur à chaque affichage : revenir sur
           * l'étape après un dépôt doit montrer ce qui est arrivé, non ce qu'on avait
           * en ouvrant la page.
           */
          piecesDeposees={(await documentsDuDossier(utilisateur, dossierId))
            .filter((d) => d.type)
            .map((d) => ({ type: d.type as string, nom: d.name }))}
        />
      </div>
    </main>
  );
}
