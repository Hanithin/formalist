import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirSociete } from "@/infrastructure/db/depots/societes";
import { echeancesDesDossiers } from "@/domain/formalite/accueil";
import { adresseDuDossier, libelleDuType } from "@/domain/formalite/liste";
import { sirenLisible } from "@/domain/modification/annonce";
import { accorder, libelleDossier } from "@/domain/formalite/etapes";
import {
  dateEtHeure,
  dateRelative,
  phraseJournal,
  seSuffitAElleMeme,
  ditQuelqueChose,
} from "@/domain/formalite/journal";
import { obligationsDeLaSociete } from "@/domain/societe/obligations";
import { CeQuiVousAttend, type AVenir } from "./CeQuiVousAttend";
import styles from "./Societes.module.css";

/**
 * La fiche d'une société.
 *
 * Elle rassemble ce que les autres pages montrent séparément - les formalités, les
 * pièces, les échéances - mais rapporté à une seule entreprise. Ce n'est pas une
 * troisième liste : c'est la même information vue par l'entité plutôt que par
 * l'opération ou par le fichier, et chaque section renvoie à la liste complète.
 */
/**
 * Le chevron d'une ligne cliquable.
 *
 * Ces lignes menaient au dossier ou à la bibliothèque sans le dire : ni fond au
 * survol, ni signe à droite, elles se lisaient comme une liste de faits. Le chevron
 * paraît au survol et au focus clavier, comme sur le registre des sociétés, où la
 * même flèche annonce la même chose.
 */
