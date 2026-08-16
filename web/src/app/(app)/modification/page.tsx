import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  ouvrirModification,
  societesConnues,
  confirmerAuRetour,
} from "@/infrastructure/db/depots/modifications";
import { Parcours, type EtatDuDossier } from "./Parcours";
import { Commencer } from "./Commencer";
import styles from "./Modification.module.css";

export const metadata: Metadata = {
  title: "Modifier ma société - Formalist",
  robots: { index: false, follow: false },
};

/**
 * Le parcours de modification.
 *
 * Sans dossier en cours, la page en ouvre un : la société se choisit à la première
 * étape, par recherche au registre. C'est ce qui permet de modifier une société créée
 * ailleurs - c'est-à-dire la plupart d'entre elles.
 */
export default async function Modification({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; etape?: string; session?: string; paiement?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { dossier, etape, session, paiement } = await searchParams;

  if (!dossier) {
    return (
      <main className={styles.page}>
        <div className={styles.topbar}>
          <Link href="/formalites">Mes formalités</Link>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Modifier ma société</span>
        </div>

        <div className={styles.content}>
          <h1 className={styles.titre}>Modifier ma société</h1>
          <Commencer societes={await societesConnues(utilisateur)} />
        </div>
      </main>
    );
  }

  const dossierId = Number(dossier);

  /*
   * Le retour de paiement est relu ici, avant tout affichage.
   *
   * Sans cela, le client revient de sa banque sur la page du devis, sans savoir si
   * quelque chose a été débité - et paie une seconde fois.
   */
  let issue: "regle" | "annule" | undefined;
  if (session) {
    const { paye } = await confirmerAuRetour(utilisateur, dossierId, session);
    if (paye) issue = "regle";
  } else if (paiement === "annule") {
    issue = "annule";
  }

  const { modification } = await ouvrirModification(utilisateur, dossierId);

  // Un dossier réglé n'a plus rien à faire dans le parcours de saisie : son suivi vit
  // dans « Mes formalités ».
  if (modification.paye && !issue) redirect("/formalites");

  const initial: EtatDuDossier = {
    codes: modification.codes,
    societe: modification.societe,
    valeurs: modification.valeurs,
    assemblee: modification.assemblee,
    statuts: modification.statuts,
    retouches: modification.retouches,
    statutsAJour: modification.statutsAJour,
    paye: modification.paye,
  };

  const demandee = Number(etape);
  const etapeInitiale = Number.isInteger(demandee) && demandee >= 1 && demandee <= 7 ? demandee : 1;

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <Link href="/formalites">Mes formalités</Link>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{modification.societe.denomination || "Modifier ma société"}</span>
      </div>

      <div className={styles.content}>
        <h1 className={styles.titre}>Modifier ma société</h1>
        <Parcours
          dossier={dossierId}
          initial={initial}
          societesConnues={await societesConnues(utilisateur)}
          etapeInitiale={etapeInitiale}
          issueDuPaiement={issue}
        />
      </div>
    </main>
  );
}
