import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeBord, focusDuDossier } from "@/infrastructure/db/depots/tableau-de-bord";
import { phraseDAccueil } from "@/domain/formalite/actions";
import {
  attentionRequise,
  dossierAReprendre,
  echeancesDesDossiers,
  echeancesProches,
  gesteDuDossier,
  indicateurs,
  tonDuDossier,
  type DossierDAccueil,
} from "@/domain/formalite/accueil";
import { avancement, nomEtape, nombreDEtapes, nomsDEtapes } from "@/domain/formalite/etapes";
import { adresseDuDossier, libelleDuType, nomAffichable } from "@/domain/formalite/liste";
import { dateEnTete } from "@/lib/dates";
import { NouvelleFormalite } from "@/components/navigation/NouvelleFormalite";
import { Accueil } from "./Accueil";
import { DocumentsDuDossier, FeuilleDeRoute, Frise, Interlocuteur } from "./Focus";
import {
  ActiviteRecente,
  Attention,
  DocumentsRecents,
  Echeances,
  FileDeTravail,
  Indicateurs,
  LIGNES_MONTREES,
  Reprendre,
  type LigneDeTravail,
} from "./Sections";
import styles from "./TableauDeBord.module.css";

export const metadata: Metadata = {
  title: "Tableau de bord - Formalist",
  robots: { index: false, follow: false },
};

/**
 * « SASU STUDIO KERN » : la forme précède le nom, comme partout ailleurs.
 *
 * Tant que la société n'est pas choisie, le dossier n'a pas de nom à donner. On écrit
 * alors ce qu'il est plutôt que le marqueur « Société à identifier », qui ressemble à
 * un nom et n'en est pas un.
 */
function nomComplet(dossier: {
  forme: string | null;
  societe: string;
  type?: string | null;
}): string {
  const nom = nomAffichable(dossier.societe);
  if (!nom) return "Société à choisir";
  return dossier.forme ? dossier.forme.toUpperCase() + " " + nom : nom;
}

/**
 * L'accueil répond à quatre questions, dans cet ordre :
 *
 *   1. ai-je quelque chose à faire ?
 *   2. que puis-je reprendre tout de suite ?
 *   3. qu'est-ce qui est en cours ?
 *   4. qu'est-ce qui arrive bientôt ?
 *
 * Il y répondait sur une seule colonne, chaque section prenant toute la largeur. Sur un
 * écran large, cela donnait une page haute de deux fois et demie l'écran, avec un tiers
 * de blanc à droite, où il fallait faire défiler pour savoir s'il restait quelque chose.
 *
 * La page tient désormais en deux colonnes. À gauche ce qui appelle un geste - ce qui
 * requiert l'attention, puis la file des dossiers ; à droite ce qui informe - les
 * échéances et l'activité. En tête, le dossier à reprendre et les quatre chiffres, côte
 * à côte : c'est le premier coup d'œil, il doit tenir sans défiler.
 */
export default async function TableauDeBord() {
  const utilisateur = await exigerUtilisateur();
  const { societes, activite, documents, nombreDeDocuments } = await tableauDeBord(utilisateur);

  const prenom = utilisateur.nom.split(" ")[0];

  // Un compte sans dossier n'a rien à savoir : il a quelque chose à commencer.
  if (societes.length === 0) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <Accueil salutation={phraseDAccueil(prenom, 0)} />
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

  const lignes: LigneDeTravail[] = enCours.slice(0, LIGNES_MONTREES).map((dossier) => {
    const etat = tonDuDossier(dossier);
    const nature = libelleDuType(dossier.type) ?? "Formalité";

    return {
      id: dossier.id,
      // « Création SASU » : l'opération d'abord, la forme ensuite.
      type: dossier.forme ? nature + " " + dossier.forme.toUpperCase() : nature,
      /*
       * L'étape ne se chiffre que pour une création.
       *
       * Seul ce parcours numérote de un à cinq ; les autres ont leur propre découpage.
       * Pour eux, la prochaine étape en toutes lettres dit davantage qu'un compteur faux.
       */
      precision:
        dossier.type === "creation" || !dossier.type
          ? "Étape " +
            dossier.etapeAffichee +
            " sur " +
            nombreDEtapes(dossier.offre) +
            " · " +
            nomEtape(dossier.etapeAffichee, dossier.offre)
          : dossier.prochaineEtape,
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
   * La frise des étapes, les pièces déjà déposées et le nom de l'avocat ne se répètent
   * nulle part ailleurs : ils ne relèvent pas de la redondance qu'on a supprimée, mais
   * du seul endroit où un client à un dossier voit où il en est.
   */
  const seul = enCours.length === 1 ? enCours[0] : null;
  const detail = seul ? await focusDuDossier(utilisateur, seul.id) : null;
  const toutTermine = enCours.length === 0;

  return (
    <main className={styles.page}>
      <header className={styles.entete}>
        {/*
          La salutation suit le moment de la journée, comme la page d'origine.
          Réduite à « Bonjour Hani », elle ne disait plus rien qu'un nom déjà connu.
        */}
        <h1 className={styles.enteteTitre}>{phraseDAccueil(prenom, societes.length)}</h1>

        {/* La date à droite, avant le bouton : elle situe, elle n'annonce pas. */}
        <div className={styles.enteteDroite}>
          <span className={styles.enteteDate}>{dateEnTete()}</span>
          <NouvelleFormalite apparence="page" />
        </div>
      </header>

      <div className={styles.content}>
        <Indicateurs
          chiffres={[
            {
              valeur: chiffres.actionsRequises,
              libelle: chiffres.actionsRequises > 1 ? "actions requises" : "action requise",
            },
            {
              valeur: chiffres.enCours,
              libelle: chiffres.enCours > 1 ? "formalités en cours" : "formalité en cours",
            },
            {
              valeur: echeancesProches(echeances).length,
              libelle: "sous trente jours",
            },
            { valeur: nombreDeDocuments, libelle: "documents" },
          ]}
        />

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

        <DocumentsRecents documents={documents} />

        <div className={styles.corps}>
          <div className={styles.colonnePrincipale}>
            <Attention actions={actions} />
            <FileDeTravail lignes={lignes} total={enCours.length} />

            {seul && (
              <>
                <Frise
                  etapes={nomsDEtapes(seul.offre)}
                  etape={seul.etapeAffichee}
                  nomEtape={nomEtape(seul.etapeAffichee, seul.offre)}
                />
                <DocumentsDuDossier documents={detail?.documents ?? []} />
              </>
            )}

            {/* Tout est fini : on montre ce qui vient après plutôt qu'une page vide. */}
            {toutTermine && <FeuilleDeRoute />}
          </div>

          <aside className={styles.colonneLaterale}>
            <Echeances echeances={echeances} />
            <ActiviteRecente activite={activite} lienDossier={lienDu} />
            {seul && <Interlocuteur avocat={detail?.avocat ?? null} />}
          </aside>
        </div>
      </div>
    </main>
  );
}
