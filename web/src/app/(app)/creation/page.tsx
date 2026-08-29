import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirBrouillon, lireBrouillon } from "@/infrastructure/db/depots/brouillons";
import { documentsDuDossier } from "@/infrastructure/db/depots/documents";
import { etapeAccessible, ETAPES } from "@/domain/formalite/parcours";
import { Parcours } from "./Parcours";
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
  searchParams: Promise<{ dossier?: string; etape?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape } = await searchParams;

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
  const ligne = dossier ? (await ouvrirBrouillon(utilisateur, Number(dossier))).dossier : null;

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
  const courante = etapeAccessible(Number(etape) || 1, brouillon);

  /*
   * Le suivi n'apparaît qu'une fois le dossier transmis.
   *
   * Tant qu'on le remplit, le fil des sept étapes dit déjà où on en est ; deux
   * indicateurs d'avancement côte à côte se contrediraient. Après la transmission, en
   * revanche, le formulaire ne dit plus rien de ce qui se passe.
   */
  const transmis = ligne !== null && ligne.status !== "en_cours";
  const etat = transmis ? await etatDuDossier(ligne) : null;



  return (
    <main className={styles.page}>
      <div className={styles.content}>
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
              <div className={styles.suivi}>
                <Suivi
                  etat={etat}
                  demande={await derniereDemandeDeCorrections(ligne.id)}
                  lienAction={"/creation?dossier=" + ligne.id + "&etape=5"}
                  lienMessagerie={"/messagerie?dossier=" + ligne.id}
                />
              </div>
            ) : null
          }
          etapes={ETAPES}
          etapeCourante={courante}
          brouillonInitial={brouillon}
          piecesDeposees={deposees.map((d) => ({ type: d.type, nom: d.name }))}
          actesProduits={actes.map((d) => ({
            id: d.id,
            nom: d.name,
            fichier: d.file_path,
            statut: d.status,
          }))}
        />
      </div>
    </main>
  );
}
