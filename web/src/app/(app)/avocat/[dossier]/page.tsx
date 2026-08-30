import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { dossierPourAvocat, versionsDuDossier } from "@/infrastructure/db/depots/avocat";
import { formulaireDuDossier } from "@/infrastructure/db/depots/correction";
import { messagesDuDossier } from "@/infrastructure/db/depots/messages";
import { etatCabinet } from "@/domain/formalite/avocat";
import { estPropose } from "@/domain/acces/regles";
import { etatDesPieces } from "@/domain/formalite/pieces";
import { piecesAttenduesDuDossier } from "@/infrastructure/documents/pieces-attendues";
import { libelleDuType } from "@/domain/formalite/liste";
import { libelleJournal } from "@/domain/formalite/journal";
import { SOUS_PHASES_ORDONNEES, estSousPhase } from "@/domain/formalite/avocat";
import { Notes } from "./Notes";
import { Travail } from "./Travail";
import { Statuts } from "./Statuts";
import { Annonce } from "./Annonce";
import {
  travailDuCabinet,
  prochaineTache,
  typeDeDossier,
  type TypeDeDossier,
} from "@/domain/formalite/cabinet";
import { statutsAMettreAJour, TITRE_STATUTS_A_JOUR } from "@/domain/modification/formalites";
import { publicationsAPrevoir } from "@/domain/modification/formalites";
import { villeDuRcs } from "@/infrastructure/documents/rcs";
import { aRelire } from "@/domain/document/publication";
import { Piece, type PieceAffichee } from "./Piece";
import { Corriger } from "./Corriger";
import { Historique, type EntreeDuJournal } from "./Historique";
import { Communication, type MessageDuFil } from "./Communication";
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
 * Le travail d'abord, puis les documents, puis le récapitulatif - qu'on relit rarement,
 * et jamais avant de savoir ce qu'il reste à faire.
 *
 * « Coulisses » nommait mal ce qu'il contenait - des notes internes et un journal - et
 * les cachait derrière un mot qui ne dit rien. Les deux rejoignent le bas du
 * récapitulatif, où l'on relit le dossier.
 */
const ONGLETS = [
  "travail",
  "documents",
  "dossier",
  "statuts",
  "annonce",
  "communication",
  "historique",
] as const;
type Onglet = (typeof ONGLETS)[number];

