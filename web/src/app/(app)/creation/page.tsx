import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouIntrouvable } from "../introuvable";
import {
  ouvrirBrouillon,
  lireBrouillon,
  confirmerAuRetourDeLaCreation,
} from "@/infrastructure/db/depots/brouillons";
import { actesDuDossier, documentsDuDossier } from "@/infrastructure/db/depots/documents";
import { dernierMotDuCabinet } from "@/infrastructure/db/depots/messages";
import { estClos } from "@/domain/acces/regles";
import { A_RELIRE } from "@/domain/document/publication";
import { rangDeLActe } from "@/domain/formalite/documents";
import { etapeAccessible, ETAPES } from "@/domain/formalite/parcours";
import { Parcours } from "./Parcours";
import { ETAPES_PLEINE_LARGEUR } from "./etapes-larges";
import { Suivi } from "@/components/formalite/Suivi";
import { adresseDuDossier } from "@/domain/formalite/liste";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import styles from "./Parcours.module.css";

export const metadata: Metadata = {
  title: "Créer une société - Formalist",
  robots: { index: false, follow: false },
};

export default async function Creation({
  searchParams,
}: {
  searchParams: Promise<{
    dossier?: string;
    etape?: string;
    session?: string;
    paiement?: string;
  }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape, session, paiement } = await searchParams;

  /*
   * Le retour de paiement est relu avant tout affichage.
   *
   * Sans cela, le client revient de sa banque sur l'étape des offres, sans savoir si
   * quelque chose a été débité - et paie une seconde fois. Le relais de Stripe
   * confirmerait aussi, mais il arrive quand il arrive, et pas du tout en local.
   */
  if (session && dossier) {
    await confirmerAuRetourDeLaCreation(utilisateur, Number(dossier), session);
  }

  /*
   * Rien n'est écrit tant que rien n'est saisi.
   *
   * L'écran ouvrait un dossier dès son affichage, pour que l'adresse porte un
   * identifiant. Un visiteur qui regardait la page et repartait laissait donc derrière
   * lui une formalité « Sans nom », comptée « en cours », réclamée par le tableau de
   * bord, et posée en tête de la file de travail de l'avocat - qui ouvrait sa journée
   * sur quatre dossiers vides.
   *
   * Le dossier naît maintenant au premier enregistrement, dans `Parcours`. Ce n'est
   * pas une perte : le parcours n'a jamais sauvegardé en continu, il persiste au
   * changement d'étape. Ce qui est saisi sans franchir l'étape 1 n'était pas gardé
   * avant non plus.
   */
  const ligne = dossier ? (await ouIntrouvable(ouvrirBrouillon(utilisateur, Number(dossier)))).dossier : null;

  /*
   * Chaque parcours a sa page.
   *
   * Rien n'empêchait d'ouvrir une modification ou une auto-entreprise ici : l'écran
   * affichait alors le fil de la création - « Capital », « Associé », « Offres » -
   * au-dessus d'un formulaire de création vide, pour un dossier qui n'en est pas un.
   *
   * L'adresse vient de la table qui la connaît, plutôt que d'une liste de types
   * recopiée ici : une première version comparait à « auto-entreprise » quand la
   * valeur stockée est « auto-entrepreneur », et la garde ne se déclenchait jamais.
   */
  if (ligne) {
    const adresse = adresseDuDossier(ligne);
    if (!adresse.startsWith("/creation")) redirect(adresse);
  }

  const brouillon = lireBrouillon(ligne?.data_json ?? null);
  const documents = ligne ? await documentsDuDossier(utilisateur, ligne.id) : [];

  // Les deux vivent dans la même table et se distinguent par leur statut :
  // « uploaded » pour une pièce remise par le client, « generated » pour un acte
  // produit à partir du brouillon. Le type, lui, porte l'extension.
  const deposees = documents.filter((d) => d.status !== "generated");
  const actes = documents.filter((d) => d.status === "generated");

  /*
   * Les actes que l'avocat n'a pas encore relus, qui ne sont pas des documents.
   *
   * `documentsDuDossier` les écarte, et c'est ce qu'il doit faire : un acte non relu ne
   * se télécharge pas, ne s'envoie pas à sa banque et ne se signe pas. Mais les taire
   * donnait « Aucun document produit pour l'instant » sur un dossier qui vient d'être
   * réglé et dont les cinq actes sont produits - on croyait le paiement sans effet, et
   * l'on cliquait « Générer les documents » par-dessus.
   *
   * `actesDuDossier` rend leur titre et leur état, jamais le chemin du fichier : ils
   * s'affichent, ils ne s'ouvrent pas.
   */
  /*
   * Ce que le cabinet a écrit en dernier, et ce qui reste à lire.
   *
   * Le parcours ne porte pas de messagerie - elle existe à sa place, complète - mais un
   * client qui remplit son dossier ne va pas la consulter de lui-même : la demande
   * d'une pièce y dormait sans que rien ici ne la signale.
   */
  const dernierMot = ligne
    ? await dernierMotDuCabinet(utilisateur, ligne.id)
    : { message: null, nonLus: 0 };

  const enRelecture = ligne
    ? (await actesDuDossier(utilisateur, ligne.id)).filter((a) => a.enRelecture)
    : [];
  /*
   * Un dossier confié s'ouvre sur ses documents, non sur son formulaire.
   *
   * Sans étape dans l'adresse, on retombait sur la première : le client qui rouvrait
   * un dossier réglé arrivait sur « Forme juridique », un écran où il n'a plus rien à
   * saisir, et devait franchir six étapes pour retrouver ses actes et son suivi.
   *
   * Une étape demandée explicitement l'emporte toujours : le suivi renvoie à l'étape
   * des pièces pour déposer l'attestation, et ce lien doit continuer d'y mener.
   */
  const confie = ligne !== null && ligne.status !== "en_cours";

  /*
   * Un dossier confié ne se fait plus barrer par une étape incomplète.
   *
   * `etapeAccessible` empêche de sauter par-dessus ce qui n'est pas rempli : la
   * répartition du capital n'a pas de sens sans les associés. La règle vaut tant qu'on
   * remplit ; elle n'a plus d'objet une fois le dossier chez l'avocat, où il n'y a rien
   * à compléter.
   *
   * Elle se retournait alors contre le client. Un dossier ouvert avant le format actuel
   * ne se relit pas : son brouillon paraît vide, la première étape incomplète est la
   * première, et une société immatriculée s'ouvrait sur « Choisissez une forme » -
   * formulaire vierge à gauche, suivi complet à droite.
   *
   * Un dossier renvoyé pour corrections fait exception : il est revenu dans les mains
   * du client, qui reprend précisément ce qui manque. La règle vaut de nouveau, et
   * c'est elle qui le pose devant la case à corriger.
   */
  const aReprendre = ligne?.status === "corrections_demandees";
  const demandee = Number(etape) || (confie ? ETAPES.length : 1);
  const courante =
    confie && !aReprendre
      ? Math.min(Math.max(demandee, 1), ETAPES.length)
      : etapeAccessible(demandee, brouillon);


  /*
   * Le suivi n'apparaît qu'une fois le dossier transmis.
   *
   * Tant qu'on le remplit, le fil des sept étapes dit déjà où on en est ; deux
   * indicateurs d'avancement côte à côte se contrediraient. Après la transmission, en
   * revanche, le formulaire ne dit plus rien de ce qui se passe.
   */
  const etat = confie && ligne ? await etatDuDossier(ligne) : null;

  /*
   * L'étape des offres se passe de la colonne de droite, et prend toute la largeur :
   * trois tarifs dans sept cent trente pixels s'y coupaient sur quatre lignes. Un
   * dossier confié, lui, garde sa colonne : c'est là que vit son suivi.
   */
  const large =
    !etat &&
    ETAPES_PLEINE_LARGEUR.includes(ETAPES.find((e) => e.numero === courante)?.identifiant ?? "");



  return (
    <main className={styles.page}>
      <div className={large ? `${styles.content} ${styles.contentLarge}` : styles.content}>
        {/*
          Le formulaire reste, même une fois le dossier parti chez l'avocat.
          Le masquer paraissait juste - il n'y a plus d'informations à saisir - mais
          c'est par lui que le client dépose l'attestation de dépôt de capital et
          celle de parution, que le suivi et les courriels lui réclament précisément
          à ce moment-là. Le formulaire vide qu'on y voyait venait d'un dossier d'un
          autre type ouvert à cette adresse, ce que la redirection ci-dessus règle.

          L'en-tête, lui, vit dans `Parcours`, non ici.

          Le titre nomme la société qu'on remplit, et le suit à la frappe : il lui faut
          le brouillon du navigateur. Le suivi, lui, se rend au serveur et descend en
          élément, pour se placer sous cet en-tête plutôt qu'avant lui.
        */}
        <Parcours
          dossierId={ligne?.id ?? null}
          quand={new Date()}
          dernierMot={dernierMot}
          paiementAnnule={paiement === "annule"}
          connuDuDossier={
            ligne
              ? {
                  denomination: ligne.societe,
                  forme: ligne.forme,
                  capital: ligne.capital,
                }
              : undefined
          }
          suivi={
            etat && ligne ? (
              <Suivi
                compact
                etat={etat}
                demande={await derniereDemandeDeCorrections(ligne.id)}
                lienAction={"/creation?dossier=" + ligne.id + "&etape=5"}
                lienMessagerie={"/messagerie?dossier=" + ligne.id}
              />
            ) : null
          }
          etapes={ETAPES}
          etapeCourante={courante}
          brouillonInitial={brouillon}
          piecesDeposees={deposees.map((d) => ({ type: d.type, nom: d.name }))}
          actesProduits={[
            ...actes.map((d) => ({
              id: d.id,
              nom: d.name,
              fichier: d.file_path,
              statut: d.status,
            })),
            ...enRelecture.map((a) => ({
              id: a.id,
              nom: a.titre,
              fichier: null,
              statut: A_RELIRE,
            })),
            /*
             * Les statuts en tête.
             *
             * La liste sortait dans l'ordre de la base - à égalité de date de
             * production, le dernier écrit en premier : le client ouvrait ses documents
             * sur le procès-verbal de nomination et descendait chercher ses statuts,
             * l'acte qui fonde la société, celui qu'il porte à sa banque et qu'il signe
             * en premier.
             */
          ].sort((a, b) => rangDeLActe(a.nom) - rangDeLActe(b.nom))}
          /* Une société immatriculée ne signe plus ses statuts constitutifs. */
          dossierClos={estClos(ligne?.status)}
        />
      </div>
    </main>
  );
}
