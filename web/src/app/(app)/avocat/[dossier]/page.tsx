import type { Metadata } from "next";
import Link from "next/link";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { dossierPourAvocat } from "@/infrastructure/db/depots/avocat";
import { notFound } from "next/navigation";
import { libelleDossier, tonDossier } from "@/domain/formalite/etapes";
import { etatDocument } from "@/domain/document/statuts";
import { Etat } from "@/components/liste/Etat";
import { Notes } from "./Notes";
import { Verification } from "./Verification";
import styles from "../Avocat.module.css";

export const metadata: Metadata = {
  title: "Dossier - Espace avocat - Formalist",
  robots: { index: false, follow: false },
};

/** Les champs du brouillon, présentés avec le mot du métier. */
const CHAMPS: { cle: string; libelle: string }[] = [
  { cle: "denomination", libelle: "Dénomination" },
  { cle: "forme", libelle: "Forme juridique" },
  { cle: "activite", libelle: "Activité" },
  { cle: "adresse", libelle: "Adresse du siège" },
  { cle: "codePostal", libelle: "Code postal" },
  { cle: "ville", libelle: "Ville" },
  { cle: "capital", libelle: "Capital social" },
  { cle: "capitalLibere", libelle: "Capital libéré" },
];

export default async function DossierAvocat({
  params,
}: {
  params: Promise<{ dossier: string }>;
}) {
  const utilisateur = await exigerUtilisateur();
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  const { dossier: identifiant } = await params;
  const vue = await dossierPourAvocat(utilisateur, Number(identifiant)).catch(() => null);
  if (!vue) notFound();

  const { dossier, client, documents, notes, historique, donnees } = vue;

  const renseignes = CHAMPS.filter((c) => {
    const valeur = donnees[c.cle];
    return valeur !== undefined && valeur !== null && String(valeur).trim() !== "";
  });
  const manquants = CHAMPS.filter((c) => !renseignes.includes(c));

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>
        <Link href="/avocat">Espace avocat</Link> · Dossier
      </p>
      <h1 className={styles.titreDossier}>{dossier.societe || "Sans nom"}</h1>
      <p className={styles.resume}>
        {dossier.forme} · {client?.name} · {client?.email}
      </p>
      <Etat
        libelle={libelleDossier({ status: dossier.status, phase: dossier.phase, offer: dossier.offer })}
        ton={tonDossier({ status: dossier.status, phase: dossier.phase })}
      />

      <section className={styles.bloc}>
        <h2>Informations du dossier</h2>

        {manquants.length > 0 && (
          <p className={styles.manquants}>
            Pas encore renseigné par le client : {manquants.map((c) => c.libelle).join(", ")}
          </p>
        )}

        <dl className={styles.champs}>
          {renseignes.map((c) => (
            <div key={c.cle}>
              <dt>{c.libelle}</dt>
              <dd>{String(donnees[c.cle])}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.bloc}>
        <h2>Pièces du dossier</h2>
        {documents.length === 0 ? (
          <p className={styles.resume}>Aucune pièce déposée.</p>
        ) : (
          <ul className={styles.pieces}>
            {documents.map((d) => {
              const etat = etatDocument({ status: d.status, rejection_reason: d.rejection_reason });
              return (
                <li key={d.id}>
                  <span className={styles.piece}>{d.name}</span>
                  <Etat libelle={etat.libelle} ton={etat.ton} />
                  {etat.motif && <span className={styles.motif}>Motif : {etat.motif}</span>}
                  {d.file_path && (
                    <a href={"/api/fichier?nom=" + encodeURIComponent(d.file_path)}>Ouvrir</a>
                  )}
                  {d.status === "uploaded" && <Verification documentId={d.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.bloc}>
        <h2>Notes internes</h2>
        <p className={styles.resume}>
          Visibles de votre équipe seulement. Le client ne les voit jamais.
        </p>
        <Notes
          dossierId={dossier.id}
          notes={notes.map((n) => ({
            id: n.id,
            contenu: n.content,
            auteur: n.users?.name ?? "Inconnu",
            date: n.created_at?.toISOString() ?? null,
          }))}
        />
      </section>

      <section className={styles.bloc}>
        <h2>Interventions</h2>
        {historique.length === 0 ? (
          <p className={styles.resume}>Aucune intervention enregistrée.</p>
        ) : (
          <ul className={styles.historique}>
            {historique.map((h) => (
              <li key={h.id}>
                <span className={styles.quand}>
                  {h.created_at
                    ? new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(h.created_at)
                    : ""}
                </span>
                <span>{h.users?.name ?? "Système"}</span>
                <span className={styles.quoi}>{h.action}</span>
                {h.target_field && <span className={styles.motif}>{h.target_field}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
