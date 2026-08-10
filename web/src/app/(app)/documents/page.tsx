import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { listerDocuments } from "@/infrastructure/db/depots/documents";
import { FILTRES_DOCUMENTS, filtreValide, etatDocument } from "@/domain/document/statuts";
import { accorder } from "@/domain/formalite/etapes";
import { Filtres } from "@/components/liste/Filtres";
import { Etat } from "@/components/liste/Etat";
import { Vide } from "@/components/liste/Vide";
import styles from "@/components/liste/Liste.module.css";

export const metadata: Metadata = {
  title: "Documents - Formalist",
  robots: { index: false, follow: false },
};

export default async function Documents({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { filtre } = await searchParams;
  const actif = filtreValide(FILTRES_DOCUMENTS, filtre);
  const documents = await listerDocuments(utilisateur, actif);

  return (
    <main>
      <h1>Documents</h1>

      <Filtres filtres={FILTRES_DOCUMENTS} actif={actif} base="/documents" />

      {documents.length === 0 ? (
        <Vide
          titre="Aucun document"
          texte="Vos statuts, attestations et pièces déposées apparaîtront ici."
          action={{ libelle: "Créer une société", lien: "/creation?type=creation" }}
        />
      ) : (
        <>
          <p className={styles.compte}>{accorder(documents.length, "document", "documents")}</p>
          <ul className={styles.liste}>
            {documents.map((d) => {
              const etat = etatDocument({ status: d.statut, rejection_reason: d.motifRejet });
              return (
                <li key={d.id} className={styles.ligne}>
                  <span className={styles.titre}>{d.nom}</span>
                  <span className={styles.precision}>
                    {d.societe && <span>{d.societe}</span>}
                    <Etat libelle={etat.libelle} ton={etat.ton} />
                    {etat.motif && <span className={styles.motif}>Motif : {etat.motif}</span>}
                  </span>
                  {d.fichier && (
                    <a
                      href={"/api/fichier?nom=" + encodeURIComponent(d.fichier)}
                      className={styles.action}
                    >
                      Télécharger
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
