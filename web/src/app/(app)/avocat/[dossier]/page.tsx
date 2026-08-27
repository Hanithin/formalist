import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { dossierPourAvocat } from "@/infrastructure/db/depots/avocat";
import { etatCabinet } from "@/domain/formalite/avocat";
import { estPropose } from "@/domain/acces/regles";
import { etatDesPieces } from "@/domain/formalite/pieces";
import { piecesAttenduesDuDossier } from "@/infrastructure/documents/pieces-attendues";
import { libelleEtat } from "@/domain/formalite/transitions";
import { libelleDuType } from "@/domain/formalite/liste";
import { libelleJournal } from "@/domain/formalite/journal";
import { Notes } from "./Notes";
import { Travail } from "./Travail";
import { Statuts } from "./Statuts";
import { Annonce } from "./Annonce";
import {
  travailDuCabinet,
  prochaineTache,
  type TypeDeDossier,
} from "@/domain/formalite/cabinet";
import { statutsAMettreAJour, TITRE_STATUTS_A_JOUR } from "@/domain/modification/formalites";
import { publicationsAPrevoir } from "@/domain/modification/formalites";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { aRelire } from "@/domain/document/publication";
import { Piece, type PieceAffichee } from "./Piece";
import { Avancement } from "./Avancement";
import { PriseEnCharge } from "./PriseEnCharge";
import { TYPE_KBIS, TYPE_RBE } from "@/infrastructure/db/depots/suivi";
import { DOCUMENT_FINAL } from "@/domain/formalite/cabinet";
import { Vide } from "@/components/liste/Vide";
import {
  estUneModification,
  recapitulatifDeModification,
} from "@/domain/modification/recapitulatif";
import { recapitulatifDesComptes } from "@/domain/comptes/recapitulatif";
import styles from "../Avocat.module.css";

export const metadata: Metadata = {
  title: "Dossier - Espace avocat - Formalist",
  robots: { index: false, follow: false },
};

/** Les champs du brouillon, présentés avec le mot du métier. */
const CHAMPS: { cle: string; libelle: string }[] = [
  { cle: "denomination", libelle: "Dénomination" },
  { cle: "forme", libelle: "Forme juridique" },
  { cle: "activite", libelle: "Activité" },
  { cle: "adresse", libelle: "Adresse du siège" },
  { cle: "codePostal", libelle: "Code postal" },
  { cle: "ville", libelle: "Ville" },
  { cle: "capital", libelle: "Capital social" },
  { cle: "capitalLibere", libelle: "Capital libéré" },
];

/*
 * Cinq onglets au plus, et seulement ceux qui servent.
 *
 * Il y en avait huit, tous affichés quel que soit le dossier - « Statuts » sur une
 * création qui n'en a pas à retoucher, « Annonce légale » sur une cession qui n'en
 * publie aucune. Chercher où l'on travaille prenait plus de temps que le travail.
 *
 * Trois regroupements. L'avancement rejoint « À faire » : les sous-phases disent la
 * même chose que les tâches, en plus court. Le récapitulatif et les pièces forment
 * « Le dossier » - ce que le client a déclaré, puis ce qu'il a déposé. Les notes
 * internes et le journal forment « Coulisses » : deux écrits que le client ne voit
 * jamais, qu'on relit rarement, et jamais l'un sans l'autre.
 */
const ONGLETS = ["travail", "dossier", "statuts", "annonce", "coulisses"] as const;
type Onglet = (typeof ONGLETS)[number];

const NOMS: Record<Onglet, string> = {
  travail: "À faire",
  dossier: "Le dossier",
  statuts: "Statuts",
  annonce: "Annonce légale",
  coulisses: "Coulisses",
};

/*
 * Les anciens noms d'onglets mènent toujours quelque part.
 *
 * Ils sont écrits dans les tâches du domaine, dans les liens des écrans, et dans les
 * adresses que l'on a pu mettre en signet : « ?onglet=pieces » doit ouvrir la section
 * des pièces, non retomber en silence sur « À faire ».
 */
const ALIAS: Record<string, Onglet> = {
  recapitulatif: "dossier",
  pieces: "dossier",
  avancement: "travail",
  notes: "coulisses",
  journal: "coulisses",
};

