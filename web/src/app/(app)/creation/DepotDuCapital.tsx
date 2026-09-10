"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PIECE_DEPOT_CAPITAL } from "@/domain/formalite/documents";
import styles from "./Parcours.module.css";

/**
 * Le geste qui suit les actes : porter le capital à la banque.
 *
 * Le suivi le nommait - « Attestation de dépôt de capital », avec un bouton - mais il
 * ne disait pas comment s'y prendre, et le geste se faisait ailleurs que là où l'on
 * venait de récupérer les documents à porter. Le bloc se pose donc sous les actes :
 * on télécharge, on lit ce qu'on en fait, on dépose la réponse au même endroit.
 *
 * Il ne paraît qu'entre deux moments précis : quand l'avocat a rendu les actes - avant,
 * la banque n'ouvre pas de compte sans statuts - et tant que l'attestation n'est pas au
 * dossier.
 */
export function DepotDuCapital({ dossierId }: { dossierId: number }) {
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const champ = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function deposer(fichiers: FileList | null) {
    const fichier = fichiers?.[0];
    if (!fichier) return;

    setMessage(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("dossier", String(dossierId));
      donnees.set("piece", PIECE_DEPOT_CAPITAL);
      donnees.set("fichier", fichier);

      const reponse = await fetch("/api/formalites/pieces", { method: "POST", body: donnees });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setMessage({ ok: false, texte: corps.error ?? "Le dépôt n'a pas abouti" });
        if (champ.current) champ.current.value = "";
        return;
      }

      setMessage({ ok: true, texte: "Attestation enregistrée" });
      router.refresh();
    });
  }

  return (
    <section className={styles.capitalBloc} aria-labelledby="depot-du-capital">
      <h3 id="depot-du-capital" className={styles.capitalTitre}>
        Déposez votre capital en banque
      </h3>
      <p className={styles.capitalIntro}>
        Vos actes sont validés : votre banque peut désormais ouvrir le compte de dépôt.
      </p>

      <ol className={styles.capitalEtapes}>
        <li>
          <strong>Téléchargez vos statuts constitutifs et la liste des souscripteurs</strong>
          {" - "}
          ce sont les deux pièces que la banque demande pour ouvrir le compte.
        </li>
        <li>
          <strong>Versez le capital sur ce compte</strong> - le montant doit être celui
          qu&apos;annoncent vos statuts, au centime près.
        </li>
        <li>
          <strong>La banque vous délivre l&apos;attestation de dépôt</strong> - déposez-la ici.
        </li>
      </ol>

      {/*
        Ce que le dépôt déclenche, dit avant qu'on le fasse.

        L'attestation date les actes : c'est le jour où la banque la délivre qu'on signe
        les statuts. Ils sont donc reproduits à cette date - leur contenu ne bouge pas,
        seule la date suit - et la signature s'ouvre dans la foulée.
      */}
      <p className={styles.capitalConsequence}>
        Vos actes seront datés du jour de cette attestation, et la signature s&apos;ouvrira aussitôt
        : leur contenu ne change pas, seule la date suit.
      </p>

      <div className={styles.capitalAction}>
        <input
          ref={champ}
          id="depot-attestation-capital"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className={styles.capitalFichier}
          disabled={enCours}
          onChange={(e) => deposer(e.target.files)}
        />
        <label htmlFor="depot-attestation-capital" className={styles.capitalBouton}>
          {enCours ? "Envoi en cours…" : "Déposer l'attestation"}
        </label>
        <span className={styles.capitalPrecision}>PDF ou photo lisible</span>
      </div>

      {message && (
        <p
          className={message.ok ? styles.capitalReponse : styles.capitalRefus}
          role={message.ok ? "status" : "alert"}
        >
          {message.texte}
        </p>
      )}
    </section>
  );
}
