import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirSociete } from "@/infrastructure/db/depots/societes";
import { echeancesDesDossiers } from "@/domain/formalite/accueil";
import { adresseDuDossier, libelleDuType } from "@/domain/formalite/liste";
import { sirenLisible } from "@/domain/modification/annonce";
import { avancement, etatCourt } from "@/domain/formalite/etapes";
import {
  dateEtHeure,
  dateRelative,
  phraseJournal,
  seSuffitAElleMeme,
} from "@/domain/formalite/journal";
import styles from "../Societes.module.css";

export const metadata: Metadata = {
  title: "Société - Formalist",
  robots: { index: false, follow: false },
};

const JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function dateLisible(iso: string): string {
  const date = new Date(iso + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? iso : JOUR.format(date);
}

/**
 * La fiche d'une société.
 *
 * Elle rassemble ce que les autres pages montrent séparément - les formalités, les
 * pièces, les échéances - mais rapporté à une seule entreprise. Ce n'est pas une
 * troisième liste : c'est la même information vue par l'entité plutôt que par
 * l'opération ou par le fichier, et chaque section renvoie à la liste complète.
 */
export default async function FicheSociete({
  params,
}: {
  params: Promise<{ cle: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { cle } = await params;

  const ouverte = await ouvrirSociete(utilisateur, cle);
  if (!ouverte) notFound();

  const { societe, etat, documents, journal } = ouverte;

  const echeances = echeancesDesDossiers(
    societe.dossiers.map((d) => ({
      id: d.id,
      type: d.type,
      societe: societe.denomination,
      status: d.status,
      limiteDepot: d.limiteDepot,
      termeDuMandat: d.termeDuMandat,
    }))
  );

  const recherche = encodeURIComponent(societe.denomination);

  return (
    <main className={styles.page}>
      <div className={styles.fil}>
        <Link href="/societes">Mes sociétés</Link>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{societe.denomination}</span>
      </div>

      <div className={styles.contenu}>
        {/*
          L'identité et les gestes, dans une même carte.
          Le nom flottait sur le fond gris au-dessus de trois blocs blancs : la page
          commençait par du vide. Et l'on ne pouvait rien faire d'une société depuis sa
          fiche - il fallait ressortir par le bouton de la colonne.
        */}
        <section className={styles.identite}>
          <div className={styles.identiteTete}>
            <div>
              <h1 className={styles.titre}>{societe.denomination}</h1>
              <p className={styles.sousTitre}>
                {societe.forme ?? "Société"}
                {societe.siren ? " · SIREN " + sirenLisible(societe.siren) : ""}
              </p>
            </div>
            <span className={`${styles.badge} ${styles["badge-" + etat.ton] ?? ""}`}>
              {etat.libelle}
            </span>
          </div>

          {/*
            Ce qu'il y a, non ce qu'il n'y a pas.
            « Documents 0 · Échéances 0 » occupait la moitié de la carte pour dire deux
            fois rien ; les sections plus bas le disent déjà, avec une phrase. Le nombre
            de formalités reste toujours : une société est là parce qu'elle en a une.
          */}
          <dl className={styles.identiteFaits}>
            {[
              { cle: "formalites", libelle: "Formalités", valeur: societe.dossiers.length },
              { cle: "en-cours", libelle: "En cours", valeur: societe.enCours },
              { cle: "documents", libelle: "Documents", valeur: documents.length },
              { cle: "echeances", libelle: "Échéances", valeur: echeances.length },
            ]
              .filter((fait, rang) => rang === 0 || fait.valeur > 0)
              .map((fait) => (
                <div key={fait.cle}>
                  <dt>{fait.libelle}</dt>
                  <dd>{fait.valeur}</dd>
                </div>
              ))}
          </dl>

          {/*
            Les gestes possibles sur une société.
            Ils ne sont pas préremplis : chaque parcours redemande la société, parce
            qu'il la cherche au registre pour en tirer les mentions à jour. Les poser
            ici évite de ressortir par la colonne pour y revenir.
          */}
          {etat.etat !== "radiee" && (
            <div className={styles.identiteGestes}>
              <Link href="/modification" className={styles.geste}>
                Modifier la société
              </Link>
              <Link href="/depot-des-comptes" className={styles.geste}>
                Déposer les comptes
              </Link>
              <Link href="/contrats" className={styles.geste}>
                Rédiger un contrat
              </Link>
              <Link href="/fermeture" className={styles.gesteSortie}>
                Fermer la société
              </Link>
            </div>
          )}
        </section>

        <div className={styles.colonnes}>
          <div>
            {/* L'historique : toutes ses formalités, la plus récente d'abord. */}
            <section className={styles.bloc} aria-labelledby="historique">
              <div className={styles.blocTete}>
                <h2 id="historique" className={styles.blocTitre}>
                  Formalités
                </h2>
                <Link href={"/formalites?societe=" + recherche} className={styles.blocLien}>
                  Voir dans la liste
                </Link>
              </div>

              <ul className={styles.lignes}>
                {societe.dossiers.map((dossier) => {
                  /*
                   * L'état court se lit sur le statut et sur qui l'on attend.
                   *
                   * Un dossier arrêté à l'étape 1 attend le client ; un dossier
                   * transmis attend le cabinet. Le portefeuille ne calcule pas les
                   * actions attendues - c'est le travail de l'accueil - et retient
                   * qu'un dossier en cours est en cours.
                   */
                  const court = etatCourt({
                    status: dossier.status,
                    attendLeClient: dossier.status === "en_cours",
                  });
                  return (
                    <li key={dossier.id} className={styles.ligne}>
                      <Link
                        href={adresseDuDossier({ id: dossier.id, type: dossier.type })}
                        className={styles.ligneLien}
                      >
                        <span className={styles.ligneCorps}>
                          <span className={styles.ligneTitre}>
                            {libelleDuType(dossier.type) ?? "Formalité"}
                          </span>
                          <span className={styles.ligneDetail}>
                            {court.libelle} ·{" "}
                            {avancement(dossier.etapeAffichee, dossier.offre)} %
                          </span>
                        </span>
                        <span className={styles.ligneQuand}>
                          {dateRelative(new Date(dossier.majLe))}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Les pièces de cette société, non celles du compte. */}
            <section className={styles.bloc} aria-labelledby="pieces">
              <div className={styles.blocTete}>
                <h2 id="pieces" className={styles.blocTitre}>
                  Documents
                </h2>
                <Link href={"/documents?societe=" + recherche} className={styles.blocLien}>
                  Ouvrir la bibliothèque
                </Link>
              </div>

              {documents.length === 0 ? (
                <p className={styles.vide}>Aucun document pour cette société.</p>
              ) : (
                <ul className={styles.lignes}>
                  {documents.slice(0, 8).map((document) => (
                    <li key={document.id} className={styles.ligne}>
                      <Link href={"/documents?societe=" + recherche} className={styles.ligneLien}>
                        <span className={styles.ligneCorps}>
                          <span className={styles.ligneTitre}>{document.nom}</span>
                          <span className={styles.ligneDetail}>
                            {document.origine === "entreprise" ? "Produit par le cabinet" : "Déposé par vous"}
                          </span>
                        </span>
                        <span className={styles.ligneQuand}>
                          {document.creeLe ? dateRelative(new Date(document.creeLe)) : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className={styles.laterale}>
            <section className={styles.bloc} aria-labelledby="echeances">
              <div className={styles.blocTete}>
                <h2 id="echeances" className={styles.blocTitre}>
                  Échéances
                </h2>
              </div>

              {echeances.length === 0 ? (
                <p className={styles.vide}>
                  Aucune échéance connue pour cette société.
                </p>
              ) : (
                <ul className={styles.echeances}>
                  {echeances.map((echeance) => (
                    <li key={echeance.cle} className={styles.echeance}>
                      <span className={styles.echeanceIntitule}>{echeance.intitule}</span>
                      <span className={styles.echeanceDate}>{dateLisible(echeance.limite)}</span>
                      <Link href={echeance.lien} className={styles.echeanceGeste}>
                        {echeance.bouton}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.bloc} aria-labelledby="journal">
              <div className={styles.blocTete}>
                <h2 id="journal" className={styles.blocTitre}>
                  Historique
                </h2>
              </div>

              {journal.length === 0 ? (
                <p className={styles.vide}>Rien ne s&apos;est encore passé.</p>
              ) : (
                <ul className={styles.journal}>
                  {journal.slice(0, 8).map((entree, rang) => {
                    const cestMoi = entree.auteurRole === "user";
                    const qui = cestMoi ? "Vous" : (entree.auteur ?? "Formalist");
                    return (
                      <li key={rang} className={styles.entree}>
                        <span className={styles.entreeTexte}>
                          {seSuffitAElleMeme(entree) ? (
                            entree.valeur
                          ) : (
                            <>
                              {qui} {phraseJournal(entree, cestMoi)}
                            </>
                          )}
                        </span>
                        {/* L'heure autant que le jour : c'est un historique, on y cherche l'ordre. */}
                        <span className={styles.entreeQuand}>{dateEtHeure(entree.quand)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
