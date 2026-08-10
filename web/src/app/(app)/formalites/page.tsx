import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { listerFormalites } from "@/infrastructure/db/depots/documents";
import { FILTRES_FORMALITES, filtreValide } from "@/domain/document/statuts";
import { libelleDossier, tonDossier, avancement, accorder } from "@/domain/formalite/etapes";
import { Filtres } from "@/components/liste/Filtres";
import { Etat } from "@/components/liste/Etat";
import { Vide } from "@/components/liste/Vide";
import styles from "@/components/liste/Liste.module.css";

export const metadata: Metadata = {
  title: "Mes formalités - Formalist",
  robots: { index: false, follow: false },
};

export default async function Formalites({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  const { filtre } = await searchParams;
  const actif = filtreValide(FILTRES_FORMALITES, filtre);
  const dossiers = await listerFormalites(utilisateur, actif);

  return (
    <main>
      <h1>Mes formalités</h1>

      <Filtres filtres={FILTRES_FORMALITES} actif={actif} base="/formalites" />

      {dossiers.length === 0 ? (
        actif === "tous" ? (
          <Vide
            icone="/formalites"
            titre="Aucune formalité"
            texte="Vos créations, modifications et fermetures de société se suivent ici, étape par étape."
            action={{ libelle: "Créer une société", lien: "/creation?type=creation" }}
            secondaire={{ libelle: "Créer mon auto-entreprise", lien: "/auto-entrepreneur" }}
          />
        ) : (
          <Vide
            ton="filtre"
            icone="/formalites"
            titre="Aucune formalité dans ce filtre"
            texte="Vous en avez peut-être dans un autre état."
            action={{ libelle: "Voir toutes les formalités", lien: "/formalites" }}
          />
        )
      ) : (
        <>
          <p className={styles.compte}>
            {accorder(dossiers.length, "formalité", "formalités")}
          </p>
          <ul className={styles.liste}>
            {dossiers.map((d) => (
              <li key={d.id} className={styles.ligne}>
                <Link href={"/formalites/" + d.id} className={styles.titre}>
                  {d.societe || "Sans nom"}
                </Link>
                <span className={styles.precision}>
                  <span className={styles.avancement}>{avancement(d.phase ?? 1, d.offer)}%</span>
                  {d.forme}
                </span>
                <span className={styles.etat}>
                  <Etat libelle={libelleDossier(d)} ton={tonDossier(d)} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
