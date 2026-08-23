import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeBord, focusDuDossier } from "@/infrastructure/db/depots/tableau-de-bord";
import { salutation } from "@/domain/formalite/actions";
import {
  attentionRequise,
  dossierAReprendre,
  echeancesDesDossiers,
  gesteDuDossier,
  indicateurs,
  tonDuDossier,
  type DossierDAccueil,
} from "@/domain/formalite/accueil";
import { avancement, nomEtape, nomsDEtapes } from "@/domain/formalite/etapes";
import { adresseDuDossier, libelleDuType } from "@/domain/formalite/liste";
import { dateEnTete } from "@/lib/dates";
import { Accueil } from "./Accueil";
import { DocumentsDuDossier, FeuilleDeRoute, Frise, Interlocuteur } from "./Focus";
import {
  ActiviteRecente,
  Attention,
  Echeances,
  FormalitesEnCours,
  Indicateurs,
  Reprendre,
  type CarteFormalite,
} from "./Sections";
import styles from "./TableauDeBord.module.css";

export const metadata: Metadata = {
  title: "Tableau de bord - Formalist",
  robots: { index: false, follow: false },
};

/** Le nombre de vignettes montrées : au-delà, la liste des formalités prend le relais. */
const FORMALITES_MONTREES = 3;

/** « SASU STUDIO KERN » : la forme précède le nom, comme partout ailleurs. */
function nomComplet(dossier: { forme: string | null; societe: string }): string {
  return dossier.forme ? dossier.forme.toUpperCase() + " " + dossier.societe : dossier.societe;
}

/**
 * L'accueil répond à quatre questions, dans cet ordre :
 *
 *   1. ai-je quelque chose à faire ?
 *   2. que puis-je reprendre tout de suite ?
 *   3. qu'est-ce qui est en cours ?
 *   4. qu'est-ce qui arrive bientôt ?
 *
 * Il répondait surtout à une cinquième, qui n'intéresse personne : « voici la liste de
 * vos dossiers, trois fois ». Un même dossier figurait dans le bandeau de reprise,
 * dans les vignettes et dans la liste des attentes - un compte à vingt dossiers
 * affichait donc vingt lignes identiques sans jamais dire ce qui pressait.
 *
 * Chaque réponse ne se donne désormais qu'une fois : le dossier mis en avant est
 * retiré de la liste des actions, et les vignettes montrent des formalités - ce
 * qu'elles ont toujours été, malgré le titre « Vos sociétés » qui les coiffait.
 */
export default async function TableauDeBord() {
  const utilisateur = await exigerUtilisateur();
  const { societes, activite } = await tableauDeBord(utilisateur);

  const prenom = utilisateur.nom.split(" ")[0];

  // Un compte sans dossier n'a rien à savoir : il a quelque chose à commencer.
  if (societes.length === 0) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <Accueil salutation={salutation() + " " + prenom} />
        </div>
      </main>
    );
  }

  const dossiers = societes as DossierDAccueil[];
  const chiffres = indicateurs(dossiers);
  const aReprendre = dossierAReprendre(dossiers);
  const actions = attentionRequise(dossiers, aReprendre?.id ?? null);
  const echeances = echeancesDesDossiers(
    societes.map((s) => ({
      id: s.id,
      type: s.type,
      societe: nomComplet(s),
      status: s.status,
      limiteDepot: s.limiteDepot,
      termeDuMandat: s.termeDuMandat,
    }))
  );

  /*
   * Le dossier s'ouvre là où on le reprend, à l'adresse que son type commande.
   *
   * Toutes les lignes menaient au parcours de création : une modification ouverte
   * depuis l'accueil arrivait sur le formulaire d'une société à créer.
   */
  const parIdentifiant = new Map(societes.map((s) => [s.id, s.type ?? null]));
  const lienDu = (id: number) => adresseDuDossier({ id, type: parIdentifiant.get(id) ?? null });

  const enCours = dossiers.filter((d) => d.status !== "terminee" && d.status !== "archive");
  const cartes: CarteFormalite[] = enCours.slice(0, FORMALITES_MONTREES).map((dossier) => {
    const etat = tonDuDossier(dossier);
    return {
      id: dossier.id,
      type: libelleDuType(dossier.type) ?? "Formalité",
      societe: nomComplet(dossier),
      pourcentage: avancement(dossier.etapeAffichee, dossier.offre),
      etat: etat.libelle,
      ton: etat.ton,
      geste: gesteDuDossier(dossier),
      lien: lienDu(dossier.id),
    };
  });

  /*
   * Le dossier unique garde ses détails.
   *
   * La frise des étapes, les pièces déjà déposées et le nom de l'avocat ne se
   * répètent nulle part ailleurs : ils ne relèvent pas de la redondance qu'on vient de
   * supprimer, mais du seul endroit où un client à un dossier voit où il en est. Une
   * requête de plus, et seulement dans ce cas.
   */
  const seul = enCours.length === 1 ? enCours[0] : null;
  const detail = seul ? await focusDuDossier(utilisateur, seul.id) : null;
  const toutTermine = enCours.length === 0;

  return (
    <main className={styles.page}>
      <header className={styles.entete}>
        <h1 className={styles.enteteTitre}>
          {salutation()} {prenom}
        </h1>
        <span className={styles.enteteDate}>{dateEnTete()}</span>
      </header>

      <div className={styles.content}>
        <Indicateurs chiffres={chiffres} />

        {aReprendre && (
          <Reprendre
            type={libelleDuType(aReprendre.type) ?? "Formalité"}
            societe={nomComplet(aReprendre)}
            pourcentage={avancement(aReprendre.etapeAffichee, aReprendre.offre)}
            prochaineEtape={aReprendre.prochaineEtape}
            bouton={gesteDuDossier(aReprendre)}
            lien={lienDu(aReprendre.id)}
          />
        )}

        <Attention actions={actions} />

        <FormalitesEnCours cartes={cartes} total={enCours.length} />

        {seul && (
          <>
            <Frise
              etapes={nomsDEtapes(seul.offre)}
              etape={seul.etapeAffichee}
              nomEtape={nomEtape(seul.etapeAffichee, seul.offre)}
            />
            <div className={styles.deuxColonnes}>
              <DocumentsDuDossier documents={detail?.documents ?? []} />
              <Interlocuteur avocat={detail?.avocat ?? null} />
            </div>
          </>
        )}

        {/* Tout est fini : on montre ce qui vient après plutôt qu'une page vide. */}
        {toutTermine && <FeuilleDeRoute />}

        <div className={styles.deuxColonnes}>
          <Echeances echeances={echeances} />
          <ActiviteRecente activite={activite} lienDossier={lienDu} />
        </div>
      </div>
    </main>
  );
}
