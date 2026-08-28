import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { mesSocietes } from "@/infrastructure/db/depots/societes";
import {
  etatDeLaSociete,
  libelleDesFormalites,
  libelleDuPortefeuille,
} from "@/domain/societe/portefeuille";
import { echeancesDesDossiers } from "@/domain/formalite/accueil";
import { sirenLisible } from "@/domain/modification/annonce";
import { accorder } from "@/domain/formalite/etapes";
import { dateEnTete } from "@/lib/dates";
import { Vide } from "@/components/liste/Vide";
import { Registre, type LigneDuRegistre } from "./Registre";
import styles from "./Societes.module.css";

export const metadata: Metadata = {
  title: "Mes sociétés - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Le portefeuille de sociétés.
 *
 * Une société n'est pas une formalité. « Mes formalités » liste des opérations, la
 * bibliothèque des fichiers ; cette page liste les entreprises elles-mêmes, et répond
 * à la seule question que les deux autres laissent sans réponse : qu'est-ce que je
 * possède, et dans quel état ?
 *
 * En registre, non en galerie. Les grandes cartes conviennent à trois éléments qu'on
 * regarde ; à huit sociétés, on ne les regarde plus, on les cherche - et l'on veut
 * alors des colonnes alignées, où l'œil descend un état ou une échéance sans relire
 * chaque bloc.
 */
export default async function Societes() {
  const utilisateur = await exigerUtilisateur();
  const societes = await mesSocietes(utilisateur);

  /*
   * Ce que chaque ligne montre, calculé ici.
   *
   * Le filtre et la recherche répondent à la frappe : ils vivent au navigateur. Ce
   * qu'ils trient - l'état, le nombre de formalités, la prochaine échéance - se
   * calcule une fois, là où sont les dossiers.
   */
  const lignes: LigneDuRegistre[] = societes.map((societe) => {
    const etat = etatDeLaSociete(societe);
    const prochaine =
      echeancesDesDossiers(
        societe.dossiers.map((d) => ({
          id: d.id,
          type: d.type,
          societe: societe.denomination,
          status: d.status,
          limiteDepot: d.limiteDepot,
          termeDuMandat: d.termeDuMandat,
        }))
      )[0] ?? null;

    return {
      cle: societe.cle,
      denomination: societe.denomination,
      forme: societe.forme ?? "Société",
      siren: societe.siren ? sirenLisible(societe.siren) : null,
      etat: { cle: etat.etat, libelle: etat.libelle, ton: etat.ton },
      formalites: libelleDesFormalites(societe.dossiers.length, societe.enCours),
      enCours: societe.enCours,
      echeance: prochaine
        ? {
            intitule: prochaine.intitule,
            quand: prochaine.limite.split("-").reverse().join("/"),
          }
        : null,
    };
  });

  return (
    <main className={styles.page}>
      {/*
        La même ligne de tête que la bibliothèque de documents.

        Le titre et sa phrase tenaient dans un bloc de gauche, et la date s'alignait sur
        le milieu des deux : elle flottait entre les lignes au lieu de se poser sur celle
        du titre. Ailleurs, le bandeau ne porte que le titre et la date ; la phrase court
        dessous, sur toute la largeur.
      */}
      <div className={styles.entete}>
        <h1 className={styles.titre}>{libelleDuPortefeuille(societes.length)}</h1>
        <span className={styles.date}>{dateEnTete()}</span>
      </div>

      <p className={styles.introduction}>
        {societes.length === 0
          ? "Vos sociétés apparaîtront ici dès votre première formalité."
          : accorder(societes.length, "société suivie", "sociétés suivies") +
            (societes.reduce((n, s) => n + s.enCours, 0) > 0
              ? " · " +
                accorder(
                  societes.reduce((n, s) => n + s.enCours, 0),
                  "formalité en cours",
                  "formalités en cours"
                )
              : "")}
      </p>

      <div className={styles.contenu}>
        {societes.length === 0 ? (
          <Vide
            icone="/creation"
            texte={
              <>
                <strong>Aucune société pour l&apos;instant.</strong> Créez-en une, ou
                lancez une formalité sur une société existante : elle prendra sa place
                ici.
              </>
            }
          />
        ) : (
          <Registre societes={lignes} />
        )}
      </div>
    </main>
  );
}
