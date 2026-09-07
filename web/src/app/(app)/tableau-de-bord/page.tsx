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
  tonDuDossier,
  type DossierDAccueil,
} from "@/domain/formalite/accueil";
import { nomsDEtapes } from "@/domain/formalite/etapes";
import {
  adresseDuDossier,
  libelleCompletDuType,
  libelleDuType,
  nomAffichable,
} from "@/domain/formalite/liste";
import { dateEnTete } from "@/lib/dates";
import { Accueil } from "./Accueil";
import styles from "./TableauDeBord.module.css";
import { DocumentsDuDossier, FeuilleDeRoute } from "./Focus";
import { DossierEnTete, type EtapeDuChemin } from "./DossierEnTete";
import {
  AutresFormalites,
  EcheancesProches,
  type AutreFormalite,
} from "./AutresFormalites";

/**
 * Combien de formalités la colonne de droite montre.
 *
 * Six lignes, puis le lien. Au-delà, on ne cherche plus une formalité dans une liste -
 * « Toutes mes formalités » mène à l'écran qui sait les filtrer et les chercher, et la
 * colonne garde de la place pour ce qui vient dessous.
 */
const FORMALITES_MONTREES = 6;

/**
 * Le chemin à montrer, selon le moment du dossier.
 *
 * Confié, c'est celui du suivi - transmis, relu, publié, déposé, immatriculé - que le
 * client lit déjà dans son dossier, et qui existe pour chaque nature de formalité. En
 * cours de saisie, ce sont les étapes du formulaire, que seule la création numérote :
 * pour les autres, il n'y a rien d'honnête à dessiner, et la prochaine étape en toutes
 * lettres dit davantage.
 */
