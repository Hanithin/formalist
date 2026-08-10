"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./Consultations.module.css";

interface Avocat {
  id: number;
  name: string;
}

interface Creneau {
  debut: string;
  fin: string;
}

function journee(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(iso)
  );
}

function heure(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

export function PriseDeRendezVous({ avocats }: { avocats: Avocat[] }) {
  const [avocat, setAvocat] = useState(avocats[0]?.id ?? 0);
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  // Changer d'avocat vide la liste avant d'aller chercher la nouvelle : sans ça,
  // les créneaux du précédent restent affichés et se cliquent. On le fait dans le
  // même passage que la requête, pas dans un rendu enchaîné.
  useEffect(() => {
    let vivant = true;

    fetch("/api/consultations/creneaux?avocat=" + avocat)
      .then((r) => (r.ok ? r.json() : { creneaux: [] }))
      .then((d) => {
        if (vivant) setCreneaux(d.creneaux);
      })
      .catch(() => {
        if (vivant) setCreneaux([]);
      });

    return () => {
      vivant = false;
    };
  }, [avocat]);

  function reserver(donnees: FormData) {
    if (!choisi) {
      setRetour({ ok: false, texte: "Choisissez un créneau" });
      return;
    }
    setRetour(null);

    demarrer(async () => {
      const reponse = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avocat,
          debut: choisi,
          sujet: donnees.get("sujet"),
          description: donnees.get("description"),
        }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        const premier = corps.details ? Object.values(corps.details)[0] : null;
        setRetour({
          ok: false,
          texte: (Array.isArray(premier) ? premier[0] : corps.error) ?? "Réservation impossible",
        });
        // Le créneau vient peut-être d'être pris : on recharge la liste.
        if (reponse.status === 409) setChoisi(null);
        return;
      }

      setRetour({ ok: true, texte: "Rendez-vous confirmé" });
      setChoisi(null);
      router.refresh();
    });
  }

  // Regroupement par journée, pour ne pas dérouler une liste d'heures brutes.
  const journees = (creneaux ?? []).reduce<Record<string, Creneau[]>>((acc, c) => {
    const cle = c.debut.slice(0, 10);
    (acc[cle] ??= []).push(c);
    return acc;
  }, {});

  return (
    <form action={reserver} className={styles.formulaire}>
      <label htmlFor="avocat">Avocat</label>
      <select
        id="avocat"
        value={avocat}
        onChange={(e) => {
          setAvocat(Number(e.target.value));
          setCreneaux(null);
          setChoisi(null);
        }}
      >
        {avocats.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <fieldset className={styles.creneaux}>
        <legend>Créneau</legend>

        {creneaux === null && <p>Recherche des disponibilités…</p>}
        {creneaux !== null && creneaux.length === 0 && (
          <p>Aucun créneau disponible dans les deux prochaines semaines.</p>
        )}

        {Object.entries(journees).map(([jour, liste]) => (
          <div key={jour} className={styles.journee}>
            <p className={styles.jour}>{journee(liste[0].debut)}</p>
            <div className={styles.heures}>
              {liste.map((c) => (
                <label
                  key={c.debut}
                  className={c.debut === choisi ? styles.heureChoisie : styles.heure}
                >
                  <input
                    type="radio"
                    name="creneau"
                    value={c.debut}
                    checked={c.debut === choisi}
                    onChange={() => setChoisi(c.debut)}
                  />
                  {heure(c.debut)}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <label htmlFor="sujet">Sujet</label>
      <input id="sujet" name="sujet" required maxLength={200} placeholder="Ce dont vous voulez parler" />

      <label htmlFor="description">Précisions (facultatif)</label>
      <textarea id="description" name="description" rows={3} maxLength={2000} />

      <button type="submit" disabled={enCours}>
        {enCours ? "Réservation" : "Réserver ce créneau"}
      </button>

      {retour && (
        <p role={retour.ok ? "status" : "alert"} aria-live="polite">
          {retour.texte}
        </p>
      )}
    </form>
  );
}
