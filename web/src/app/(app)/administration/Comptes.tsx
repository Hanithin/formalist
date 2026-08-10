"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLES_CONNUS, libelleRole } from "@/domain/acces/administration";
import type { Role } from "@/domain/acces/regles";
import styles from "./Administration.module.css";

interface Compte {
  id: number;
  nom: string;
  email: string;
  roles: Role[];
  suspendu: boolean;
  derniereConnexion: string | null;
}

export function Comptes({ comptes, moi }: { comptes: Compte[]; moi: number }) {
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  const filtres = comptes.filter((c) => {
    const q = recherche.trim().toLowerCase();
    if (!q) return true;
    return c.nom.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  function appliquer(chemin: string, corps: object) {
    setErreur(null);
    demarrer(async () => {
      const reponse = await fetch("/api/administration/" + chemin, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      if (!reponse.ok) {
        const donnees = await reponse.json().catch(() => ({}));
        setErreur(donnees.error ?? "Le changement n'a pas été appliqué");
        return;
      }
      router.refresh();
    });
  }

  function basculerRole(compte: Compte, role: Role) {
    const roles = compte.roles.includes(role)
      ? compte.roles.filter((r) => r !== role)
      : [...compte.roles, role];
    appliquer("roles", { compte: compte.id, roles });
  }

  return (
    <>
      <label htmlFor="recherche">Rechercher un compte</label>
      <input
        id="recherche"
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Nom ou adresse email"
      />

      <p role="status" aria-live="polite" className={styles.precision}>
        {filtres.length === 0
          ? "Aucun compte ne correspond"
          : filtres.length === 1
            ? "1 compte"
            : filtres.length + " comptes"}
      </p>

      {erreur && (
        <p role="alert" className={styles.erreur}>
          {erreur}
        </p>
      )}

      <ul className={styles.comptes}>
        {filtres.map((compte) => (
          <li key={compte.id} className={compte.suspendu ? styles.compteSuspendu : styles.compte}>
            <span className={styles.identite}>
              <span className={styles.nom}>{compte.nom}</span>
              <span className={styles.email}>{compte.email}</span>
            </span>

            <span className={styles.roles}>
              {ROLES_CONNUS.map((role) => (
                <label key={role} className={styles.role}>
                  <input
                    type="checkbox"
                    checked={compte.roles.includes(role)}
                    disabled={enCours}
                    onChange={() => basculerRole(compte, role)}
                  />
                  {libelleRole(role)}
                </label>
              ))}
            </span>

            {compte.id === moi && <span className={styles.vous}>Vous</span>}
            {compte.suspendu && <span className={styles.suspendu}>Suspendu</span>}

            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                appliquer("suspension", { compte: compte.id, suspendu: !compte.suspendu })
              }
            >
              {compte.suspendu ? "Réactiver" : "Suspendre"}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