const NOMS: Record<Onglet, string> = {
  historique: "Historique",
  communication: "Communication",
  dossier: "Récapitulatif",
  travail: "À faire",
  documents: "Documents",
  statuts: "Statuts",
  annonce: "Annonce légale",
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
  pieces: "documents",
  avancement: "travail",
  notes: "dossier",
  journal: "dossier",
  coulisses: "dossier",
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

  const { dossier, client, documents, notes, historique, donnees, nonLus, payeCentimes, dossiersAPrendre } = vue;

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
  const type: TypeDeDossier = typeDeDossier(dossier.type);

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

  /*
   * Combien d'avis ce dossier fait-il paraître ?
   *
   * Une modification en publie un par ressort touché ; une création et une fermeture
   * en publient un - la constitution et la dissolution s'annoncent, la loi l'exige. Le
   * calcul ne connaissait que la modification, si bien que le cabinet n'avait aucune
   * tâche sur les deux autres : le suivi du client annonçait « le cabinet fait paraître
   * l'avis » sur une étape que personne ne pouvait cocher, et la route qui la déclare
   * n'était appelée par aucun écran.
   */
  const avisAPublier =
    type === "creation" || type === "fermeture"
      ? 1
      : type === "modification"
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
        : 0;

  /*
   * Où lire et déclarer l'avis.
   *
   * Une modification a sa route - un avis par ressort touché ; les autres parcours
   * passent par la route commune, qui compose un texte unique.
   */
  const routeDeLAnnonce =
    type === "modification" ? "/api/formalites/modification/annonce" : "/api/formalites/annonce";

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
    /*
     * Combien d'avis ce dossier fait-il paraître ?
     *
     * Une modification en publie un par ressort touché ; une création et une fermeture
     * en publient un - la constitution et la dissolution s'annoncent, la loi l'exige.
     * Le calcul ne connaissait que la modification, si bien que le cabinet n'avait pas
     * de tâche sur les deux autres : le suivi du client annonçait « le cabinet fait
     * paraître l'avis » sur une étape que personne ne pouvait cocher, et la route qui
     * la déclare n'était appelée par aucun écran.
     */
    avisAPublier,
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
  /*
   * Les champs du dossier, pour la fenêtre de correction.
   *
   * Chaque parcours déclare les siens et range ses valeurs à sa façon : le dépôt fait
   * la correspondance, l'écran n'a qu'une liste à rendre.
   */
  const formulaire = await formulaireDuDossier(utilisateur, dossier.id);

  /*
   * Le journal, mis en forme ici : la fenêtre ne fait que le rendre.
   *
   * Il occupait le bas du récapitulatif, déroulé quel que soit son âge - quarante
   * lignes d'interventions sous une fiche qu'on ouvre pour relire une adresse.
   */
  const entreesDuJournal: EntreeDuJournal[] = historique.map((h) => ({
    id: h.id,
    auteur: h.users?.name ?? "Système",
    libelle: libelleJournal(h.action, type),
    champ: h.target_field,
    /*
     * Les codes d'étape ne se montrent pas.
     *
     * Un changement d'étape inscrit « 5c » et « 5d » : la ligne affichait « 5e → 5d »
     * sous un libellé qui dit déjà « Étape annoncée au client : Dépôt ». Personne n'a
     * jamais tapé ces codes, et ils ne veulent rien dire pour qui les lit.
     */
    avant: h.action.startsWith("sous_phase_") || h.action.startsWith("etat_")
      ? null
      : h.before_value,
    /* Une valeur qui redit l'auteur n'apprend rien : « Dossier pris en charge » y
       inscrit le nom du preneur, que la ligne porte déjà. */
    apres:
      h.action.startsWith("sous_phase_") || h.action.startsWith("etat_")
        ? null
        : h.after_value && h.after_value !== h.users?.name
          ? h.after_value
          : null,
    commentaire: h.comment,
    quand: quand(h.created_at),
    teinte: teinteJournal(h.action),
  }));

  /*
   * Le fil du dossier, le même que celui de la messagerie.
   *
   * Écrire au client demandait de quitter le dossier, d'y retrouver le bon fil, puis de
   * revenir : on écrivait de mémoire, sans ce qu'on voulait commenter sous les yeux.
   */
  const fil: MessageDuFil[] = (await messagesDuDossier(utilisateur, dossier.id)).map((m) => ({
    id: m.id,
    expediteurId: m.expediteurId,
    expediteur: m.expediteur,
    contenu: m.contenu,
    fichier: m.fichier,
    quand: quand(m.envoyeLe),
  }));

  /* Les versions antérieures des actes produits, rangées par titre. */
  const versionsParActe = await versionsDuDossier(dossier.id);

  const pieces: PieceAffichee[] = documents.map((d) => ({
    id: d.id,
    nom: d.name,
    statut: d.status,
    motifRejet: d.rejection_reason,
    fichier: d.file_path,
    source: d.source_path,
    depose: d.uploaded_by,
    creeLe: d.created_at?.toISOString() ?? null,
    versions: versionsParActe.get(d.name),
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
  /*
   * Quand le dossier s'est achevé.
   *
   * La date se lit au journal, à l'entrée qui a posé la dernière étape - qu'un document
   * du greffe l'ait close ou que l'avocat ait déclaré qu'il n'en viendrait aucun.
   * « Dossier terminé » sans date ne dit pas si c'était ce matin ou l'an dernier.
   */
  const cloture = historique.find(
    (h) => h.action === "sous_phase_5e" || h.action === "depot_sans_document"
  );
  const termineLe = cloture?.created_at ? quand(cloture.created_at) : null;

  /*
   * L'étape d'avant : rouvrir un dossier clos le ramène d'un cran.
   *
   * Nulle au départ - il n'y a rien à défaire tant que rien n'a été annoncé.
   */
  const rang = estSousPhase(dossier.business_sub_phase)
    ? SOUS_PHASES_ORDONNEES.indexOf(dossier.business_sub_phase)
    : -1;
  const etapePrecedente = rang > 0 ? SOUS_PHASES_ORDONNEES[rang - 1] : null;

  /* Ce qu'il reste à faire, pour la pastille de l'onglet. */
  const restantes = taches.length - faites;

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
            {/* Le vert du dossier fini : l'ambre dit « en cours » partout ailleurs. */}
            <span
              className={`${styles.detailBadge} ${styles.phase} ${
                etat.teinte === "green" ? styles.phaseVerte : ""
              }`}
            >
              {etat.libelle}
            </span>
          </div>
          {/*
            La forme et l'état du dossier ont quitté la barre.

            « SELAS · En attente de validation » n'apprenait rien à qui travaille sur le
            dossier : la forme se lit au récapitulatif, et l'état du dossier redit ce que
            la pastille dit déjà, dans d'autres mots.
          */}
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

            {/*
              Le nom du client, non « Assigné à vous ».
              
              L'avocat sait que le dossier est le sien - il vient de l'ouvrir depuis sa
              liste. Ce qu'il ne sait pas de tête, c'est pour qui il travaille.
            */}
            <span className={styles.bandeauAssigneTitre}>{client?.name ?? "Client inconnu"}</span>

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
              {/*
                Ce qu'il reste à faire se compte sur l'onglet.
                
                « À faire » n'en portait aucun : il fallait l'ouvrir pour savoir s'il
                restait quelque chose, alors que c'est la question qu'on se pose en
                arrivant.
              */}
              {o === "travail" && restantes > 0 && (
                <span className={styles.tabCount}>{restantes}</span>
              )}
              {/*
                Un compte sur un onglet dit de quoi il s'agit.
                
                « Récapitulatif 1 » ne disait pas ce qu'était ce 1 - une note ? une
                pièce ? Les pièces à vérifier appartiennent aux documents depuis qu'ils
                ont leur onglet.
              */}
              {o === "dossier" && notes.length > 0 && (
                <span className={styles.tabCount}>
                  {notes.length} note{notes.length > 1 ? "s" : ""}
                </span>
              )}
              {/*
                Ce qui attend une décision passe avant le décompte : « 3 documents »
                n'apprend rien à qui doit en vérifier un.
              */}
              {o === "documents" &&
                (aVerifier > 0 ? (
                  <span className={styles.tabCount}>{aVerifier} à vérifier</span>
                ) : (
                  documents.length > 0 && (
                    <span className={styles.tabCount}>{documents.length}</span>
                  )
                ))}
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
              /* La tâche nomme ce qu'elle réclame, au lieu de le compter. */
              manquantes={[
                ...pieces_.manquantes.map((p) => ({
                  identifiant: p.identifiant,
                  titre: p.titre,
                  motif: "jamais déposée",
                })),
                ...pieces_.refusees.map((p) => ({
                  identifiant: p.identifiant,
                  titre: p.titre,
                  motif: "refusée, en attente de remplacement",
                })),
              ]}
              /*
               * Une modification les produit toujours ; les autres parcours quand ils
               * n'en ont pas. À la création, les actes naissent à l'encaissement, dont
               * l'échec est rattrapé par un commentaire promettant « les actes se
               * régénèrent d'un clic côté cabinet » - un clic qui n'existait pas. La
               * tâche renvoyait vers l'onglet des documents, où rien ne les produit.
               */
              peutProduireLesActes={
                type === "modification" || !documents.some((d) => d.uploaded_by === "system")
              }
              routeDeProduction={
                type === "modification"
                  ? "/api/formalites/modification/documents"
                  : "/api/formalites/documents"
              }
              informationsVerifiees={informationsVerifiees}
              dossiersAPrendre={dossiersAPrendre}
              etapePrecedente={etapePrecedente}
              termineLe={termineLe}
              correctionsEnCours={dossier.status === "corrections_demandees"}
              pieces={pieces}
              /* Les documents remis sont les pièces de l'étape « Déposer ». */
              livrables={{
                documentFinal: DOCUMENT_FINAL[type],
                aLeKbis: remis(TYPE_KBIS),
                aLeRbe: remis(TYPE_RBE),
                /*
                 * Le registre se dépose à la constitution et se met à jour quand la
                 * détention change : un dépôt de comptes n'y touche pas.
                 */
                registreConcerne: type === "creation" || type === "modification",
              }}
            />
          </>
        )}

        {/*
          Tous les documents du dossier, avec ce qu'on peut en faire.

          Ils n'étaient atteignables que par les tâches qui les nomment : celui qu'on
          veut relire ou reprendre hors de son étape - un acte déjà validé, une pièce
          déjà décidée - n'avait aucun chemin. Ici, chacun porte ses gestes : ouvrir,
          corriger le Word, déposer sa version, valider, revenir sur la décision.
        */}
        {onglet === "documents" && (
          <>
            <div className={styles.documentsTete}>
              <h3 className={styles.sectionTitre}>Documents du dossier</h3>
              {/*
                Corriger la source, plutôt que le document.
                
                Reprendre un acte au Word laissait la faute dans le dossier : l'acte
                suivant la reprenait, et le document remis ne correspondait plus aux
                données dont il sortait.
              */}
              <Corriger
                dossier={dossier.id}
                champs={formulaire.champs}
                valeurs={formulaire.valeurs}
              />
            </div>
        {/*
          Ce que le dossier réclame et qui n'y est pas.

          La liste ne montrait que les documents présents : rien n'y disait qu'il
          manquait le rapport du commissaire aux apports, et il fallait connaître par
          cœur la liste attendue de chaque type de formalité pour s'en apercevoir. Un
          dossier incomplet avait exactement l'air d'un dossier complet.
        */}
        {(pieces_.manquantes.length > 0 || pieces_.refusees.length > 0) && (
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


            {pieces.length === 0 ? (
              <Vide ton="encart" texte="Aucun document au dossier pour l'instant." />
            ) : (
              pieces.map((piece) => (
                <Piece key={piece.id} piece={piece} dossier={dossier.id} />
              ))
            )}
        {/*
          Les statuts à jour, annoncés avant d'exister.
          
          Ils ne sont produits qu'à la sortie de l'éditeur de retouches : la liste des
          pièces ne les montrait donc pas, et rien n'y disait qu'un document manquait
          encore au dossier ni où on le fabrique. La ligne dit l'un et mène à l'autre.
        */}
        {statutsAProduire && (
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

          </>
        )}

        {/*
          Écrire au client sans quitter le dossier.

          Il fallait passer par la messagerie, y retrouver le bon fil, puis revenir :
          on écrivait de mémoire, sans ce qu'on voulait commenter sous les yeux. C'est
          le même fil - la même table, le même point d'entrée.
        */}
        {onglet === "communication" && (
          <Communication
            dossier={dossier.id}
            moi={utilisateur.id}
            messages={fil}
            client={{ nom: client?.name ?? "Client", courriel: client?.email ?? null }}
            documents={documents.length}
            aVerifier={aVerifier}
            nonLus={nonLus}
          />
        )}

        {/*
          Le journal du dossier, dans son onglet.
          
          Il s'ouvrait en fenêtre depuis les gestes rapides du récapitulatif : on le
          cherchait dans une colonne, alors qu'il se lit comme le reste du dossier.
        */}
        {onglet === "historique" && <Historique entrees={entreesDuJournal} />}

        {onglet === "statuts" &&
          (type === "modification" ? (
            <Statuts dossier={dossier.id} />
          ) : (
            <Vide
              ton="encart"
              texte="La retouche des statuts ne concerne que les modifications de société."
            />
          ))}

        {/*
          L'écran disait « sur ce dossier, l'annonce légale est publiée par le client »
          - le contraire de ce que le suivi promet au client, et de ce que la route de
          déclaration dit d'elle-même. Le cabinet publie, ici comme ailleurs ; ne
          restent sans avis que les parcours qui n'en font paraître aucun.
        */}
        {onglet === "annonce" &&
          (avisAPublier > 0 ? (
            <Annonce dossier={dossier.id} route={routeDeLAnnonce} />
          ) : (
            <Vide
              ton="encart"
              texte="Ce dossier ne fait paraître aucune annonce légale."
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
                {/*
                  Ce que le client a réglé.
                  
                  L'avocat lisait l'offre - « Starter » - sans savoir ce qu'elle avait
                  coûté, ni même si elle avait été payée.
                */}
                <div className={styles.recapSideRow}>
                  <span className={styles.lbl}>Réglé</span>
                  <span className={styles.val}>
                    {payeCentimes > 0
                      ? (payeCentimes / 100).toLocaleString("fr-FR", {
                          minimumFractionDigits: 2,
                        }) + " €"
                      : "Rien encaissé"}
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

              {/*
                Les notes internes se tiennent avec le reste de ce qui n'est pas le
                dossier lui-même : elles occupaient le bas de la page, sous le
                récapitulatif, où l'on ne pensait pas à les chercher.
              */}
              <div className={styles.recapSideCard}>
                <h3>Notes internes</h3>
                {/*
                  L'avertissement tenait dans un encadré violet de trois lignes, en tête
                  d'une carte de colonne large de trois cents pixels : il pesait plus que
                  les notes qu'il annonce. Une ligne grise suffit.
                */}
                <p className={styles.notesMention}>
                  Votre équipe seulement. Le client ne les voit jamais.
                </p>
                <Notes
                  dossierId={dossier.id}
                  notes={notes.map((n) => ({
                    id: n.id,
                    contenu: n.content,
                    auteur: n.users?.name ?? "Inconnu",
                    date: n.created_at?.toISOString() ?? null,
                  }))}
                />
              </div>

              <div className={styles.recapSideCard}>
                <h3>Actions rapides</h3>
                {/*
                  Deux des quatre menaient à des sections qui n'existent plus : les
                  pièces vivent dans l'onglet des documents, les notes juste au-dessus,
                  et le journal s'ouvre en fenêtre.
                */}
                <div className={styles.recapQuickActions}>
                  <Link href={adresse("documents")}>Voir les documents</Link>
                  <Link href={adresse("communication")}>
                    Écrire au client
                    {nonLus > 0 && <span className={styles.pastilleRouge}>{nonLus}</span>}
                  </Link>
                  <Link href={adresse("historique")}>Voir l&apos;historique</Link>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
