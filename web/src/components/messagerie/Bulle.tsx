"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Vide } from "@/components/liste/Vide";
import styles from "./Bulle.module.css";

/** La bulle de dialogue, dessinée : le pictogramme se lit d'un coup d'œil. */
function IconeMessagerie() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9.1 9.1 0 01-3.7-.7L3 21l1.9-4.9A8.2 8.2 0 014 11.5a8.4 8.4 0 019-8.4 8.4 8.4 0 018 8.4z" />
    </svg>
  );
}

interface Apercu {
  /** Nul pour le fil du support, qui n'est rattaché à aucun dossier. */
  dossierId: number | null;
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
        {/*
          Le pictogramme plutôt que le mot.
          Une pastille noire portant « Messages » flottait sur chaque page comme une
          étiquette ; l'icône dit la même chose sans occuper la moitié du coin.
        */}
        <IconeMessagerie />
        {total > 0 && <span className={styles.pastille}>{total}</span>}
      </button>

      {ouverte && (
        <div className={styles.panneau} role="dialog" aria-label="Messages">
          {apercus.length === 0 ? (
            <Vide ton="discret" texte="Aucune conversation pour le moment." />
          ) : (
            <ul className={styles.liste}>
              {apercus.map((a) => (
                <li key={a.dossierId ?? "support"}>
                  <Link
                    href={
                      a.dossierId === null
                        ? "/messagerie?fil=support"
                        : "/messagerie?dossier=" + a.dossierId
                    }
                    onClick={() => setOuverte(false)}
                  >
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
