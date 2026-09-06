import Link from "next/link";
import { FAMILLES } from "@/domain/navigation/parcours";
import { dateLisible } from "./Sections";
import { ToutesLesAttentes } from "./ToutesLesAttentes";
import type { ActionDeDossier } from "@/domain/formalite/actions";
import type { Echeance, Ton } from "@/domain/formalite/accueil";
import styles from "./TableauDeBord.module.css";

/**
 * Ce qu'il y a d'autre, à droite du dossier en tête.
 *
 * Une liste, non une table : on ne compare pas des formalités, on cherche la sienne.
 * Chaque ligne dit le nom, la nature, l'état, et ce que le dossier attend - « 2 actions »
 * plutôt qu'une barre, parce qu'un pourcentage ne se convertit pas en geste.
 *
 * La file de travail qu'elle remplace montrait cinq lignes sur soixante-deux, une
 * colonne d'états, une colonne de pourcentages et une colonne de boutons, et il fallait
 * la lire en entier pour trouver le dossier qu'on avait en tête.
 */

export interface AutreFormalite {
  id: number;
  societe: string;
  nature: string;
  etat: { ton: Ton; libelle: string };
  /**
   * Ce que le dossier attend, en toutes lettres - « Choisir votre banque ».
   *
   * Chaque ligne portait deux marqueurs qui disaient la même chose : la pastille
   * « Action requise » et, dessous, « 1 geste attendu ». Six lignes de suite avec la
   * même valeur : quand tout est marqué urgent, plus rien ne l'est, et l'on ne
   * distinguait aucune ligne des autres. Ce qui les distingue n'est pas qu'elles
   * attendent, c'est ce qu'elles attendent.
   *
   * Nul quand la balle n'est pas dans le camp du client.
   */
  attente: string | null;
  /** Ce qui bloque le dossier, par opposition à ce qui l'avance. */
  bloque: boolean;
  lien: string;
}