function friseDuDossier(
  dossier: DossierDAccueil,
  suivi: {
    identifiant: string;
    titre: string;
    explication: string;
    etat: string;
    main: string;
  }[]
): EtapeDuChemin[] | undefined {
  if (suivi.length > 0) {
    return suivi.map((etape) => ({
      titre: etape.titre,
      explication: etape.explication,
      etat:
        etape.etat === "faite" ? "faite" : etape.etat === "en_cours" ? "en_cours" : "a_venir",
      /* Qui tient l'étape : l'encadré s'en sert pour ne rien réclamer hors de son tour. */
      main: etape.main === "vous" ? "vous" : "avocat",
      identifiant: etape.identifiant,
    }));
  }

  /*
   * Le dossier se remplit encore : ce sont les étapes du formulaire.
   *
   * Elles n'ont pas d'explication - ce sont des écrans à parcourir, non des choses qui
   * se passent - et seule la création les numérote. Pour les autres, il n'y a rien
   * d'honnête à dessiner, et la prochaine étape en toutes lettres dit davantage.
   */
  if (dossier.type && dossier.type !== "creation") return undefined;

  const noms = nomsDEtapes(dossier.offre);
  return noms.map((titre, rang) => ({
    titre,
    etat:
      rang + 1 < dossier.etapeAffichee
        ? "faite"
        : rang + 1 === dossier.etapeAffichee
          ? "en_cours"
          : "a_venir",
  }));
}

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
  const { societes } = await tableauDeBord(utilisateur);

  const prenom = utilisateur.nom.split(" ")[0];

  /*
   * Un compte sans dossier n'a rien à savoir : il a quelque chose à commencer.
   *
   * Le bandeau est celui des deux autres états - salutation, date, bouton - et non
   * une tête de page réinventée dans la carte : c'est ce qui fait que passer de zéro
   * à un dossier ne donne pas l'impression de changer de produit.
   */
  if (societes.length === 0) {
    return (
      <main className={styles.page}>
        <header className={styles.entete}>
          <h1 className={styles.enteteTitre}>{phraseDAccueil(prenom, 0)}</h1>
          <span className={styles.enteteDate}>{dateEnTete()}</span>
        </header>

        <div className={styles.content}>
          <Accueil />
        </div>
      </main>
    );
  }

  const dossiers = societes as DossierDAccueil[];
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

  /*
   * Le dossier unique garde ses détails.
   *
   * La frise des étapes, les pièces déjà déposées et le nom de l'avocat ne se répètent
   * nulle part ailleurs : ils ne relèvent pas de la redondance qu'on a supprimée, mais
   * du seul endroit où un client à un dossier voit où il en est.
   */
  /*
   * Un dossier, et rien d'autre.
   *
   * Le critère est le nombre total de dossiers, non celui des dossiers ouverts : un
   * compte qui en a terminé un et en a un en cours a une histoire, et la disposition
   * comparative la lui montre. Celui qui n'en a qu'un n'a rien à comparer.
   */
  const seul = dossiers.length === 1 ? dossiers[0] : null;
  const detail = seul ? await focusDuDossier(utilisateur, seul.id) : null;
  const toutTermine = enCours.length === 0;

  /*
   * Un dossier, une disposition.
   *
   * À plusieurs, l'accueil compare : des chiffres, une table, deux colonnes. À un
   * seul, il n'y a rien à comparer, et cet appareil disait trois fois le même dossier
   * - la ligne de chiffres, le bandeau de reprise, la table et son unique ligne. La
   * page d'origine ne s'y trompait pas : `renderSingleState()` ne montrait qu'un
   * objet, suivi de ce qui aide à le faire avancer.
   *
   * Les sections vides ne s'affichent pas ici. « Aucune échéance à venir », « Aucune
   * activité récente » et « Tout est à jour » remplissaient trois cadres pour dire
   * trois fois rien, sur un écran qui n'a qu'une chose à dire.
   */
  if (seul) {
    return (
      <main className={styles.page}>
        <header className={styles.entete}>
          <h1 className={styles.enteteTitre}>{phraseDAccueil(prenom, societes.length)}</h1>
          <span className={styles.enteteDate}>{dateEnTete()}</span>
        </header>

        {/*
          La même disposition qu'à plusieurs, et ce qu'on met à droite change.

          À plusieurs, la colonne de droite dit ce qu'il y a d'autre ; à un seul, il n'y
          a rien d'autre, et elle dit ce que le dossier porte - ses documents, ce qui
          l'attend. Deux dispositions différentes pour le même écran donnaient
          l'impression de changer de produit en ouvrant un second dossier.
        */}
        <div className={styles.content}>
          <div className={styles.deuxColonnes}>
            <DossierEnTete
              nature={libelleCompletDuType(seul.type) ?? "Formalité"}
              societe={nomComplet(seul)}
              prochaineEtape={seul.prochaineEtape}
              etat={tonDuDossier(seul)}
              etapes={friseDuDossier(seul, detail?.suivi ?? [])}
              actions={seul.actions}
              geste={gesteDuDossier(seul)}
              lien={lienDu(seul.id)}
              avocat={detail?.avocat ?? null}
              nonLus={seul.nonLus}
            />

            <aside className={styles.coteColonne} aria-label="Votre dossier">
              {/* Terminé, on montre ce qui vient après plutôt qu'un cadre vide. */}
              {toutTermine && <FeuilleDeRoute />}

              {(detail?.documents.length ?? 0) > 0 && (
                <DocumentsDuDossier documents={detail?.documents ?? []} />
              )}

              <EcheancesProches echeances={echeancesProches(echeances)} />
            </aside>
          </div>
        </div>
      </main>
    );
  }

  /*
   * Le dossier en tête, celui qu'on reprend.
   *
   * `dossierAReprendre` rend le premier qui attend son propriétaire ; à défaut - tout
   * est chez l'avocat - c'est le premier dossier ouvert. La page a toujours quelque
   * chose à montrer en grand, sans quoi la colonne de gauche resterait vide sur un
   * compte dont rien n'est bloqué.
   */
  const enTete = aReprendre ?? enCours[0] ?? null;
  const detailEnTete = enTete ? await focusDuDossier(utilisateur, enTete.id) : null;

  const autres: AutreFormalite[] = enCours
    .filter((dossier) => dossier.id !== enTete?.id)
    .slice(0, FORMALITES_MONTREES)
    .map((dossier) => ({
      id: dossier.id,
      societe: nomComplet(dossier),
      nature: libelleDuType(dossier.type) ?? "Formalité",
      etat: tonDuDossier(dossier),
      /*
       * Le premier geste attendu, nommé.
       *
       * Les attentes sont déjà ordonnées - ce qui bloque d'abord - et c'est la
       * première qui dit le mieux ce que la ligne demande.
       */
      attente: dossier.attendLeClient ? (dossier.actions[0]?.titre ?? null) : null,
      bloque: dossier.actions[0]?.urgent === true,
      lien: lienDu(dossier.id),
    }));

  return (
    <main className={styles.page}>
      <header className={styles.entete}>
        {/*
          La salutation suit le moment de la journée, comme la page d'origine.
          Réduite à « Bonjour Hani », elle ne disait plus rien qu'un nom déjà connu.
        */}
        <h1 className={styles.enteteTitre}>{phraseDAccueil(prenom, societes.length)}</h1>

        {/* La date à droite : elle situe, elle n'annonce pas. */}
        <span className={styles.enteteDate}>{dateEnTete()}</span>
      </header>

      {/*
        Deux colonnes, et rien d'empilé dessous.

        L'accueil portait sept sections : trois chiffres, un bandeau de reprise, des
        documents récents, une liste d'attentes, une file de travail, des échéances,
        une activité récente et un catalogue. Le dossier sur lequel on travaille y
        paraissait quatre fois, sous quatre formes.

        À gauche ce qu'on reprend, à droite ce qu'il y a d'autre. Ce qui a été retiré
        n'est perdu nulle part : les documents ont leur page, le catalogue s'ouvre par
        « Nouvelle formalité », et les attentes des autres dossiers se comptent sur
        leur ligne.
      */}
      <div className={styles.content}>
        <div className={styles.deuxColonnes}>
          <div className={styles.colonneDeTete}>
            {/* Le voile qui s'allume au défilement : voir `.voileDuHaut`. */}
            <span className={styles.voileDuHaut} aria-hidden="true" />
            {enTete ? (
              <DossierEnTete
                nature={libelleCompletDuType(enTete.type) ?? "Formalité"}
                societe={nomComplet(enTete)}
                prochaineEtape={enTete.prochaineEtape}
                etat={tonDuDossier(enTete)}
                etapes={friseDuDossier(enTete, detailEnTete?.suivi ?? [])}
                actions={enTete.actions}
                geste={gesteDuDossier(enTete)}
                lien={lienDu(enTete.id)}
                avocat={detailEnTete?.avocat ?? null}
                nonLus={enTete.nonLus}
              />
            ) : (
              /* Tout est clos : on montre ce qui vient après plutôt qu'un cadre vide. */
              <FeuilleDeRoute />
            )}

            {/*
              Les documents du dossier en tête, sous lui.

              L'encadré s'étirait pour occuper la colonne : un dossier à une attente y
              laissait quatre cents pixels de blanc entre son chemin et son bouton, ce
              qui n'est pas occuper l'espace mais l'écarter. Ce qui vient après
              « reprendre », c'est de relire ce que le dossier porte - et c'est déjà
              chargé, puisque l'encadré demande son avocat au même endroit.
            */}
            {(detailEnTete?.documents.length ?? 0) > 0 && (
              <DocumentsDuDossier documents={detailEnTete?.documents ?? []} />
            )}
            {/* Le voile qui s'éteint au fond : voir `.voileDuBas`. */}
            <span className={styles.voileDuBas} aria-hidden="true" />
          </div>

          <AutresFormalites
            formalites={autres}
            total={enCours.length}
            actions={actions}
            echeances={echeancesProches(echeances)}
          />
        </div>
      </div>
    </main>
  );
}
