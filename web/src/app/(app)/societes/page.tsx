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
import { EnTetePage } from "@/components/page/EnTetePage";
import { delaiLisible, obligationsDeLaSociete } from "@/domain/societe/obligations";
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
    /*
     * Deux sources, et la plus proche l'emporte.
     *
     * Les dossiers portent les échéances qu'ils ont ouvertes - un dépôt en cours, un
     * mandat de liquidateur. La société, elle, porte celles que la loi lui impose du
     * seul fait d'exister : approuver ses comptes, puis les déposer. La colonne
     * affichait un tiret partout parce qu'elle ne connaissait que les premières, et
     * qu'une société créée n'en a aucune.
     */
    const desDossiers = echeancesDesDossiers(
      societe.dossiers.map((d) => ({
        id: d.id,
        type: d.type,
        societe: societe.denomination,
        status: d.status,
        limiteDepot: d.limiteDepot,
        termeDuMandat: d.termeDuMandat,
      }))
    ).map((e) => ({ intitule: e.intitule, limite: e.limite }));

    const deLaSociete = obligationsDeLaSociete(societe)
      .filter((o) => o.limite)
      .map((o) => ({ intitule: o.intituleCourt, limite: o.limite! }));

    const prochaine =
      [...desDossiers, ...deLaSociete].sort((a, b) => a.limite.localeCompare(b.limite))[0] ??
      null;

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
            // Le retard se voit dans la liste, sans avoir à ouvrir la fiche.
            delai: delaiLisible(prochaine.limite),
            enRetard: prochaine.limite < new Date().toISOString().slice(0, 10),
          }
        : null,
    };
  });

  return (
    <main className={styles.page}>
      {/*
        La phrase ne recompte plus.

        Elle annonçait « 7 sociétés suivies · 6 formalités en cours » - deux nombres que
        les pastilles du filtre disent juste en dessous, à cliquer près. Elle dit
        désormais ce que les colonnes du registre apportent, ce qu'aucune pastille ne
        dit.
      */}
      <EnTetePage
        titre={libelleDuPortefeuille(societes.length)}
        sousTitre={
          societes.length === 0
            ? "Vos sociétés apparaîtront ici dès votre première formalité."
            : "Vos sociétés, leurs formalités en cours et leurs prochaines échéances."
        }
      />

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
