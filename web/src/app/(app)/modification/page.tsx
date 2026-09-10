import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouIntrouvable } from "../introuvable";
import { ouvrirModification, confirmerAuRetour } from "@/infrastructure/db/depots/modifications";
import { Parcours, type EtatDuDossier } from "./Parcours";
import { Commencer } from "./Commencer";
import { Suivi } from "@/components/formalite/Suivi";
import { TeteDuDossier } from "@/components/formalite/TeteDuDossier";
import { definitions } from "@/domain/modification/types";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import {
  actesDuDossier,
  documentsDuDossier,
  depotsDuDossier,
} from "@/infrastructure/db/depots/documents";
import { messagesDuDossier } from "@/infrastructure/db/depots/messages";
import {
  DocumentsDuDossier,
  type DocumentDuDossier,
  type EtatDuDocument,
} from "@/components/formalite/DocumentsDuDossier";
import { FilDuDossier, type MessageDuFil } from "@/components/formalite/FilDuDossier";
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

/** « 31 décembre 2025 à 14:05 » : la date d'un message, dans le fil. */
function quandDuMessage(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

/** Le chevron d'un chemin : il dit qu'on va ailleurs, non qu'on déclenche une action. */

export default async function Modification({
  searchParams,
}: {
  searchParams: Promise<{
    dossier?: string;
    etape?: string;
    session?: string;
    paiement?: string;
  }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape, session, paiement } = await searchParams;

  if (!dossier) {
    return (
      <main className={styles.page}>
        {/*
          Le nom de l'écran en tête, à la place du fil d'Ariane : il ne disait rien que
          la colonne ne dise, et son seul rôle propre - repartir vers « Mes
          formalités » - est tenu par cette colonne, qui ne quitte jamais l'écran.
        */}
        <header className={`${styles.entetePage} ${styles.entetePageLarge}`}>
          <div>
            <h1 className={styles.entetePageTitre}>Modifier ma société</h1>
            <p className={styles.entetePageSousTitre}>
              Siège, dénomination, dirigeant, capital : tout se déclare ici.
            </p>
          </div>
        </header>

        {/*
          L'entrée est plus large que le parcours.

          Les 900 px du parcours conviennent à un formulaire, qu'on lit ligne à ligne ;
          ici on compare neuf changements, et cette largeur les rangeait sur deux
          colonnes de cinq lignes - le bouton tombait alors sous le pli.
        */}
        <div
          className={`${styles.content} ${styles.contentLarge} ${styles.contentSousEntete}`}
        >
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

  const { modification, dossier: ligne } = await ouIntrouvable(ouvrirModification(utilisateur, dossierId));

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
    const base = "/modification?dossier=" + dossierId;

    /*
     * Les trois faces du dossier, comme sur le dépôt des comptes.
     *
     * Les documents vivaient dans la bibliothèque commune, où il fallait retrouver sa
     * société parmi les autres, et les messages dans la messagerie, où il fallait
     * retrouver le bon fil.
     */
    const [deposes, actes, ajoutes, echanges] = await Promise.all([
      documentsDuDossier(utilisateur, dossierId),
      actesDuDossier(utilisateur, dossierId),
      depotsDuDossier(utilisateur, dossierId),
      messagesDuDossier(utilisateur, dossierId),
    ]);

    const documents: DocumentDuDossier[] = [
      ...deposes.map((d) => ({
        id: String(d.id),
        nom: d.name,
        fichier: d.file_path,
        creeLe: d.created_at ? d.created_at.toISOString() : null,
        /*
         * Une pièce que l'avocat a vérifiée le dit.
         *
         * Elle restait « Déposé par vous » quoi qu'il advienne : le client remettait son
         * justificatif, l'avocat le relisait et le validait - « Vérifié » de son côté -
         * et rien n'en revenait au client. Il ne savait pas si sa pièce avait été
         * acceptée, ni s'il devait s'attendre à en redéposer une.
         *
         * Ce que nous produisons n'apparaît ici qu'une fois relu : `visibleParLeClient`
         * retient les actes tant qu'ils sont à relire.
         */
        etat: (d.uploaded_by === "system" || d.status === "verified"
          ? "valide"
          : "depose") as EtatDuDocument,
      })),
      ...actes
        .filter((a) => a.enRelecture)
        .map((a) => ({
          id: "acte-" + a.id,
          nom: a.titre,
          fichier: null,
          creeLe: null,
          etat: "en_relecture" as EtatDuDocument,
        })),
      ...ajoutes.map((d) => ({
        id: "depot-" + d.id,
        nom: d.name,
        fichier: d.file_path,
        creeLe: d.created_at ? d.created_at.toISOString() : null,
        etat: "depose" as EtatDuDocument,
      })),
    ];

    const fil: MessageDuFil[] = echanges.map((m) => ({
      id: m.id,
      expediteurId: m.expediteurId,
      expediteur: m.expediteur,
      contenu: m.contenu,
      fichier: m.fichier,
      quand: quandDuMessage(m.envoyeLe),
    }));

    return (
      <main className={styles.page}>
        {/*
          Le nom de la société en tête, comme sur le dépôt des comptes.

          Le fil d'Ariane le disait en gris clair au-dessus de tout, et le retour se
          visait au pixel. Les deux écrans suivent le même dossier réglé : ils se lisent
          de la même façon.
        */}
        <div className={`${styles.content} ${styles.contentLarge}`}>
          <TeteDuDossier
            titre={modification.societe.denomination || "Modifier ma société"}
            mentions={[
              "Modification de société",
              modification.societe.forme || null,
            ]}
            retour={{ href: "/formalites", libelle: "Mes formalités" }}
          />

          {/* Le paiement se confirme là où l'on arrive, sans fenêtre à refermer. */}
          {issue === "regle" && (
            <p className={styles.reglementConfirme}>
              Paiement effectué. Votre dossier est confié à un avocat : il relit le
              procès-verbal et les statuts à jour, et vous écrit si quelque chose doit
              être repris.
            </p>
          )}

          {/*
            Les documents au centre, l'avancement à côté : le gabarit de la création.

            Trois onglets rangeaient la même page en trois écrans. L'avancement occupait
            le centre en grand - alors qu'il ne se lit qu'une fois, et qu'on n'y fait
            rien - et ce que l'avocat relit se trouvait derrière un onglet, atteint par
            un lien « Voir les documents » posé dans la colonne. Deux clics pour voir ses
            actes, sur un dossier où c'est la seule chose qu'on vient regarder.

            La création montre tout d'un écran depuis toujours : ses actes au centre, les
            échanges dessous, l'avancement en compact dans la colonne. C'est le même
            dossier réglé, il se lit de la même façon.
          */}
          <div className={styles.suiviColonnes}>
            <div className={styles.suiviPrincipal}>
              <section className={styles.suiviSection}>
                <h2 className={styles.suiviSectionTitre}>Mes documents</h2>
                <p className={styles.suiviSectionTexte}>
                  Les actes produits pour votre modification, et les pièces que vous avez
                  déposées.
                </p>
                <DocumentsDuDossier dossier={dossierId} documents={documents} />
              </section>

              <section className={styles.suiviSection}>
                <h2 className={styles.suiviSectionTitre}>Échanges avec le cabinet</h2>
                <FilDuDossier dossier={dossierId} moi={utilisateur.id} messages={fil} />
              </section>
            </div>

            <aside className={styles.suiviColonne}>
              {/*
                L'avancement en compact, en tête de colonne.

                Il occupait le centre avec l'explication de chaque étape sous son
                intitulé - six paragraphes pour dire qu'il n'y a rien à faire. En
                colonne, il garde le pourcentage, la carte de ce qui attend le client et
                la suite des étapes, et laisse le centre à ce qu'on vient voir.
              */}
              <Suivi
                compact
                etat={etat}
                demande={await derniereDemandeDeCorrections(dossierId)}
                lienAction={base}
                lienMessagerie={base}
              />

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
    air: modification.air,
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
      <header className={`${styles.entetePage} ${styles.entetePageLarge}`}>
        <div>
          <h1 className={styles.entetePageTitre}>
            {modification.societe.denomination || "Modifier ma société"}
          </h1>
          <p className={styles.entetePageSousTitre}>
            {modification.societe.denomination
              ? "Modification de société"
              : "Siège, dénomination, dirigeant, capital."}
          </p>
        </div>
      </header>

      <div
        className={`${styles.content} ${styles.contentSousEntete} ${styles.contentColonne}`}
      >
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
