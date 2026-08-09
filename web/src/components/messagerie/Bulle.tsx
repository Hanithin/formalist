"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Bulle.module.css";

interface Apercu {
  dossierId: number;
  societe: string;
  dernierMessage: string | null;
  nonLus: number;
}

/**
 * Bulle de messagerie, présente sur toutes les pages de l'application.
 *
 * Elle était dupliquée entre le tableau de bord et le formulaire de création du
 * serveur d'origine, avec des corrections qui tombaient dans la copie morte.
 * Elle n'apparaît pas sur la messagerie, qui est déjà la messagerie.
 */
export function Bulle() {
  const [ouverte, setOuverte] = useState(false);
  const [apercus, setApercus] = useState<Apercu[]>([]);
  const [total, setTotal] = useState(0);
  const chemin = usePathname();

  useEffect(() => {
    let vivant = true;

    async function relever() {
      try {
        const reponse = await fetch("/api/messages/non-lus");
        if (!reponse.ok || !vivant) return;
        const donnees = await reponse.json();
        setTotal(donnees.total);
        setApercus(donnees.conversations);
      } catch {
        // Le compteur est un confort : son échec ne doit rien interrompre.
      }
    }

    relever();
    const minuteur = setInterval(relever, 30_000);
    return () => {
      vivant = false;
      clearInterval(minuteur);
    };
  }, [chemin]);

  if (chemin?.startsWith("/messagerie")) return null;

  return (
    <>
      <button
        type="button"
        className={styles.bouton}
        onClick={() => setOuverte((o) => !o)}
        aria-expanded={ouverte}
        aria-label={total > 0 ? "Messages, " + total + " non lus" : "Messages"}
      >
        Messages
        {total > 0 && <span className={styles.pastille}>{total}</span>}
      </button>

      {ouverte && (
        <div className={styles.panneau} role="dialog" aria-label="Messages">
          {apercus.length === 0 ? (
            <p className={styles.aucun}>Aucune conversation pour le moment.</p>
          ) : (
            <ul className={styles.liste}>
              {apercus.map((a) => (
                <li key={a.dossierId}>
                  <Link href={"/messagerie?dossier=" + a.dossierId} onClick={() => setOuverte(false)}>
                    <span className={styles.societe}>{a.societe}</span>
                    <span className={styles.apercu}>{a.dernierMessage ?? "Aucun message"}</span>
                    {a.nonLus > 0 && <span className={styles.pastilleFil}>{a.nonLus}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
