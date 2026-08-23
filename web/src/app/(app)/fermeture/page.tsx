import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirFermeture,
  confirmerFermetureAuRetour,
} from "@/infrastructure/db/depots/fermeture";
import { actesDuDossier } from "@/infrastructure/db/depots/documents";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import { Suivi } from "@/components/formalite/Suivi";
import { Commencer } from "./Commencer";
import { Parcours } from "./Parcours";
import { EntreDeuxPhases } from "./EntreDeuxPhases";
import styles from "../modification/Modification.module.css";

export const metadata: Metadata = {
  title: "Fermer ma société - Formalist",
  robots: { index: false, follow: false },
};

/**
 * La fermeture d'une société.
 *
 * Elle se distingue de toutes les autres formalités par sa durée. Une dissolution suivie
 * d'une liquidation s'étale sur des mois, parfois sur trois ans, et le dossier reste
 * ouvert pendant tout ce temps. La page a donc trois visages :
 *
 *   - sans dossier, l'écran d'orientation, qui peut refuser d'en ouvrir un ;
 *   - avant règlement, le parcours de la phase en cours ;
 *   - après règlement de la dissolution, un écran d'attente qui dit ce qu'il reste à
 *     faire pendant la liquidation, et par lequel on repart vers la clôture.
 *
 * Le troisième est le plus important, et c'est celui qu'aucun parcours n'avait avant :
 * un dossier réglé y était un dossier fini. Ici, il lui reste la moitié du chemin.
 */
export default async function Fermeture({
  searchParams,
}: {
  searchParams: Promise<{
    dossier?: string;
    etape?: string;
    session?: string;
    paiement?: string;
    phase?: string;
  }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape, session, paiement, phase } = await searchParams;

  if (!dossier) {
    return (
      <main className={styles.page}>
        <Fil />
        <div className={styles.content}>
          <h1 className={styles.titre}>Fermer ma société</h1>
          <Commencer />
        </div>
      </main>
    );
  }

  const dossierId = Number(dossier);

  /*
   * Le retour de paiement est relu avant tout affichage.
   *
   * Sans cela, le client revient de sa banque sur la page du devis, sans savoir si
   * quelque chose a été débité - et paie une seconde fois.
   */
  let issue: "regle" | "annule" | undefined;
  if (session) {
    const { paye } = await confirmerFermetureAuRetour(utilisateur, dossierId, session);
    if (paye) issue = "regle";
  } else if (paiement === "annule") {
    issue = "annule";
  }

  const { fermeture, dossier: ligne } = await ouvrirFermeture(utilisateur, dossierId);
  const nom = fermeture.societe.denomination || "Fermer ma société";

  /*
   * Le dossier réglé, entre ses deux phases.
   *
   * On y arrive tant que la dissolution est payée et que la clôture n'a pas été
   * ouverte. Le paramètre `phase=cloture` en sort : c'est le client qui déclare que la
   * liquidation est terminée, parce que rien dans les données ne peut le dire à sa place.
   */
  const enAttente =
    fermeture.paye && fermeture.phase === "dissolution" && phase !== "cloture" && !issue;

  if (enAttente) {
    return (
      <main className={styles.page}>
        <Fil nom={nom} />
        <div className={styles.content}>
          <h1 className={styles.titre}>{nom}</h1>
          <Suivi
            etat={await etatDuDossier(ligne)}
            demande={await derniereDemandeDeCorrections(dossierId)}
            lienAction={"/fermeture?dossier=" + dossierId}
            lienMessagerie={"/messagerie?dossier=" + dossierId}
          />
          <EntreDeuxPhases dossier={dossierId} fermeture={fermeture} />
        </div>
      </main>
    );
  }

  const demandee = Number(etape);
  const etapeInitiale = Number.isInteger(demandee) && demandee >= 1 && demandee <= 4 ? demandee : 1;

  return (
    <main className={styles.page}>
      <Fil nom={nom} />
      <div className={styles.content}>
        <h1 className={styles.titre}>
          {fermeture.phase === "cloture" ? "Clôturer la liquidation" : "Fermer ma société"}
        </h1>
        <Parcours
          dossier={dossierId}
          initial={fermeture}
          etapeInitiale={etapeInitiale}
          issueDuPaiement={issue}
          actesInitiaux={await actesDuDossier(utilisateur, dossierId)}
        />
      </div>
    </main>
  );
}

function Fil({ nom }: { nom?: string }) {
  return (
    <div className={styles.topbar}>
      <Link href="/formalites">Mes formalités</Link>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
      <span>{nom ?? "Fermer ma société"}</span>
    </div>
  );
}