/** La teinte du picto d'une entrée de journal, selon ce qu'elle raconte. */
function teinteJournal(action: string): string {
  if (action.includes("valide")) return "green";
  if (action.includes("refuse") || action.includes("rejet")) return "red";
  if (action.includes("document")) return "blue";
  if (action.includes("etat") || action.includes("avocat")) return "violet";
  return "gray";
}

function initiales(nom: string): string {
  return nom
    .split(" ")
    .map((mot) => mot[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/*
 * « 24 août 2026 à 12:16 ».
 *
 * L'heure reste : deux justificatifs déposés le même jour ne se distinguent que par
 * elle. Le format court - 24/08/2026 12:16 - se lisait comme un horodatage de journal
 * au milieu d'une page qui écrit ses dates en toutes lettres partout ailleurs.
 */
function quand(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(date);
}

export default async function DossierAvocat({
  params,
  searchParams,
}: {
  params: Promise<{ dossier: string }>;
  searchParams: Promise<{ onglet?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  const { dossier: identifiant } = await params;
  const vue = await dossierPourAvocat(utilisateur, Number(identifiant)).catch(() => null);
  if (!vue) notFound();

  const { dossier, client, documents, notes, historique, donnees, nonLus } = vue;

  const demande = (await searchParams).onglet;
  /*
   * On ouvre sur ce qu'il reste à faire, non sur le récapitulatif.
   *
   * L'avocat qui vient de prendre un dossier veut savoir par où commencer, non relire
   * une fiche. Le récapitulatif est à un clic.
   */
  const onglet: Onglet = ONGLETS.includes(demande as Onglet)
    ? (demande as Onglet)
    : (ALIAS[demande ?? ""] ?? "travail");

  /*
   * Une modification ne se range pas comme une création.
   *
   * Elle porte la société, les changements décidés et leurs valeurs dans des
   * sous-objets, là où une création écrit ses champs à la racine. Chercher les uns
   * dans l'autre faisait annoncer « le client n'a encore rien renseigné » sur un
   * dossier réglé et complet - au moment précis où l'avocat l'ouvre pour le réviser.
   */
  /*
   * Un dépôt des comptes non plus.
   *
   * Il s'affichait avec la lecture d'une création : huit lignes vides - Dénomination,
   * Activité, Capital social - sous « Le client n'a encore rien renseigné ». La société
   * est immatriculée depuis des années ; c'est son exercice qu'on approuve.
   */
  const sections = estUneModification(donnees)
    ? recapitulatifDeModification(donnees)
    : dossier.type === "comptes"
      ? recapitulatifDesComptes(donnees)
      : null;

  const renseignes = CHAMPS.filter((c) => {
    const valeur = donnees[c.cle];
    return valeur !== undefined && valeur !== null && String(valeur).trim() !== "";
  });
  const manquants = CHAMPS.filter((c) => !renseignes.includes(c));

  /*
   * Le dossier est-il encore proposé au cabinet ?
   *
   * La même règle que dans la liste, appliquée au même endroit du domaine : ni pris,
   * ni encore côté client, ni clos. C'est elle qui décide de la pastille « À prendre »
   * et du bandeau de prise en charge.
   */
  const libre = estPropose({
    id: dossier.id,
    proprietaireId: dossier.user_id,
    avocatAssigneId: dossier.assigned_avocat_id,
    equipeId: dossier.team_id,
    statut: dossier.status,
  });

  const monDossier = dossier.assigned_avocat_id === utilisateur.id;

  const etat = etatCabinet({
    status: dossier.status,
    phase: dossier.phase ?? 1,
    sousPhase: dossier.business_sub_phase,
    creePar: dossier.created_by_avocat ? "avocat" : "client",
    libre,
  });

  const aVerifier = documents.filter((d) => d.status === "uploaded").length;

  /*
   * Ce que le dossier réclame, comparé à ce qu'il porte.
   *
   * Le décompte des pièces ne regardait que les documents déposés : une pièce
   * obligatoire jamais fournie ne comptait nulle part, et l'écran comme la liste des
   * tâches donnaient un dossier incomplet pour complet.
   */
  const pieces_ = etatDesPieces(
    piecesAttenduesDuDossier({
      type: dossier.type,
      data_json: dossier.data_json,
      forme: typeof donnees.forme === "string" ? donnees.forme : null,
    }),
    documents.map((d) => ({
      type: d.type,
      status: d.status,
      rejection_reason: d.rejection_reason,
    }))
  );
  // Un document refusé ne compte pas comme remis : il attend son remplacement.
  const remis = (type: string) =>
    documents.some((d) => d.type === type && !d.rejection_reason);
  const adresse = (o: Onglet) => "/avocat/" + dossier.id + "?onglet=" + o;

  /*
   * Ce qu'il reste à faire, déduit de l'état du dossier.
   *
   * Le type décide du vocabulaire et des tâches : une modification met les statuts à
   * jour et publie un avis, une création attend un Kbis. Le déduire ici plutôt que de
   * semer des conditions dans l'écran garde les deux parcours lisibles.
   */
  const type: TypeDeDossier =
    dossier.type === "modification"
      ? "modification"
      : dossier.type === "auto-entrepreneur"
        ? "auto-entrepreneur"
        : dossier.type === "comptes"
          ? "comptes"
          : dossier.type === "fermeture"
            ? "fermeture"
            : dossier.type === "cessation"
              ? "cessation"
              : "creation";

  const codes = estUneModification(donnees) ? ((donnees.codes as string[]) ?? []) : [];
  const societeDuDossier = (donnees.societe ?? {}) as {
    codePostal?: string | null;
    ville?: string | null;
  };
  const valeursDuDossier = (donnees.valeurs ?? {}) as Record<string, string | number | undefined>;

  /*
   * La relecture déclarée par l'avocat, inscrite dans le brouillon sous `revue`.
   *
   * Elle n'est pas un état du dossier - le client n'en voit rien - mais un fait de la
   * révision : c'est elle qui coche « Vérifier les informations du dossier ».
   */
  const revue = (donnees.revue ?? {}) as Record<string, unknown>;
  const informationsVerifiees = revue.informations === true;

  const taches = travailDuCabinet({
    type,
    informationsVerifiees,
    status: dossier.status,
    sousPhase: dossier.business_sub_phase,
    piecesAVerifier: aVerifier,
    piecesManquantes: pieces_.manquantes.length + pieces_.refusees.length,
    /*
     * Produits, relus ou non : c'est la production qui compte ici, non la mise à
     * disposition. Un acte à relire est bien un acte produit.
     */
    actesProduits: documents.some((d) => d.uploaded_by === "system"),
    actesARelire: aRelire(documents).length,
    nomsDesActesARelire: aRelire(documents).map((d) => d.name),
    statutsAuDossier: documents.some((d) => d.name === "Statuts en vigueur"),
    statutsAJour: donnees.statutsAJour === true,
    avisAPublier:
      type === "modification"
        ? publicationsAPrevoir({
            codes,
            ressortActuel: villeDuRcs(societeDuDossier.codePostal, societeDuDossier.ville),
            ressortNouveau: villeDuRcs(
              typeof valeursDuDossier.nouveauCodePostal === "string"
                ? valeursDuDossier.nouveauCodePostal
                : "",
              typeof valeursDuDossier.nouvelleVille === "string"
                ? valeursDuDossier.nouvelleVille
                : ""
            ),
          }).length
        : 0,
    avisPublies: donnees.avisPublies === true,
    confidentialiteDemandee: donnees.demandeLaConfidentialite === true,
    /*
     * Les deux attestations de la radiation, telles que le client les a marquées.
     *
     * Le cabinet ne peut pas les obtenir à sa place - elles se tirent de l'espace
     * URSSAF et de l'espace fiscal de la société - mais il doit savoir si elles
     * manquent, parce que c'est lui qui déposera et lui qui essuiera le refus.
     */
    attestationsReunies:
      typeof donnees.jalons === "object" && donnees.jalons !== null
        ? (donnees.jalons as Record<string, unknown>).attestationFiscale === true &&
          (donnees.jalons as Record<string, unknown>).attestationSociale === true
        : false,
    finalRemis: remis(TYPE_KBIS),
    statutsConcernes: statutsAMettreAJour(codes),
  });

  /*
   * Les ateliers ne s'affichent que sur les dossiers qui les emploient.
   *
   * « Statuts » sur une création qui n'a rien à retoucher et « Annonce légale » sur une
   * cession qui n'en publie aucune n'offraient qu'un encart d'excuses - et allongeaient
   * la barre pour tout le monde.
   */
  const retoucheDesStatuts = type === "modification" && statutsAMettreAJour(codes);
  const annonceAPublier = taches.some((t) => t.identifiant === "annonce");

  const onglets = ONGLETS.filter(
    (o) =>
      (o !== "statuts" || retoucheDesStatuts) && (o !== "annonce" || annonceAPublier)
  );

  /*
   * Les pièces telles que le navigateur les reçoit.
   *
   * La même liste sert deux écrans : l'onglet du dossier, et les fenêtres que les
   * tâches ouvrent. Une seule mise en forme, donc, et une seule carte pour les rendre.
   */
  const pieces: PieceAffichee[] = documents.map((d) => ({
    id: d.id,
    nom: d.name,
    statut: d.status,
    motifRejet: d.rejection_reason,
    fichier: d.file_path,
    source: d.source_path,
    depose: d.uploaded_by,
    creeLe: d.created_at?.toISOString() ?? null,
  }));

  const suivante = prochaineTache(taches);

  /*
   * Les statuts à jour restent à produire.
   *
   * Ils ne naissent qu'à la sortie de l'éditeur de retouches : tant qu'ils n'existent
   * pas, aucune ligne ne les annonce dans les pièces - et l'avocat ne voit pas qu'il
   * manque au dossier un document que le greffe attend.
   */
  const statutsAProduire =
    type === "modification" &&
    statutsAMettreAJour(codes) &&
    !documents.some((d) => d.name === TITRE_STATUTS_A_JOUR);
  const faites = taches.filter((t) => t.etat === "faite").length;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        {/*
          Une seule pastille : celle de l'état du travail.

          Quatre se suivaient - la forme, l'état du cabinet, l'assignation, l'état du
          dossier. La forme et l'état du dossier sont des faits d'identité : ils
          descendent en sous-titre. L'assignation, elle, est redite mot pour mot par le
          bandeau qui suit trois lignes plus bas.
        */}
        <div className={styles.topbarTitre}>
          <h1>{dossier.societe || "Sans nom"}</h1>
          <div className={styles.detailBadges}>
            {/*
              De quelle formalité s'agit-il ?

              Rien ne le disait : « STERLING PEAK - exercice 2026 » se lit comme un nom
              de société, et l'avocat qui ouvre un dossier ne savait pas s'il tenait un
              dépôt de comptes, une modification ou une fermeture avant d'avoir lu les
              tâches.
            */}
            <span className={styles.detailBadge}>{libelleDuType(dossier.type)}</span>
            <span className={`${styles.detailBadge} ${styles.phase}`}>{etat.libelle}</span>
          </div>
          {/* La forme et l'état du dossier restent sur la ligne : ce sont des faits,
              et une ligne de plus décalerait la barre entière. */}
          <p className={styles.topbarSousTitre}>
            {[dossier.forme, libelleEtat(dossier.status)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link href="/avocat" className={styles.topbarBack}>
          <span className={styles.topbarBackFleche} aria-hidden="true">
            ←
          </span>
          Tous les dossiers
        </Link>
      </div>

      <div className={styles.content}>
        {/* Avant les onglets : on décide de prendre le dossier avant de travailler
            dedans, et le bandeau dit pourquoi rien n'y répond encore. */}
        {libre && <PriseEnCharge dossier={dossier.id} />}

        {/*
          Le dossier est à vous : une ligne le dit, et dit par quoi continuer.

          Le bandeau tenait sur quatre étages - une icône, un titre, une phrase
          d'explication, un compte, une jauge, puis la prochaine étape et son bouton.
          Il redisait à lui seul ce que la frise, le titre de l'onglet et les compteurs
          d'accordéon disaient déjà, et il se cachait sur l'onglet des tâches pour ne
          pas les répéter. Ramené à une ligne, il n'a plus de raison de se cacher : il
          est le seul endroit qui porte l'avancement d'ensemble.
        */}
        {monDossier && !libre && (
          <section className={styles.bandeauAssigne} aria-label="Votre dossier">
            <span className={styles.bandeauAssigneIcone} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>

            <span className={styles.bandeauAssigneTitre}>Assigné à vous</span>

            <span className={styles.jauge} aria-hidden="true">
              <span style={{ width: Math.round((faites / taches.length) * 100) + "%" }} />
            </span>

            {/* « 4 sur 7 faites » se lisait comme un résultat d'examen : ce qui compte
                est ce qui reste. */}
            <span className={styles.bandeauAssigneCompte}>
              {taches.length - faites === 0
                ? "Tout est fait"
                : taches.length - faites === 1
                  ? "1 tâche restante"
                  : taches.length - faites + " tâches restantes"}
            </span>

            {/*
              La barre dit ce qu'il y a à faire, et rien d'autre.

              Elle portait un bouton « Y aller » qui menait à l'onglet nommé par la
              tâche - « pieces », un ancien nom qui retombait sur celui d'où l'on
              venait. Un bouton qui ne mène nulle part apprend à ne plus les lire. Le
              nom de la tâche suffit, et il conduit à la liste quand on n'y est pas.
            */}
            <span className={styles.bandeauAssigneEtape}>
              <span className={styles.bandeauAssigneLegende}>À faire</span>
              {suivante ? (
                onglet === "travail" ? (
                  suivante.titre
                ) : (
                  <Link href={adresse("travail")} className={styles.bandeauAssigneLien}>
                    {suivante.titre}
                  </Link>
                )
              ) : (
                "rien, vous avez fait tout ce qui vous revenait"
              )}
              {suivante?.bloquee && (
                <span className={styles.bandeauAssigneBlocage}>{suivante.bloquee}</span>
              )}
            </span>
          </section>
        )}

        <nav className={styles.detailTabs} aria-label="Sections du dossier">
          {onglets.map((o) => (
            <Link
              key={o}
              href={adresse(o)}
              className={o === onglet ? `${styles.detailTab} ${styles.active}` : styles.detailTab}
              aria-current={o === onglet ? "page" : undefined}
            >
              {NOMS[o]}
              {o === "coulisses" && notes.length > 0 && (
                <span className={styles.tabCount}>{notes.length}</span>
              )}
              {o === "dossier" && aVerifier > 0 && (
                <span className={styles.tabCount}>{aVerifier} à vérifier</span>
              )}
            </Link>
          ))}
        </nav>

        {onglet === "travail" && (
          <>
            {/*
              L'avancement au-dessus des tâches, sur une ligne.

              Il tenait une carte de cinq étages au bas de la page, sous les tâches
              qu'il résume - cinq intitulés, cinq explications, deux boutons. Le seul
              geste qu'il porte est le passage d'un cran : le reste se lit en une ligne.
              Le bloc garde son ancre, où mène la tâche « Déposer au guichet unique ».
            */}
            <div id="avancement" className={styles.ancreAvancement}>
              <Avancement
                dossierId={dossier.id}
                type={type}
                sousPhase={dossier.business_sub_phase}
                aLeKbis={remis(TYPE_KBIS)}
                documentFinal={DOCUMENT_FINAL[type]}
                aLeRbe={remis(TYPE_RBE)}
              />
            </div>

            <Travail
              dossier={dossier.id}
              taches={taches}
              peutProduireLesActes={type === "modification"}
              informationsVerifiees={informationsVerifiees}
              pieces={pieces}
              /* Les documents remis sont les pièces de l'étape « Déposer ». */
              livrables={{
                documentFinal: DOCUMENT_FINAL[type],
                aLeKbis: remis(TYPE_KBIS),
                aLeRbe: remis(TYPE_RBE),
              }}
            />
          </>
        )}

        {onglet === "statuts" &&
          (type === "modification" ? (
            <Statuts dossier={dossier.id} />
          ) : (
            <Vide
              ton="encart"
              texte="La retouche des statuts ne concerne que les modifications de société."
            />
          ))}

        {onglet === "annonce" &&
          (type === "modification" ? (
            <Annonce dossier={dossier.id} />
          ) : (
            <Vide
              ton="encart"
              texte="Sur ce dossier, l'annonce légale est publiée par le client."
            />
          ))}

        {onglet === "dossier" && (
          <div className={styles.recapGrid}>
            <div className={styles.recapGridLeft}>
              <div className={styles.recapCard}>
                {sections ? (
                  sections.map((section) => (
                    <div key={section.titre} className={styles.recapSection}>
                      <h2 className={styles.recapTitle}>{section.titre}</h2>
                      {section.faits.map((fait, rang) => (
                        <div key={rang} className={styles.recapRow}>
                          <span className={styles.recapLabel}>{fait.libelle}</span>
                          <span className={styles.recapValue}>{fait.valeur}</span>
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <>
                    <div className={styles.recapSection}>
                      {/* Un titre de section reste un titre : la page d'origine le posait
                          en div, invisible à la navigation par titres. */}
                      <h2 className={styles.recapTitle}>Informations du dossier</h2>

                      {renseignes.map((c) => (
                        <div key={c.cle} className={styles.recapRow}>
                          <span className={styles.recapLabel}>{c.libelle}</span>
                          <span className={styles.recapValue}>{String(donnees[c.cle])}</span>
                        </div>
                      ))}

                      {renseignes.length === 0 && (
                        <Vide ton="encart" texte="Le client n'a encore rien renseigné." />
                      )}
                    </div>

                    {manquants.length > 0 && (
                      <div className={styles.recapSection}>
                        <h2 className={styles.recapTitle}>Pas encore renseigné par le client</h2>
                        {manquants.map((c) => (
                          <div key={c.cle} className={styles.recapRow}>
                            <span className={styles.recapLabel}>{c.libelle}</span>
                            <span className={styles.recapValue}>-</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className={styles.recapGridRight}>
              <div className={styles.recapSideCard}>
                <h3>Client</h3>
                <div className={styles.clientTete}>
                  <span className={styles.clientAvatar}>{initiales(client?.name ?? "?")}</span>
                  <span className={styles.clientIdentite}>
                    <span className={styles.clientNom}>{client?.name ?? "-"}</span>
                    <span className={styles.clientMail}>{client?.email ?? ""}</span>
                  </span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Offre</span>
                  <span className={styles.val}>
                    {dossier.offer.charAt(0).toUpperCase() + dossier.offer.slice(1)}
                  </span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Créé le</span>
                  <span className={styles.val}>{quand(dossier.created_at)}</span>
                </div>
                {!!dossier.created_by_avocat && (
                  <div className={styles.recapSideRow}>
                    <span className={styles.lbl}>Origine</span>
                    <span className={styles.val}>Cabinet</span>
                  </div>
                )}
              </div>

              <div className={styles.recapSideCard}>
                <h3>Aperçu</h3>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Pièces déposées</span>
                  <span className={styles.val}>{documents.length}</span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Pièces à vérifier</span>
                  <span className={styles.val}>{aVerifier}</span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Notes internes</span>
                  <span className={styles.val}>{notes.length}</span>
                </div>
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Messages non lus</span>
                  <span className={styles.val}>{nonLus}</span>
                </div>
              </div>

              <div className={styles.recapSideCard}>
                <h3>Actions rapides</h3>
                <div className={styles.recapQuickActions}>
                  {/* Les pièces sont sous le récapitulatif, dans ce même onglet. */}
                  <Link href={adresse("dossier") + "#pieces"}>Vérifier les pièces</Link>
                  <Link href={"/messagerie?dossier=" + dossier.id}>
                    Ouvrir la messagerie
                    {nonLus > 0 && <span className={styles.pastilleRouge}>{nonLus}</span>}
                  </Link>
                  <Link href={adresse("coulisses")}>Écrire une note interne</Link>
                  <Link href={adresse("coulisses") + "#journal"}>Voir le journal</Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {onglet === "dossier" && (
          <h3 className={styles.sectionTitre} id="pieces">
            Pièces du dossier
          </h3>
        )}

        {/*
          Ce que le dossier réclame et qui n'y est pas.

          La liste ne montrait que les documents présents : rien n'y disait qu'il
          manquait le rapport du commissaire aux apports, et il fallait connaître par
          cœur la liste attendue de chaque type de formalité pour s'en apercevoir. Un
          dossier incomplet avait exactement l'air d'un dossier complet.
        */}
        {onglet === "dossier" &&
          (pieces_.manquantes.length > 0 || pieces_.refusees.length > 0) && (
            <div className={styles.piecesManquantes} role="status">
              <p className={styles.piecesManquantesTitre}>
                {pieces_.manquantes.length + pieces_.refusees.length === 1
                  ? "Une pièce empêche le dépôt"
                  : pieces_.manquantes.length + pieces_.refusees.length +
                    " pièces empêchent le dépôt"}
              </p>
              <ul className={styles.piecesManquantesListe}>
                {pieces_.manquantes.map((piece) => (
                  <li key={piece.identifiant}>
                    {piece.titre}
                    <span className={styles.piecesManquantesMotif}>jamais déposée</span>
                  </li>
                ))}
                {pieces_.refusees.map((piece) => (
                  <li key={piece.identifiant}>
                    {piece.titre}
                    <span className={styles.piecesManquantesMotif}>
                      refusée, en attente de remplacement
                    </span>
                  </li>
                ))}
              </ul>
              <p className={styles.piecesManquantesNote}>
                Le client la voit manquante de son côté. Écrivez-lui si elle tarde.
              </p>
            </div>
          )}

        {onglet === "dossier" &&
          (documents.length === 0 && !statutsAProduire ? (
            <Vide ton="encart" texte="Aucune pièce déposée." />
          ) : (
            pieces.map((piece) => (
              <Piece key={piece.id} piece={piece} dossier={dossier.id} />
            ))
          ))}

        {/*
          Les statuts à jour, annoncés avant d'exister.
          
          Ils ne sont produits qu'à la sortie de l'éditeur de retouches : la liste des
          pièces ne les montrait donc pas, et rien n'y disait qu'un document manquait
          encore au dossier ni où on le fabrique. La ligne dit l'un et mène à l'autre.
        */}
        {onglet === "dossier" && statutsAProduire && (
          <div className={styles.docCard}>
            <div className={styles.docIcon}>
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
              </svg>
            </div>

            <div className={styles.docInfo}>
              <div className={styles.docName}>Statuts mis à jour</div>
              <div className={styles.docMeta}>
                <span className={`${styles.docEtat} ${styles.attente}`}>En cours de révision</span>
                <span>
                  chaque passage que les décisions changent est repris dans les statuts en
                  vigueur
                </span>
              </div>
            </div>

            <div className={styles.docActions}>
              <Link href={adresse("statuts")} className={styles.decisionPrincipale}>
                Mettre à jour les statuts
              </Link>
            </div>
          </div>
        )}

        {onglet === "coulisses" && (
          <>
            <h3 className={styles.sectionTitre}>Notes internes</h3>
            <div className={styles.notesIntro}>
              Visibles de votre équipe seulement. Le client ne les voit jamais.
            </div>
            <Notes
              dossierId={dossier.id}
              notes={notes.map((n) => ({
                id: n.id,
                contenu: n.content,
                auteur: n.users?.name ?? "Inconnu",
                date: n.created_at?.toISOString() ?? null,
              }))}
            />
          </>
        )}

        {onglet === "coulisses" && (
          <h3 className={styles.sectionTitre} id="journal">
            Journal du dossier
          </h3>
        )}

        {onglet === "coulisses" &&
          (historique.length === 0 ? (
            <Vide ton="encart" texte="Aucune intervention enregistrée." />
          ) : (
            <div className={styles.auditTimeline}>
              {historique.map((h) => (
                <div key={h.id} className={styles.auditItem}>
                  <span className={`${styles.auditIcon} ${styles[teinteJournal(h.action)]}`}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </span>

                  <div className={styles.auditBody}>
                    <div className={styles.auditLabel}>
                      <em>{h.users?.name ?? "Système"}</em> ·{" "}
                      {libelleJournal(h.action, type)}
                      {h.target_field ? " · " + h.target_field : ""}
                    </div>

                    {/*
                      Une valeur qui redit l'auteur n'apprend rien.

                      « Dossier pris en charge » inscrit le nom du preneur en valeur :
                      la ligne l'affichait donc deux fois, une fois en tête et une fois
                      dans une pastille verte juste dessous.
                    */}
                    {(h.before_value ||
                      (h.after_value && h.after_value !== h.users?.name)) && (
                      <div className={styles.auditDiff}>
                        {h.before_value && (
                          <span className={styles.auditBefore}>{h.before_value}</span>
                        )}
                        {h.before_value && h.after_value && <span>&nbsp;→&nbsp;</span>}
                        {h.after_value && (
                          <span className={styles.auditAfter}>{h.after_value}</span>
                        )}
                      </div>
                    )}

                    {h.comment && <div className={styles.auditComment}>{h.comment}</div>}
                    <div className={styles.auditDate}>{quand(h.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </main>
  );
}
