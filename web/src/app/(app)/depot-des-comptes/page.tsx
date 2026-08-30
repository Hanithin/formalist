import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirComptes, confirmerComptesAuRetour } from "@/infrastructure/db/depots/comptes";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import { Suivi } from "@/components/formalite/Suivi";
import {
  documentsDuDossier,
  actesDuDossier,
  depotsDuDossier,
} from "@/infrastructure/db/depots/documents";
import { messagesDuDossier } from "@/infrastructure/db/depots/messages";
import { Onglets, ongletDemande } from "@/components/formalite/Onglets";
import {
  DocumentsDuDossier,
  type DocumentDuDossier,
  type EtatDuDocument,
} from "@/components/formalite/DocumentsDuDossier";
import { FilDuDossier, type MessageDuFil } from "@/components/formalite/FilDuDossier";
import { TeteDuDossier } from "@/components/formalite/TeteDuDossier";
import { formaterDate } from "@/lib/dates";
import { Commencer } from "./Commencer";
import { Parcours } from "./Parcours";
import styles from "../modification/Modification.module.css";

export const metadata: Metadata = {
  title: "Dépôt des comptes annuels - Formalist",
  robots: { index: false, follow: false },
};

/**
 * L'approbation et le dépôt des comptes annuels.
 *
 * Sans dossier en cours, la page en ouvre un : la société se choisit à la première
 * étape, par recherche au registre, comme pour une modification. C'est ce qui permet
 * de déposer les comptes d'une société créée ailleurs.
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

/** « 31 décembre 2025 à 14:05 » : la date d'un message, dans le fil. */
function quand(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

/** « 31 décembre 2025 », ou la valeur telle quelle si elle n'est pas une date. */
function enClair(valeur: unknown): string | null {
  if (typeof valeur !== "string" || !valeur.trim()) return null;
  const quand = new Date(valeur);
  return Number.isNaN(quand.getTime()) ? valeur : formaterDate(quand);
}

export default async function DepotDesComptes({
  searchParams,
}: {
  searchParams: Promise<{
    dossier?: string;
    etape?: string;
    session?: string;
    paiement?: string;
    regle?: string;
    onglet?: string;
  }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape, session, paiement, regle, onglet } = await searchParams;

  if (!dossier) {
    return (
      <main className={styles.page}>
        {/*
          Le nom de l'écran en tête, à la place du fil d'Ariane.

          « Mes formalités > Dépôt des comptes annuels » l'écrivait en gris clair,
          au-dessus de tout, là où les autres écrans annoncent le leur en vingt-huit
          pixels sur la ligne du logo.
        */}
        <header className={`${styles.entetePage} ${styles.entetePageLarge}`}>
          <div>
            <h1 className={styles.entetePageTitre}>Dépôt des comptes annuels</h1>
            <p className={styles.entetePageSousTitre}>
              Une fois par an, dans les six mois de la clôture.
            </p>
          </div>
        </header>

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
   * Le retour de paiement est relu avant tout affichage.
   *
   * Sans cela, le client revient de sa banque sur la page du devis, sans savoir si
   * quelque chose a été débité - et paie une seconde fois.
   */
  let issue: "annule" | "attente" | undefined;
  if (session) {
    const { paye } = await confirmerComptesAuRetour(utilisateur, dossierId, session);
    /*
     * Un règlement confirmé quitte le formulaire.
     *
     * Le client revenait de sa banque sur l'étape 7, devant le devis qu'il venait de
     * régler et un bouton « Produire les actes » qu'il lui restait à actionner. Les
     * actes sont produits par la confirmation elle-même : il n'a plus rien à faire ici,
     * et la page de suivi est la seule qui ait quelque chose à lui montrer.
     *
     * La redirection sert aussi à sortir la référence de session de l'adresse :
     * rafraîchir la page ne rejoue plus la confirmation, et l'adresse ne se recopie
     * plus avec une référence de paiement dedans.
     */
    if (paye) redirect("/depot-des-comptes?dossier=" + dossierId + "&regle=1");
    issue = "attente";
  } else if (paiement === "annule") {
    issue = "annule";
  }

  const { comptes, dossier: ligne } = await ouvrirComptes(utilisateur, dossierId);
  const nom = comptes.societe.denomination || "Dépôt des comptes annuels";

  /*
   * Un dossier réglé n'a plus rien à saisir, mais il a tout à suivre.
   *
   * Il renvoyait à « Mes formalités », d'où l'on venait justement de cliquer sur sa
   * carte : le clic ne faisait rien, et le client n'avait aucun endroit où voir où en
   * était son dépôt.
   */
  if (comptes.paye) {
    const cloture = enClair(comptes.valeurs.dateCloture);
    const actif = ongletDemande(onglet);
    const base = "/depot-des-comptes?dossier=" + dossierId;

    /*
     * Les documents du dossier, y compris ceux qu'on n'ouvre pas encore.
     *
     * `documentsDuDossier` écarte les actes en relecture, et c'est bien ce qu'il doit
     * faire : leur chemin n'a pas à sortir tant que l'avocat ne les a pas relus. Mais
     * les taire donnerait une liste vide juste après le règlement, alors que les actes
     * sont écrits : ils figurent, sans fichier, marqués comme étant chez l'avocat.
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
         * Un acte du cabinet qui arrive jusqu'ici a été relu.
         *
         * `documentsDuDossier` écarte ceux qui attendent la relecture : ce qui en sort
         * et porte notre signature est donc validé, et le dire vaut mieux que de le
         * laisser deviner.
         */
        etat: (d.uploaded_by === "system" ? "valide" : "depose") as EtatDuDocument,
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
      /* Ce que le client a ajouté depuis cet onglet : il vit au coffre, rattaché ici. */
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
      quand: quand(m.envoyeLe),
    }));

    return (
      <main className={styles.page}>
        {/*
          Le fil d'Ariane a laissé la place au titre.

          « Mes formalités > STERLING PEAK » en gris clair au-dessus de tout : deux
          mots à peine visibles là où l'on cherche le nom du dossier, et le retour se
          visait au pixel. Le titre le dit, et le bouton de retour est à son bout.
        */}
        <div className={`${styles.content} ${styles.contentLarge}`}>
          {/*
            De quel dossier s'agit-il ?

            La page n'avait pour titre qu'un fil d'Ariane en gris clair : rien ne
            disait en gros de quelle société ni de quelle formalité on parlait.
          */}
          <TeteDuDossier
            titre={comptes.societe.denomination || nom}
            mentions={[
              "Dépôt des comptes annuels",
              cloture ? "Exercice clos le " + cloture : null,
            ]}
            retour={{ href: "/formalites", libelle: "Mes formalités" }}
          />

          {regle === "1" && (
            <p className={styles.reglementConfirme} role="status">
              Votre règlement est enregistré et vos actes sont écrits. Un avocat les
              relit, puis vous les retrouverez dans vos documents.
            </p>
          )}

          {/*
            Trois faces, non trois pages.

            Les documents vivaient dans la bibliothèque commune, où il fallait
            retrouver son dossier parmi ceux des autres sociétés, et les messages dans
            la messagerie, où il fallait retrouver le bon fil. Ce qui concerne un
            dossier se lit dans son dossier.
          */}
          <Onglets
            base={base}
            actif={actif}
            comptes={{ documents: documents.length, communication: fil.length }}
          />

          {/*
            La face ouverte à gauche, le dossier à droite.

            La colonne ne change pas d'un onglet à l'autre : on écrit à l'avocat en
            gardant sous les yeux de quelle société et de quel exercice on parle.
          */}
          <div className={styles.suiviColonnes}>
            <div className={styles.suiviPrincipal}>
              {actif === "suivi" && (
                <Suivi
                  etat={await etatDuDossier(ligne)}
                  demande={await derniereDemandeDeCorrections(dossierId)}
                  lienAction={base}
                  lienMessagerie={base + "&onglet=communication"}
                />
              )}

              {actif === "documents" && (
                <DocumentsDuDossier dossier={dossierId} documents={documents} />
              )}

              {actif === "communication" && (
                <FilDuDossier dossier={dossierId} moi={utilisateur.id} messages={fil} />
              )}
            </div>

            <aside className={styles.suiviColonne}>
              <div className={styles.confie}>
                <h2 className={styles.confieTitre}>Votre dépôt</h2>

                <dl className={styles.confieFaits}>
                  <div>
                    <dt>Société</dt>
                    <dd>{comptes.societe.denomination || "À identifier"}</dd>
                  </div>
                  {comptes.societe.siren && (
                    <div>
                      <dt>SIREN</dt>
                      <dd>{comptes.societe.siren}</dd>
                    </div>
                  )}
                  {cloture && (
                    <div>
                      <dt>Exercice clos le</dt>
                      <dd>{cloture}</dd>
                    </div>
                  )}
                </dl>

                <p className={styles.confieTexte}>
                  Vous n&apos;avez rien à remplir : l&apos;avancement dit où en est le
                  dépôt, et vous serez prévenu si quelque chose doit être repris.
                </p>

                <div className={styles.confieLiens}>
                  <Link className={styles.confieLien} href={base + "&onglet=communication"}>
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
                        Une question sur votre dépôt
                      </span>
                    </span>
                    <Chevron />
                  </Link>

                  <Link className={styles.confieLien} href={base + "&onglet=documents"}>
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
                      Voir les documents
                      <span className={styles.confieLienPrecision}>
                        Les actes de ce dépôt
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

  const demandee = Number(etape);
  const etapeInitiale = Number.isInteger(demandee) && demandee >= 1 && demandee <= 7 ? demandee : 1;

  return (
    <main className={styles.page}>
      {/*
        Le nom de l'écran en tête, à la place du fil d'Ariane.

        Quatre choses répondaient à « où suis-je » : le fil, la frise des étapes, la
        pastille « Étape 1 sur 7 » et la colonne, où le service est déjà en
        surbrillance. Le fil était le plus faible des quatre - du gris clair qui ne
        disait rien que la colonne ne dise, et dont le seul rôle propre, repartir vers
        « Mes formalités », est tenu par cette colonne qui ne quitte jamais l'écran.
      */}
      {/* Tant que la société n'est pas choisie, `nom` vaut le nom du service : le
          répéter en sous-titre écrivait deux fois la même ligne. */}
      <header className={`${styles.entetePage} ${styles.entetePageLarge}`}>
        <div>
          <h1 className={styles.entetePageTitre}>{nom}</h1>
          <p className={styles.entetePageSousTitre}>
            {comptes.societe.denomination?.trim()
              ? "Dépôt des comptes annuels"
              : "Une fois par an, dans les six mois de la clôture."}
          </p>
        </div>
      </header>

      <div
        className={`${styles.content} ${styles.contentSousEntete} ${styles.contentColonne}`}
      >
        <Parcours
          dossier={dossierId}
          initial={comptes}
          etapeInitiale={etapeInitiale}
          issueDuPaiement={issue}
          /*
           * Les pièces déjà déposées, relues du serveur à chaque affichage.
           *
           * Une seule pièce est attendue ici - le rapport du commissaire aux comptes,
           * que nous n'écrivons pas - et elle se dépose à l'étape du règlement.
           * Revenir sur l'étape après un dépôt doit montrer ce qui est arrivé, non ce
           * qu'on avait en ouvrant la page.
           */
          piecesDeposees={(await documentsDuDossier(utilisateur, dossierId))
            .filter((d) => d.type)
            .map((d) => ({ type: d.type as string, nom: d.name }))}
        />
      </div>
    </main>
  );
}
