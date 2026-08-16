import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { tableauDeBord, focusDuDossier } from "@/infrastructure/db/depots/tableau-de-bord";
import { etatTableauDeBord, phraseDAccueil } from "@/domain/formalite/actions";
import { dateEnTete } from "@/lib/dates";
import {
  avancement,
  accorder,
  nombreDEtapes,
  nomEtape,
  etatCourt,
} from "@/domain/formalite/etapes";
import { nomsDEtapes } from "@/domain/formalite/etapes";
import { libelleDuType } from "@/domain/formalite/liste";
import { Accueil } from "./Accueil";
import { Avancement, Anneau } from "./Avancement";
import { Attentes, ActiviteRecente } from "./Blocs";
import {
  Frise,
  DocumentsDuDossier,
  Interlocuteur,
  FeuilleDeRoute,
} from "./Focus";
import { citation } from "@/domain/messagerie/messages";
import { adresseDuDossier } from "@/domain/formalite/liste";
import { ActionPrioritaire, type Priorite } from "./ActionPrioritaire";
import { ToutesLesSocietes, type Ligne } from "./ToutesLesSocietes";
import styles from "./TableauDeBord.module.css";

export const metadata: Metadata = {
  title: "Tableau de bord - Formalist",
  robots: { index: false, follow: false },
};

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/** Les formes dont on dit « la création de votre SASU X » plutôt que « le dossier X ». */
const FORMES_SOCIETE = new Set(["SAS", "SASU", "SARL", "EURL", "SCI"]);

/** « SASU STUDIO KERN » : la forme précède le nom, comme dans la page d'origine. */
function nomComplet(societe: { forme: string | null; societe: string }): string {
  return societe.forme ? societe.forme.toUpperCase() + " " + societe.societe : societe.societe;
}

