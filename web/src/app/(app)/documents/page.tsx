import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { listerDocuments } from "@/infrastructure/db/depots/documents";
import { mesDossiers } from "@/infrastructure/db/depots/dossiers";
import { adresseDuDossier } from "@/domain/formalite/liste";
import { dateEnTete } from "@/lib/dates";
import { Bibliotheque, type DocumentAffiche } from "./Bibliotheque";
import styles from "./Documents.module.css";

export const metadata: Metadata = {
  title: "Documents - Formalist",
  robots: { index: false, follow: false },
};

/**
 * La bibliothèque de documents.
 *
 * Tout est chargé d'un coup : les quatre filtres annoncent chacun leur décompte, et
 * une liste déjà réduite par le serveur ne permettrait pas de les calculer. Le
 * rangement, la recherche et le filtrage se font ensuite sur place - c'est ce que
 * faisait la page d'origine, et ce que font déjà « Mes formalités » et la page de
 * consultation.
 *
 * Les dates traversent en ISO : ce qui part au navigateur est sérialisé, et une Date
 * y arriverait en chaîne sans que le type le dise.
 */
export default async function Documents() {
  const utilisateur = await exigerUtilisateur();
  const [documents, dossiers] = await Promise.all([
    listerDocuments(utilisateur),
    mesDossiers(utilisateur),
  ]);

  const affiches: DocumentAffiche[] = documents.map((d) => ({
    ...d,
    creeLe: d.creeLe ? d.creeLe.toISOString() : null,
  }));

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <h1>Documents</h1>
        <span className={styles.topbarDate}>{dateEnTete()}</span>
      </div>
      <p className={styles.introduction}>
        Tout ce qui est produit ou déposé sur vos dossiers, rangé par société.
      </p>

      <div className={styles.content}>
        <Bibliotheque
          documents={affiches}
          societes={dossiers.map((d) => ({
            id: d.id,
            nom: d.societe?.trim() || "Sans nom",
            lien: adresseDuDossier(d),
          }))}
        />
      </div>
    </main>
  );
}
