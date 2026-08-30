import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirDeclaration, lire } from "@/infrastructure/db/depots/auto-entrepreneur";
import { ETAPES, premiereEtapeIncomplete } from "@/domain/auto-entrepreneur/declaration";
import { Declaration } from "./Declaration";
import { confirmerAuRetour } from "@/infrastructure/db/depots/auto-entrepreneur";
import { Suivi } from "@/components/formalite/Suivi";
import { documentsDuDossier } from "@/infrastructure/db/depots/documents";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import styles from "./AutoEntrepreneur.module.css";

export const metadata: Metadata = {
  title: "Créer une auto-entreprise - Formalist",
  robots: { index: false, follow: false },
};

export default async function AutoEntrepreneur({
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
   * Le retour du paiement.
   *
   * On relit la session auprès de Stripe plutôt que de croire l'adresse, et avant de
   * lire la déclaration : sans cela le client revenait sur l'offre qu'il venait de
   * régler, parce que le webhook n'était pas encore passé - ou pas passé du tout.
   */
  const regleALInstant =
    dossier && session
      ? (await confirmerAuRetour(utilisateur, Number(dossier), session)).paye
      : false;

  /*
   * Rien n'est écrit tant que rien n'est saisi.
   *
   * L'écran ouvrait une déclaration dès son affichage. Un visiteur qui regardait la
   * page et repartait laissait derrière lui une formalité vide, comptée « en cours »
   * et posée dans la file de travail de l'avocat. La déclaration naît maintenant au
   * premier enregistrement, dans `Declaration` - qui ne persiste de toute façon qu'au
   * changement d'étape.
   */
  const ouverte = dossier ? await ouvrirDeclaration(utilisateur, Number(dossier)) : null;
  const ligne = ouverte?.dossier ?? null;
  const declaration = ouverte?.declaration ?? lire(null);

  // Les pièces déjà remises : les cartes du dépôt les annoncent plutôt que de laisser
  // croire qu'il reste tout à faire.
  const documents = ligne ? await documentsDuDossier(utilisateur, ligne.id) : [];
  const deposees = documents.filter((d) => d.status !== "generated");

  // On ne saute pas par-dessus une étape incomplète : les suivantes s'appuient
  // sur ce qui précède.
  const bloquante = premiereEtapeIncomplete(declaration) ?? ETAPES.length;
  const demandee = Number(etape) || 1;

  /*
   * Une fois réglée, la déclaration ne se reprend plus.
   *
   * Elle est entre les mains d'un avocat qui va la déposer : la laisser modifier
   * ferait déposer autre chose que ce qui a été relu, et revenir sur l'offre déjà
   * payée ferait douter d'avoir payé.
   */
  /*
   * On s'arrête au récapitulatif, non à l'offre : c'est ce qui a été déposé qu'on
   * vient relire, et le suivi au-dessus dit déjà où en est le dossier. Répéter
   * « c'est réglé » sous un suivi qui annonce des corrections se contredirait.
   */
  const recapitulatif = ETAPES.length - 1;
  const courante = declaration.paye ? recapitulatif : Math.min(Math.max(demandee, 1), bloquante);

  /*
   * Le même cadre que la création de société : une ligne de tête qui nomme la personne,
   * le formulaire à gauche et le récapitulatif à droite.
   *
   * Le fil d'ariane a été retiré. Il écrivait « Tableau de bord › Créer une
   * auto-entreprise » en gris clair au-dessus d'un titre masqué en `clip-path` : rien
   * à l'écran ne disait de qui était le dossier, et le seul rôle propre du fil -
   * repartir - est tenu par le bouton de retour de la ligne de tête.
   */
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <Declaration
          dossierId={ligne?.id ?? null}
          etapes={ETAPES}
          etapeCourante={courante}
          declarationInitiale={declaration}
          piecesDeposees={deposees.map((d) => ({ type: d.type, nom: d.name }))}
          regleALInstant={regleALInstant}
          paiementAnnule={paiement === "annule"}
          quand={new Date()}
          /*
            Le suivi n'apparaît qu'une fois la déclaration confiée : tant qu'on la
            remplit, le fil des huit étapes dit déjà où on en est, et deux indicateurs
            d'avancement côte à côte se contrediraient.

            Il est passé en propriété plutôt que rendu ici, pour se placer sous la ligne
            de tête - que le formulaire rend, puisque le titre suit la frappe.
          */
          suivi={
            declaration.paye && ligne ? (
              <div className={styles.suivi}>
                <Suivi
                  etat={await etatDuDossier(ligne)}
                  demande={await derniereDemandeDeCorrections(ligne.id)}
                  lienAction={"/auto-entrepreneur?dossier=" + ligne.id}
                  lienMessagerie={"/messagerie?dossier=" + ligne.id}
                />
              </div>
            ) : null
          }
        />
      </div>
    </main>
  );
}