export default async function TableauDeBord() {
  const utilisateur = await exigerUtilisateur();
  const { dossiers, societes, activite } = await tableauDeBord(utilisateur);
  const etat = etatTableauDeBord(dossiers);

  const prenom = utilisateur.nom.split(" ")[0];
  const nbActions = societes.reduce((total, s) => total + s.actions.length, 0);

  // Un seul dossier : on le met en avant plutôt que de le noyer dans une liste
  // d'une ligne. C'est l'état le plus fréquent au démarrage.
  const seul = societes.length === 1 ? societes[0] : null;
  const seulTermine = seul?.status === "terminee";

  // Les documents et l'avocat du dossier, pour l'état à un seul dossier en cours.
  // Une requête de plus, et seulement dans ce cas.
  const focus = seul && !seulTermine ? await focusDuDossier(utilisateur, seul.id) : null;

  // Le bandeau du haut : les messages non lus passent devant tout, puis les
  // dossiers en attente, puis ceux qui attendent une action du client.
  const priorites: Priorite[] = [];
  const nonLus = societes.reduce((total, s) => total + s.nonLus, 0);
  if (nonLus > 0) {
    const avecMessages = societes.find((s) => s.nonLus > 0)!;
    const dernier = avecMessages.dernierMessage;

    /*
     * Dire qui écrit, et ce qu'il écrit.
     *
     * « 1 nouveau message - Sur PARCOURS EN COURS » ne dit ni de qui il vient ni de
     * quoi il s'agit : il faut ouvrir pour l'apprendre, et l'on ouvre donc toujours,
     * même quand cela pouvait attendre. Le nom de l'expéditeur et les premiers mots
     * suffisent presque toujours à trancher.
     */
    const correction = dernier?.genre === "correction_request";
    const refus = dernier?.genre === "rejection";
    /*
     * Les autres messages de ce dossier, non ceux de tous.
     *
     * Le bandeau nomme un dossier et y mène : compter le total annonçait « +3 autres »
     * pour un fil qui n'en contenait aucun.
     */
    const autres = avecMessages.nonLus - 1;

    priorites.push({
      icone: "message",
      titre: !dernier
        ? accorder(nonLus, "nouveau message", "nouveaux messages")
        : correction
          ? dernier.auteur + " vous demande une correction"
          : refus
            ? dernier.auteur + " a refusé le dossier"
            : dernier.auteur + " vous a écrit",
      societe: avecMessages.societe,
      precision: dernier
        ? citation(dernier.extrait) + (autres > 0 ? " (+" + autres + " autre" + (autres > 1 ? "s" : "") + ")" : "")
        : accorder(nonLus, "message non lu", "messages non lus"),
      ton: correction || refus ? "action" : "info",
      lien: "/messagerie?dossier=" + avecMessages.id,
      bouton: correction ? "Voir ce qui est demandé" : refus ? "Voir le motif" : "Lire le message",
    });
  } else {
    for (const s of societes.filter((s) => s.attendLeClient)) {
      priorites.push({
        icone: s.status === "en_attente" ? "attente" : "document",
        titre: FORMES_SOCIETE.has((s.forme ?? "").toUpperCase())
          ? "Reprendre la création de votre " + nomComplet(s)
          : "Reprendre votre dossier " + nomComplet(s),
        precision: "Prochaine étape : " + s.prochaineEtape,
        lien: s.actions[0].lien,
        bouton: "Continuer",
      });
    }
  }

  // Les trois dossiers les plus récents ; le reste se consulte dans la fenêtre.
  const recentes = societes.slice(0, 3);

  /*
   * Le dossier s'ouvre là où on le reprend, à l'adresse que son type commande.
   *
   * Toutes les lignes menaient au parcours de création : une modification ou une
   * auto-entreprise ouverte depuis l'accueil arrivait sur le formulaire d'une société
   * à créer.
   */
  const parIdentifiant = new Map(societes.map((s) => [s.id, s.type ?? null]));
  const dossier = (id: number) =>
    adresseDuDossier({ id, type: parIdentifiant.get(id) ?? null });

  const lignes: Ligne[] = societes.map((s) => {
    const termine = s.status === "terminee";
    return {
      id: s.id,
      nom: nomComplet(s),
      etape: termine
        ? "Immatriculée"
        : "Étape " +
          s.etapeAffichee +
          " sur " +
          nombreDEtapes(s.offre) +
          " · " +
          nomEtape(s.etapeAffichee, s.offre),
      etat: etatCourt(s).libelle,
      ton: termine ? "done" : s.attendLeClient ? "action" : "",
      pourcentage: avancement(s.etapeAffichee, s.offre),
      termine,
      lien: dossier(s.id),
    };
  });

  // Sur un compte sans dossier, la salutation monte dans le bloc d'accueil et le
  // bandeau disparaît : c'est ce que faisait la page d'origine, et une date pleine
  // posée au-dessus d'un écran sans contenu n'informe de rien.
  const accueil = etat === "aucun";

  return (
    <main className={styles.page}>
      {!accueil && (
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            {/* La phrase suit le moment de la journée, comme buildGreeting() dans
                la page d'origine. */}
            <h1>{phraseDAccueil(prenom, societes.length)}</h1>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.topbarDate}>
              {dateEnTete()}
            </span>
          </div>
        </header>
      )}

      <div className={styles.content}>
        {accueil && <Accueil salutation={phraseDAccueil(prenom, 0)} />}

        {seul && (
          <>
            <section
              className={
                seulTermine
                  ? `${styles.singleHero} ${styles.singleCelebrate}`
                  : styles.singleHero
              }
            >
              <Avancement
                pourcentage={avancement(seul.etapeAffichee, seul.offre)}
                termine={seulTermine}
              />

              <div className={styles.singleHeroBody}>
                <span className={styles.singleHeroEyebrow}>
                  {seulTermine ? "Félicitations 🎉" : (libelleDuType(seul.type) ?? seul.type)}
                </span>

                <div className={styles.singleHeroTitle}>
                  {seulTermine ? nomComplet(seul) + " est immatriculée" : nomComplet(seul)}
                </div>
                <div className={styles.singleHeroDesc}>
                  {seulTermine
                    ? "Votre société est officielle. Découvrez les prochaines étapes pour la faire grandir."
                    : "Prochaine étape · " + seul.prochaineEtape}
                </div>

                <div className={styles.singleHeroActions}>
                  <Link href={dossier(seul.id)} className={styles.singleHeroBtn}>
                    {seulTermine ? "Voir mon dossier" : "Continuer"}
                    {!seulTermine && <Chevron />}
                  </Link>
                  {/* La page d'origine ouvrait ici la fenêtre « Nouvelle
                      formalité ». Elle s'ouvre depuis la colonne ; ce second
                      geste mène droit au parcours de création. */}
                  <Link
                    href="/creation?type=creation"
                    className={`${styles.singleHeroBtn} ${styles.ghost}`}
                  >
                    + Nouvelle formalité
                  </Link>
                </div>
              </div>
            </section>

            {/* Un dossier en cours : on remplit l'accueil avec ce qui aide à
                avancer. Terminé : on montre ce qui vient après. */}
            {seulTermine ? (
              <FeuilleDeRoute />
            ) : (
              <>
                <Frise
                  etapes={nomsDEtapes(seul.offre)}
                  etape={seul.etapeAffichee}
                  nomEtape={nomEtape(seul.etapeAffichee, seul.offre)}
                />

                <Attentes societes={societes} nbActions={nbActions} />

                <div className={styles.dashCols}>
                  <DocumentsDuDossier documents={focus?.documents ?? []} />
                  <ActiviteRecente activite={activite} lienDossier={dossier} avecTitre />
                </div>

                <Interlocuteur avocat={focus?.avocat ?? null} />
              </>
            )}
          </>
        )}

        {etat === "tous_termines" && !seul && (
          <section className={`${styles.singleHero} ${styles.singleCelebrate}`}>
            <div className={styles.singleHeroBody}>
              <div className={styles.singleHeroTitle}>Tous vos dossiers sont finalisés</div>
              <div className={styles.singleHeroDesc}>
                {accorder(dossiers.length, "formalité terminée", "formalités terminées")}.
              </div>
              <div className={styles.singleHeroActions}>
                <Link href="/creation?type=creation" className={styles.singleHeroBtn}>
                  Nouvelle société
                </Link>
              </div>
            </div>
          </section>
        )}

        {societes.length > 1 && (
          <>
            <ActionPrioritaire priorites={priorites} />

            {/* La section porte son titre : sans cela le bloc n'existe pas
                comme repère de navigation. */}
            <section aria-labelledby="vos-societes">
            <div className={styles.dbSectionHead}>
              <h2 id="vos-societes">Vos sociétés</h2>
              {societes.length > 3 && <ToutesLesSocietes lignes={lignes} />}
            </div>

            <div className={styles.socGrid}>
              {recentes.map((s) => {
                const termine = s.status === "terminee";
                const etat = etatCourt(s);
                // La vignette ne distingue que trois teintes : terminé, en
                // attente d'une action du client, ou en cours. « En attente »
                // porte la teinte neutre, comme dans la page d'origine.
                const ton = termine ? styles.done : s.attendLeClient ? styles.action : "";

                return (
                  <div key={s.id} className={`${styles.socTile} ${ton}`}>
                    <div className={styles.socTileHead}>
                      <Anneau
                        pourcentage={avancement(s.etapeAffichee, s.offre)}
                        termine={termine}
                      />

                      {/*
                        Le nom prend toute la ligne.
                        L'état l'accompagnait sur la même rangée : « SAS ESSAI MODIF »
                        se réduisait à « SAS ESSAI MOD… » pour lui laisser la place,
                        et l'étape passait à la ligne faute de largeur. L'état descend
                        près du bouton, où il annonce le geste plutôt que le titre.
                      */}
                      <div className={styles.socTileIdent}>
                        <div className={styles.socTileName} title={nomComplet(s)}>
                          {nomComplet(s)}
                        </div>
                        <div className={styles.socTileStep}>
                          {termine
                            ? "Immatriculée"
                            : "Étape " +
                              s.etapeAffichee +
                              " sur " +
                              nombreDEtapes(s.offre) +
                              " · " +
                              nomEtape(s.etapeAffichee, s.offre)}
                        </div>
                      </div>
                    </div>

                    <div className={styles.socTileNext}>{s.prochaineEtape}</div>

                    <div className={styles.socTileFoot}>
                      <span className={`${styles.socTileStatus} ${ton}`}>{etat.libelle}</span>
                      {s.nonLus > 0 && (
                        <span className={styles.socTileUnread}>
                          {accorder(s.nonLus, "message non lu", "messages non lus")}
                        </span>
                      )}
                      <Link href={dossier(s.id)} className={styles.socTileBtn}>
                        {termine ? "Consulter" : "Continuer"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
            </section>
          </>
        )}

        {societes.length > 1 && <Attentes societes={societes} nbActions={nbActions} />}

        {societes.length > 1 && (
          <>
            <div className={styles.dbSectionHead}>
              <h2>Activité récente</h2>
            </div>

            <ActiviteRecente activite={activite} lienDossier={dossier} />
          </>
        )}
      </div>
    </main>
  );
}
