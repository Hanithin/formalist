import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirCessation,
  confirmerCessationAuRetour,
} from "@/infrastructure/db/depots/cessation";
import { actesDuDossier } from "@/infrastructure/db/depots/documents";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import { Suivi } from "@/components/formalite/Suivi";
import { Commencer } from "./Commencer";
import { Parcours } from "./Parcours";
import styles from "../modification/Modification.module.css";

export const metadata: Metadata = {
  title: "Fermer mon auto-entreprise - Formalist",
  robots: { index: false, follow: false },
};

/**
 * La cessation d'une auto-entreprise.
 *
 * Le parcours le plus court, et celui dont la valeur ne tient pas dans la formalité :
 * elle est gratuite et prend dix minutes. Elle tient dans ce qui suit - quatre
 * échéances, dont deux se comptent en jours, et qu'aucun écran ne donne datées.
 */
export default async function Cessation({
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

  if (!dossier) {
    return (
      <main className={styles.page}>
        <Fil />
        <div className={styles.content}>
          <h1 className={styles.titre}>Fermer mon auto-entreprise</h1>
          <Commencer />
        </div>
      </main>
    );
  }

  const dossierId = Number(dossier);

  /* Le retour de paiement se relit avant tout affichage : sinon on paie deux fois. */
  let issue: "regle" | "annule" | undefined;
  if (session) {
    const { paye } = await confirmerCessationAuRetour(utilisateur, dossierId, session);
    if (paye) issue = "regle";
  } else if (paiement === "annule") {
    issue = "annule";
  }

  const { cessation, dossier: ligne } = await ouvrirCessation(utilisateur, dossierId);
  const nom = cessation.entreprise.denomination || "Fermer mon auto-entreprise";

  if (cessation.paye && !issue) {
    return (
      <main className={styles.page}>
        <Fil nom={nom} />
        <div className={styles.content}>
          <h1 className={styles.titre}>{nom}</h1>
          <Suivi
            etat={await etatDuDossier(ligne)}
            demande={await derniereDemandeDeCorrections(dossierId)}
            lienAction={"/cessation?dossier=" + dossierId}
            lienMessagerie={"/messagerie?dossier=" + dossierId}
          />
          <div className={styles.confie}>
            <p className={styles.confieTexte}>
              Votre déclaration est entre nos mains. Les échéances qui vous reviennent -
              dernière déclaration de chiffre d&apos;affaires, TVA, CFE - figurent sur la
              déclaration récapitulative, dans vos documents.
            </p>
            <div className={styles.confieLiens}>
              <Link className={styles.confieLien} href="/documents">
                Voir mes documents
              </Link>
              <Link className={styles.confieLien} href={"/messagerie?dossier=" + dossierId}>
                Écrire au cabinet
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const demandee = Number(etape);
  const etapeInitiale = Number.isInteger(demandee) && demandee >= 1 && demandee <= 3 ? demandee : 1;

  return (
    <main className={styles.page}>
      <Fil nom={nom} />
      <div className={styles.content}>
        <h1 className={styles.titre}>
          {cessation.nature === "temporaire"
            ? "Suspendre mon auto-entreprise"
            : "Fermer mon auto-entreprise"}
        </h1>
        <Parcours
          dossier={dossierId}
          initial={cessation}
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
      <span>{nom ?? "Fermer mon auto-entreprise"}</span>
    </div>
  );
}
