import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { dossiersDuCabinet } from "@/infrastructure/db/depots/avocat";
import { notFound } from "next/navigation";
import { libelleDossier, tonDossier, accorder } from "@/domain/formalite/etapes";
import { Etat } from "@/components/liste/Etat";
import { Vide } from "@/components/liste/Vide";
import styles from "./Avocat.module.css";

export const metadata: Metadata = {
  title: "Espace avocat - Formalist",
  robots: { index: false, follow: false },
};

export default async function EspaceAvocat() {
  const utilisateur = await exigerUtilisateur();

  // Un client n'a rien à faire ici. On rend un 404 plutôt qu'un refus explicite,
  // comme pour les dossiers et les fichiers : la réponse ne doit pas renseigner
  // sur ce qui existe.
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  const dossiers = await dossiersDuCabinet(utilisateur);

  const aVerifier = dossiers.reduce((n, d) => n + d.documentsAVerifier, 0);

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Espace avocat</p>
      <h1>Dossiers du cabinet</h1>

      {dossiers.length === 0 ? (
        <Vide
          titre="Aucun dossier"
          texte="Les dossiers qui vous sont assignés, et ceux de votre cabinet, apparaîtront ici."
        />
      ) : (
        <>
          <p className={styles.resume}>
            {accorder(dossiers.length, "dossier", "dossiers")}
            {aVerifier > 0 && ", " + accorder(aVerifier, "pièce à vérifier", "pièces à vérifier")}
          </p>

          <ul className={styles.dossiers}>
            {dossiers.map((d) => (
              <li key={d.id} className={styles.dossier}>
                <Link href={"/avocat/" + d.id} className={styles.nom}>
                  {d.societe}
                </Link>
                <span className={styles.forme}>{d.forme}</span>
                <span className={styles.client}>{d.client}</span>
                <Etat
                  libelle={libelleDossier({ status: d.status, phase: d.phase, offer: d.offre })}
                  ton={tonDossier({ status: d.status, phase: d.phase })}
                />
                {d.monDossier && <span className={styles.mien}>Assigné à vous</span>}
                {d.documentsAVerifier > 0 && (
                  <span className={styles.aVerifier}>
                    {accorder(d.documentsAVerifier, "pièce à vérifier", "pièces à vérifier")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