export function AutresFormalites({
  formalites,
  total,
  actions,
  echeances,
}: {
  formalites: AutreFormalite[];
  /** Le nombre de formalités ouvertes, celles qu'on ne montre pas comprises. */
  total: number;
  /** Toutes les attentes du compte, pour la fenêtre qui les reprend. */
  actions: ActionDeDossier[];
  /** Seulement celles qui tombent sous trente jours : les autres ne sont pas « à venir ». */
  echeances: Echeance[];
}) {
  return (
    <aside className={styles.coteColonne} aria-label="Vos autres formalités">
      {/* Le voile qui s'allume au défilement : voir `.voileDuHaut`. */}
      <span className={styles.voileDuHaut} aria-hidden="true" />
      <section className={styles.coteCarte}>
        <div className={styles.coteTete}>
          <h2 className={styles.coteTitre}>Vos autres formalités</h2>
          <span className={styles.coteCompte}>{total}</span>
        </div>

        <ul className={styles.coteListe}>
          {formalites.map((formalite) => (
            <li key={formalite.id}>
              <Link href={formalite.lien} className={styles.coteLigne}>
                <span className={styles.coteLigneCorps}>
                  <span className={styles.coteSociete}>{formalite.societe}</span>
                  <span className={styles.coteNature}>
                    {formalite.nature}
                    {formalite.attente && (
                      <>
                        {" · "}
                        <span
                          className={formalite.bloque ? styles.coteAttenteBloquante : undefined}
                        >
                          {formalite.attente}
                        </span>
                      </>
                    )}
                  </span>
                </span>

                {/*
                  Un seul élément à droite, et seulement quand il apprend quelque chose.
                  
                  La pastille en haut et le compte en bas dessinaient un zigzag sur six
                  lignes. Un dossier qui attend le client le dit à gauche, en nommant le
                  geste ; les autres disent qui le tient, ce que la gauche ne dit pas.
                */}
                {!formalite.attente && (
                  <span className={styles.coteMain}>{formalite.etat.libelle}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <div className={styles.cotePied}>
          <Link href="/formalites" className={styles.coteLien}>
            Toutes mes formalités
          </Link>
          {actions.length > 0 && <ToutesLesAttentes actions={actions} plusieurs />}
        </div>
      </section>

      <EcheancesProches echeances={echeances} />
      <CeQueNousFaisons />
    </aside>
  );
}

/**
 * Les échéances proches, et elles seules.
 *
 * La carte listait « 10 mars 2029 » sous un titre « à venir » : trois lignes qui
 * n'appellent rien avant deux ans, à côté d'un dépôt de comptes qui se joue la semaine
 * prochaine. Une échéance qu'on ne peut pas manquer n'a pas sa place au milieu de
 * celles qu'on peut - et le titre dit maintenant l'horizon qu'il montre.
 */
export function EcheancesProches({ echeances }: { echeances: Echeance[] }) {
  if (echeances.length === 0) return null;

  return (
    <section className={styles.coteCarte}>
      <div className={styles.coteTete}>
        <h2 className={styles.coteTitre}>Sous trente jours</h2>
      </div>

      <ul className={styles.coteListe}>
        {echeances.map((echeance) => (
          <li key={echeance.cle}>
            <Link href={echeance.lien} className={styles.coteLigne}>
              <span className={styles.coteLigneCorps}>
                <span className={styles.coteSociete}>{echeance.intitule}</span>
                <span className={styles.coteNature}>{echeance.societe}</span>
              </span>
              <span className={styles.coteDate}>{dateLisible(echeance.limite)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

const OUVERTURE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">';

/**
 * Ce que nous savons faire, en pied de colonne.
 *
 * Les huit parcours s'affichent en entier sur l'accueil d'un compte sans société, et
 * disparaissaient au premier dossier : de là, ils ne vivaient plus que derrière le
 * bouton de la colonne. Le client qui a une SAS depuis mars - celui-là même qui voudra
 * transférer son siège en juin, déposer ses comptes en septembre et peut-être la fermer
 * un jour - n'avait plus nulle part où l'apprendre.
 *
 * En bande de pied de page, il tenait quatre familles côte à côte ; dans une colonne de
 * trois cents pixels, elles se suivent, deux parcours chacune. Ni prix ni durée : on ne
 * choisit pas encore, on apprend que ça existe - et la fenêtre « Nouvelle formalité »
 * les porte quand on choisit vraiment.
 */
function CeQueNousFaisons() {
  return (
    <section className={styles.coteCarte} aria-labelledby="ce-que-nous-faisons">
      <div className={styles.coteTete}>
        <h2 id="ce-que-nous-faisons" className={styles.coteTitre}>
          Que pouvons-nous faire pour vous ?
        </h2>
      </div>

      <div className={styles.coteServices}>
        {FAMILLES.map((famille) => (
          <div key={famille.titre} className={styles.coteFamille}>
            <h3 className={styles.coteFamilleTitre}>{famille.titre}</h3>
            <ul className={styles.coteServicesListe}>
              {famille.parcours.map((parcours) => (
                <li key={parcours.titre}>
                  {/*
                    Un parcours qui n'est pas ouvert se nomme sans se promettre : un lien
                    mort vaut moins qu'un mot grisé.
                  */}
                  {parcours.bientot ? (
                    <span className={styles.coteServiceBientot} aria-disabled="true">
                      <span
                        className={`${styles.coteServiceIcone} ${styles[parcours.teinte]}`}
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: OUVERTURE + parcours.icone + "</svg>" }}
                      />
                      {parcours.titre}
                      <span className={styles.coteServiceMention}>bientôt</span>
                    </span>
                  ) : (
                    <Link href={parcours.lien} className={styles.coteService}>
                      <span
                        className={`${styles.coteServiceIcone} ${styles[parcours.teinte]}`}
                        aria-hidden="true"
                        /* Les tracés sont des données du catalogue, pas une saisie. */
                        dangerouslySetInnerHTML={{ __html: OUVERTURE + parcours.icone + "</svg>" }}
                      />
                      {parcours.titre}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
