"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nomDeLOffre } from "@/domain/formalite/offres";
import { nomDeLaPartie } from "@/domain/formalite/etat-civil";
import { personneDuDirigeant } from "@/domain/formalite/gabarit";
import type { Brouillon } from "@/domain/formalite/parcours";
import { Champ } from "./EtatCivil";
import styles from "./Parcours.module.css";

/**
 * La dernière étape : les actes produits, à relire et à faire signer.
 *
 * Reprise de l'étape « Mes documents » de public/creation.html. Trois gestes s'y
 * enchaînent : produire les documents, les relire, ouvrir les signatures. Ils sont
 * présentés dans cet ordre et non côte à côte - signer un acte qu'on n'a pas relu
 * est précisément ce qu'il faut éviter.
 *
 * Les signataires ne sont pas saisis ici : ce sont les associés du dossier, avec
 * leur email. Les faire retaper ouvrirait la porte à une signature demandée à la
 * mauvaise adresse.
 */

export interface ActeProduit {
  id: number;
  nom: string;
  fichier: string | null;
  statut: string | null;
}

interface Props {
  dossierId: number;
  brouillon: Brouillon;
  actes: ActeProduit[];
  surNote: (texte: string) => void;
}

export function Actes({ dossierId, brouillon, actes, surNote }: Props) {
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const associes = brouillon.associes ?? [];

  /** Les signataires : les associés qui portent un nom et une adresse email. */
  const signataires = associes
    .map((a) => ({
      nom: nomDeLaPartie(a),
      email: a.personne?.email?.trim() ?? "",
    }))
    .filter((s) => s.nom && s.email);

  const sansEmail = associes.filter(
    (a) => nomDeLaPartie(a) && !a.personne?.email?.trim()
  );

  function produire() {
    setMessage(null);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as {
        error?: string;
        etape?: number;
        documents?: unknown[];
      };

      if (!reponse.ok) {
        setMessage({
          ok: false,
          texte: corps.etape
            ? "Le dossier est incomplet : reprenez à l'étape " + corps.etape + "."
            : (corps.error ?? "La production des documents a été interrompue"),
        });
        return;
      }

      setMessage({
        ok: true,
        texte: (corps.documents?.length ?? 0) + " document(s) produits. Relisez-les avant signature.",
      });
      router.refresh();
    });
  }

  function ouvrirSignatures() {
    setMessage(null);

    demarrer(async () => {
      const reponse = await fetch("/api/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier: dossierId, signataires }),
      });
      const corps = (await reponse.json().catch(() => ({}))) as { error?: string };

      if (!reponse.ok) {
        setMessage({ ok: false, texte: corps.error ?? "L'ouverture des signatures a échoué" });
        return;
      }

      setMessage({
        ok: true,
        texte:
          "Demande envoyée à " +
          signataires.map((s) => s.nom).join(", ") +
          ". Chacun reçoit son lien par email.",
      });
      router.refresh();
    });
  }

  const dirigeant = personneDuDirigeant((brouillon.dirigeants ?? [])[0], associes);

  return (
    <div className={styles.full}>
      {/* ---------- Ce que le dossier va produire ---------- */}
      <dl className={styles.recap}>
        <div className={styles.recapItem}>
          <dt>Société</dt>
          <dd>
            {brouillon.forme ?? "?"} {brouillon.denomination ?? "sans nom"}
          </dd>
        </div>
        <div className={styles.recapItem}>
          <dt>Formule</dt>
          <dd>{nomDeLOffre(brouillon.offre)}</dd>
        </div>
        <div className={styles.recapItem}>
          <dt>Dirigeant</dt>
          <dd>{[dirigeant.prenom, dirigeant.nom].filter(Boolean).join(" ") || "-"}</dd>
        </div>
        <div className={styles.recapItem}>
          <dt>Associés</dt>
          <dd>{associes.length}</dd>
        </div>
      </dl>

      {/* ---------- Les actes ---------- */}
      <div className={styles.actes}>
        <div className={styles.actesEntete}>
          <h3 className={styles.actesTitre}>Vos documents</h3>
          <button
            type="button"
            className={styles.actesBouton}
            onClick={produire}
            disabled={enCours}
          >
            {actes.length > 0 ? "Régénérer les documents" : "Générer les documents"}
          </button>
        </div>

        {actes.length === 0 ? (
          <p className={styles.actesVide}>
            Aucun document produit pour l&apos;instant. Les statuts, la liste des souscripteurs et
            les déclarations sont générés à partir de ce que vous avez saisi.
          </p>
        ) : (
          <ul className={styles.actesListe}>
            {actes.map((a) => (
              <li key={a.id}>
                <span className={styles.acteNom}>{a.nom}</span>
                {a.fichier ? (
                  <a
                    href={"/api/fichier?nom=" + encodeURIComponent(a.fichier)}
                    className={styles.acteLien}
                  >
                    Télécharger
                  </a>
                ) : (
                  <span className={styles.acteAbsent}>Fichier indisponible</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- La signature ---------- */}
      <div className={styles.actes}>
        <div className={styles.actesEntete}>
          <h3 className={styles.actesTitre}>Signature</h3>
          <button
            type="button"
            className={styles.actesBouton}
            onClick={ouvrirSignatures}
            /* Rien à signer tant que rien n'est produit, et personne à qui
               l'envoyer sans adresse email. */
            disabled={enCours || actes.length === 0 || signataires.length === 0}
          >
            Demander les signatures
          </button>
        </div>

        {signataires.length > 0 ? (
          <p className={styles.actesVide}>
            Chaque signataire reçoit son propre lien par email :{" "}
            {signataires.map((s) => s.nom + " (" + s.email + ")").join(", ")}.
          </p>
        ) : (
          <p className={styles.actesVide}>
            Aucun signataire : renseignez l&apos;adresse email des associés à l&apos;étape
            « Société ».
          </p>
        )}

        {sansEmail.length > 0 && signataires.length > 0 && (
          <p role="alert">
            {sansEmail.length} associé(s) sans adresse email ne recevront pas de demande.
          </p>
        )}
      </div>

      {/* ---------- Le mot à l'avocat ---------- */}
      <div className={styles.formGrid}>
        <Champ id="noteAvocat" libelle="Note pour l'avocat (optionnel)" pleineLargeur>
          <textarea
            id="noteAvocat"
            rows={4}
            placeholder="Une précision sur votre situation, une question à poser avant la relecture..."
            value={brouillon.noteAvocat ?? ""}
            onChange={(e) => surNote(e.target.value)}
          />
        </Champ>
      </div>

      {message && (
        <p role={message.ok ? "status" : "alert"} aria-live="polite">
          {message.texte}
        </p>
      )}
    </div>
  );
}
