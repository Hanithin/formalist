import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { mesSocietes } from "@/infrastructure/db/depots/societes";
import { mesDossiers } from "@/infrastructure/db/depots/dossiers";
import { contextesDesDossiers } from "@/infrastructure/db/depots/contexte-dossier";
import { etapeCourte } from "@/domain/formalite/actions";
import { ordonnerLeRegistre, resumeDuPortefeuille } from "@/domain/societe/registre";
import { etatDeLaSociete, libelleDuPortefeuille } from "@/domain/societe/portefeuille";
import { echeancesDesDossiers } from "@/domain/formalite/accueil";
import { sirenLisible } from "@/domain/modification/annonce";
import { EnTetePage } from "@/components/page/EnTetePage";
import { delaiLisible, obligationsDeLaSociete } from "@/domain/societe/obligations";
import { Vide } from "@/components/liste/Vide";
import { Fiche } from "./Fiche";
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
  const [societes, dossiers] = await Promise.all([
    mesSocietes(utilisateur),
    mesDossiers(utilisateur),
  ]);

  /*
   * Où en est la formalité de chaque société.
   *
   * La colonne comptait - « 1 en cours » sur sept lignes sur huit - là où « En révision
   * par un avocat » ou « Compléter les informations » dit qui a la main. C'est le même
   * calcul que « Mes formalités » : il vit dans le domaine, et lit les contextes que
   * l'infrastructure assemble en deux requêtes pour l'ensemble.
   */
  const contextes = await contextesDesDossiers(dossiers);
  const etapeParDossier = new Map<number, string>();
  for (const [id, contexte] of contextes) etapeParDossier.set(id, etapeCourte(contexte));

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

    /*
     * L'étape du dossier en cours, quand il y en a un.
     *
     * Le plus récemment modifié : c'est celui sur lequel on travaille, et une société
     * n'en a qu'un ouvert en pratique.
     */
    const ouvert = societe.dossiers
      .filter((d) => d.status !== "terminee" && d.status !== "annulee")
      .sort((a, b) => new Date(b.majLe).getTime() - new Date(a.majLe).getTime())[0];

    return {
      cle: societe.cle,
      denomination: societe.denomination,
      forme: societe.forme ?? "Société",
      siren: societe.siren ? sirenLisible(societe.siren) : null,
      etat: { cle: etat.etat, libelle: etat.libelle, ton: etat.ton },
      etape: ouvert ? (etapeParDossier.get(ouvert.id) ?? null) : null,
      echeance: prochaine
        ? {
            intitule: prochaine.intitule,
            quand: prochaine.limite.split("-").reverse().join("/"),
            // Le retard se voit dans la liste, sans avoir à ouvrir la fiche.
            delai: delaiLisible(prochaine.limite),
            limite: prochaine.limite,
            enRetard: prochaine.limite < new Date().toISOString().slice(0, 10),
          }
        : null,
    };
  });

  /*
   * Une seule société : sa fiche, directement.
   *
   * La liste serait alors un intermédiaire inutile - une ligne qu'il faut cliquer pour
   * voir quoi que ce soit, sur une page qui n'annonce rien d'autre. Le domaine s'y
   * préparait déjà : `libelleDuPortefeuille` bascule sur « Ma société » au singulier,
   * parce qu'un client qui n'en a qu'une lit « Mes sociétés » comme un menu qui ne le
   * concerne pas.
   */
  /*
   * Trié par ce qui presse, non par date de création.
   *
   * L'ordre venait de la base - `created_at desc` sur les dossiers - ni alphabétique,
   * ni par état, ni par urgence : la seule ligne actionnable du registre pouvait se
   * trouver n'importe où.
   */
  const registre = ordonnerLeRegistre(lignes);

  if (societes.length === 1) return <Fiche cle={societes[0].cle} />;

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
        /*
          La phrase compte ce sur quoi on peut agir.

          Elle décrivait le tableau - « Vos sociétés, leurs formalités en cours et leurs
          prochaines échéances » - plutôt que de dire ce qu'il contient.
        */
        sousTitre={resumeDuPortefeuille(registre)}
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
          <Registre societes={registre} />
        )}
      </div>
    </main>
  );
}