function Chevron() {
  return (
    <svg
      className={styles.ligneChevron}
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

/** L'icône d'un document, celle de l'écran des actes. */
function Document() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

/**
 * La fiche d'une société, rendue par deux routes.
 *
 * `/societes/<cle>` l'affiche avec son fil d'Ariane. `/societes` l'affiche telle
 * quelle quand le compte n'a qu'une société : la liste serait alors un intermédiaire
 * inutile, une ligne qu'il faut cliquer pour voir quoi que ce soit. Le fil disparaît
 * dans ce cas - il renverrait vers une page qui montre déjà la fiche.
 */
export async function Fiche({ cle }: { cle: string }) {
  const utilisateur = await exigerUtilisateur();

  const ouverte = await ouvrirSociete(utilisateur, cle);
  if (!ouverte) notFound();

  const { societe, etat, combien, documents, journal } = ouverte;

  /*
   * L'historique ne garde que ce qui apprend quelque chose.
   *
   * Il alignait huit fois « Hani Madfai a mis à jour le dossier », à la minute près :
   * c'est la phrase par défaut, celle où tombent les écritures internes du cabinet.
   */
  const racontees = journal.filter(ditQuelqueChose);

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

  /*
   * Ce que la société doit du seul fait d'exister.
   *
   * Les échéances ci-dessus viennent de ses dossiers ouverts ; celles-ci de la loi et
   * de la clôture de son exercice. La fiche annonçait « Aucune échéance connue » à
   * toutes les sociétés du compte parce qu'elle ne connaissait que les premières.
   */
  const aVenir: AVenir[] = [
    ...echeances.map((e) => ({
      cle: e.cle,
      intitule: e.intitule,
      limite: e.limite,
      bouton: e.bouton,
      lien: e.lien,
    })),
    ...obligationsDeLaSociete(societe),
  ].sort((a, b) => (a.limite ?? "9999").localeCompare(b.limite ?? "9999"));

  const recherche = encodeURIComponent(societe.denomination);

  return (
    <main className={styles.page}>
      {/*
        Le fil : ce qui se clique se voit, ce qui ne se clique pas se lit.

        Les deux membres avaient le même gris et la même graisse, séparés d'un chevron
        de la même couleur : rien ne disait lequel était un lien, ni où l'on se
        trouvait. Le retour devient une pastille qui réagit au survol, avec sa flèche ;
        le nom de la société prend le noir du titre, puisque c'est la page courante.
      */}
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
              {/*
                Le nom et l'état sur la même ligne.

                L'état se tenait dans l'angle de la carte, à neuf cents pixels du nom
                qu'il qualifie : on lisait « CABINET ROUSSEAU » puis, bien plus tard,
                « Active », sans que rien ne dise que le second parlait du premier.
              */}
              <div className={styles.identiteNom}>
                <h1 className={styles.titre}>{societe.denomination}</h1>
                <span className={`${styles.badge} ${styles["badge-" + etat.ton] ?? ""}`}>
                  {etat.libelle}
                </span>
              </div>

              {/*
                Ce que la société est, puis ce qu'elle a.

                Les chiffres vivaient dans une liste de définitions : sur une société
                qui n'a qu'une formalité, elle occupait une rangée entière pour
                « FORMALITÉS » et « 1 », avec neuf cents pixels de blanc à droite.
              */}
              <p className={styles.sousTitre}>
                {[
                  societe.forme ?? "Société",
                  societe.siren ? "SIREN " + sirenLisible(societe.siren) : null,
                  accorder(societe.dossiers.length, "formalité", "formalités"),
                  societe.enCours > 0 ? societe.enCours + " en cours" : null,
                  documents.length > 0
                    ? accorder(documents.length, "document", "documents")
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>

            {/*
              Le retour, seul dans le coin depuis que l'état a rejoint le nom.

              Il ne paraît que s'il mène quelque part : à une seule société, /societes
              affiche déjà cette fiche, et le retour boucherait sur lui-même.
            */}
            {combien > 1 && (
              <Link href="/societes" className={styles.retour}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Toutes mes sociétés
              </Link>
            )}
          </div>

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

        <CeQuiVousAttend obligations={aVenir} />

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
                   * Le même mot qu'ailleurs, et rien d'autre.
                   *
                   * La ligne disait « En cours · 100 % » : deux mesures qui se
                   * contredisent - un dépôt de comptes chez le greffe est à cent pour
                   * cent du chemin du client, et il n'est pas « en cours » au sens où
                   * quelqu'un le remplirait. La carte de « Mes formalités » dit
                   * « Comptes déposés » ; la fiche de la société dit la même chose.
                   */
                  const etatDuDossier = libelleDossier({
                    type: dossier.type,
                    status: dossier.status,
                    phase: dossier.etapeAffichee,
                    sousPhase: dossier.sousPhase,
                  });
                  return (
                    <li key={dossier.id}>
                      <Link
                        href={adresseDuDossier({ id: dossier.id, type: dossier.type })}
                        className={styles.ligneLien}
                      >
                        <span className={styles.ligneCorps}>
                          <span className={styles.ligneTitre}>
                            {libelleDuType(dossier.type) ?? "Formalité"}
                          </span>
                          <span className={styles.ligneDetail}>{etatDuDossier}</span>
                        </span>
                        <span className={styles.ligneFin}>
                          <span className={styles.ligneQuand}>
                            {dateRelative(new Date(dossier.majLe))}
                          </span>
                          <Chevron />
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
                    <li key={document.id}>
                      <Link href={"/documents?societe=" + recherche} className={styles.ligneLien}>
                        {/* La même icône que sur l'écran des actes : un document s'y
                            reconnaît avant d'être lu. */}
                        <span className={styles.ligneIcone} aria-hidden="true">
                          <Document />
                        </span>

                        <span className={styles.ligneCorps}>
                          <span className={styles.ligneTitre}>{document.nom}</span>
                          {/*
                            Qui l'a écrit, et non d'où il vient.

                            La ligne lisait `origine`, qui dit seulement si le document
                            est rattaché à un dossier : la pièce d'identité déposée par
                            le client s'annonçait donc « Produit par le cabinet ».
                          */}
                          <span className={styles.ligneDetail}>
                            {document.parLeCabinet ? "Produit par le cabinet" : "Déposé par vous"}
                          </span>
                        </span>
                        <span className={styles.ligneFin}>
                          <span className={styles.ligneQuand}>
                            {document.creeLe ? dateRelative(new Date(document.creeLe)) : ""}
                          </span>
                          <Chevron />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className={styles.laterale}>
            {/*
              Les échéances ont quitté cette colonne pour la tête de page.

              Elles y disaient « Aucune échéance connue pour cette société » sur toutes
              les sociétés du compte, pendant que le bloc de tête en annonce désormais
              deux : la fiche se serait contredite à vingt lignes d'écart. Une seule
              place, et c'est la première - on ouvre une fiche pour savoir ce qui reste
              à faire.
            */}
            <section className={styles.bloc} aria-labelledby="journal">
              <div className={styles.blocTete}>
                <h2 id="journal" className={styles.blocTitre}>
                  Historique
                </h2>
              </div>

              {racontees.length === 0 ? (
                <p className={styles.vide}>Rien à signaler pour l&apos;instant.</p>
              ) : (
                <ul className={styles.journal}>
                  {racontees.slice(0, 8).map((entree, rang) => {
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
