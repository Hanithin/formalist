import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirComptes, confirmerComptesAuRetour } from "@/infrastructure/db/depots/comptes";
import { actesDuDossier } from "@/infrastructure/db/depots/documents";
import { etatDuDossier } from "@/infrastructure/db/depots/suivi";
import { derniereDemandeDeCorrections } from "@/infrastructure/db/depots/avocat";
import { Suivi } from "@/components/formalite/Suivi";
import { Commencer } from "./Commencer";
import { Parcours } from "./Parcours";
import styles from "../modification/Modification.module.css";

export const metadata: Metadata = {
  title: "Dépôt des comptes annuels - Formalist",
  robots: { index: false, follow: false },
};

/**
 * L'approbation et le dépôt des comptes annuels.
 *
 * Sans dossier en cours, la page en ouvre un : la société se choisit à la première
 * étape, par recherche au registre, comme pour une modification. C'est ce qui permet
 * de déposer les comptes d'une société créée ailleurs.
 */
export default async function DepotDesComptes({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; etape?: string; session?: string; paiement?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape, session, paiement } = await searchParams;

  if (!dossier) {
    return (
      <main className={styles.page}>
        <Fil />
        <div className={styles.content}>
          <h1 className={styles.titre}>Dépôt des comptes annuels</h1>
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
    const { paye } = await confirmerComptesAuRetour(utilisateur, dossierId, session);
    if (paye) issue = "regle";
  } else if (paiement === "annule") {
    issue = "annule";
  }

  const { comptes, dossier: ligne } = await ouvrirComptes(utilisateur, dossierId);
  const nom = comptes.societe.denomination || "Dépôt des comptes annuels";

  /*
   * Un dossier réglé n'a plus rien à saisir, mais il a tout à suivre.
   *
   * Il renvoyait à « Mes formalités », d'où l'on venait justement de cliquer sur sa
   * carte : le clic ne faisait rien, et le client n'avait aucun endroit où voir où en
   * était son dépôt.
   */
  if (comptes.paye && !issue) {
    return (
      <main className={styles.page}>
        <Fil nom={nom} />
        <div className={styles.content}>
          <h1 className={styles.titre}>{nom}</h1>
          <Suivi
            etat={await etatDuDossier(ligne)}
            demande={await derniereDemandeDeCorrections(dossierId)}
            lienAction={"/depot-des-comptes?dossier=" + dossierId}
            lienMessagerie={"/messagerie?dossier=" + dossierId}
          />
          <div className={styles.confie}>
            <p className={styles.confieTexte}>
              Vos comptes sont réglés et suivis par le cabinet. Vous n&apos;avez rien à
              remplir : l&apos;avancement ci-dessus dit où en est le dépôt, et vous serez
              prévenu si quelque chose doit être repris.
            </p>
            <div className={styles.confieLiens}>
              <Link className={styles.confieLien} href={"/messagerie?dossier=" + dossierId}>
                Écrire à l&apos;avocat
              </Link>
              <Link className={styles.confieLien} href="/documents">
                Voir mes documents
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const demandee = Number(etape);
  const etapeInitiale = Number.isInteger(demandee) && demandee >= 1 && demandee <= 7 ? demandee : 1;

  return (
    <main className={styles.page}>
      <Fil nom={nom} />
      <div className={styles.content}>
        <h1 className={styles.titre}>Dépôt des comptes annuels</h1>
        <Parcours
          dossier={dossierId}
          initial={comptes}
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
      <span>{nom ?? "Dépôt des comptes annuels"}</span>
    </div>
  );
}
