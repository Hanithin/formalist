"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarreDOutils,
  Espace,
  Recherche,
  Selecteur,
} from "@/components/page/BarreDOutils";
import styles from "./Societes.module.css";

/**
 * Ce qu'une ligne du registre montre, calculé côté serveur.
 *
 * Le filtre et la recherche répondent à la frappe : ils vivent donc ici. Ce qu'ils
 * trient, en revanche, se calcule une fois, là où sont les dossiers.
 */
export interface LigneDuRegistre {
  cle: string;
  denomination: string;
  forme: string;
  siren: string | null;
  etat: { cle: string; libelle: string; ton: string };
  formalites: string;
  enCours: number;
  echeance: { intitule: string; quand: string } | null;
}

/**
 * Les états proposés en filtre, dans l'ordre où on les cherche.
 *
 * Chacun porte ses deux formes : « Active 1 » se lisait « Actives 1 », et le nombre
 * démentait le mot posé juste à côté de lui. « En création » et « En fermeture » sont
 * des états, non des objets comptés : ils ne varient pas.
 */
const ETATS = [
  { cle: "active", singulier: "Active", pluriel: "Actives" },
  { cle: "en-creation", singulier: "En création", pluriel: "En création" },
  { cle: "en-fermeture", singulier: "En fermeture", pluriel: "En fermeture" },
  { cle: "radiee", singulier: "Radiée", pluriel: "Radiées" },
] as const;

function sansAccent(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Le portefeuille, avec de quoi y chercher.
 *
 * À huit sociétés on ne regarde plus la liste, on y cherche la sienne - et il n'y
 * avait ni recherche ni filtre : il fallait descendre la colonne des noms à l'œil.
 * Les autres listes de l'application ont les deux, sous le titre, à la même place.
 */
export function Registre({ societes }: { societes: LigneDuRegistre[] }) {
  const [etat, setEtat] = useState<string>("toutes");
  const [recherche, setRecherche] = useState("");

  const comptes = useMemo(() => {
    const par: Record<string, number> = { toutes: societes.length };
    for (const s of societes) par[s.etat.cle] = (par[s.etat.cle] ?? 0) + 1;
    return par;
  }, [societes]);

  const visibles = useMemo(() => {
    const cherche = sansAccent(recherche.trim());

    return societes.filter((s) => {
      if (etat !== "toutes" && s.etat.cle !== etat) return false;
      if (!cherche) return true;
      /* Le SIREN se cherche tel qu'on l'a sous les yeux, espaces compris. */
      return (
        sansAccent(s.denomination).includes(cherche) ||
        (s.siren ?? "").replace(/\s/g, "").includes(cherche.replace(/\s/g, ""))
      );
    });
  }, [societes, etat, recherche]);

  return (
    <>
      <BarreDOutils>
        <Selecteur
          intitule="Filtrer les sociétés"
          actif={etat}
          surChoix={setEtat}
          choix={[
            {
              valeur: "toutes",
              libelle: comptes.toutes <= 1 ? "Toute" : "Toutes",
              compte: comptes.toutes,
            },
            // Un filtre sans société ne s'affiche pas : on n'offre pas un chemin vide.
            ...ETATS.filter((e) => comptes[e.cle] > 0 || etat === e.cle).map((e) => ({
              valeur: e.cle,
              libelle: comptes[e.cle] <= 1 ? e.singulier : e.pluriel,
              compte: comptes[e.cle],
            })),
          ]}
        />

        <Espace />

        <Recherche
          valeur={recherche}
          invite="Nom ou SIREN…"
          libelle="Rechercher une société"
          identifiant="recherche-societe"
          surSaisie={setRecherche}
        />
      </BarreDOutils>

      {visibles.length === 0 ? (
        <p className={styles.vide}>
          Aucune société ne répond à cette recherche.{" "}
          <button
            type="button"
            className={styles.videLien}
            onClick={() => {
              setEtat("toutes");
              setRecherche("");
            }}
          >
            Voir toutes les sociétés
          </button>
        </p>
      ) : (
        <div className={styles.registre}>
          <div className={styles.registreEntete} aria-hidden="true">
            <span>Société</span>
            <span>SIREN</span>
            <span>État</span>
            <span>Formalités</span>
            <span>Prochaine échéance</span>
          </div>

          <ul className={styles.registreLignes}>
            {visibles.map((societe) => (
              <li key={societe.cle}>
                <Link href={"/societes/" + societe.cle} className={styles.ligneSociete}>
                  <span className={styles.celluleNom}>
                    <span className={styles.nom} title={societe.denomination}>
                      {societe.denomination}
                    </span>
                    <span className={styles.forme}>{societe.forme}</span>
                  </span>

                  {/*
                    Un tiret plutôt qu'un mot pour ce qui n'existe pas.
                    « Aucune » répété sur huit lignes fait une colonne de mots qu'on
                    lit, alors qu'il n'y a rien à y lire : le tiret se saute.
                  */}
                  <span className={styles.celluleSiren}>{societe.siren ?? "—"}</span>

                  <span className={styles.celluleEtat}>
                    <span
                      className={`${styles.badge} ${styles["badge-" + societe.etat.ton] ?? ""}`}
                    >
                      {societe.etat.libelle}
                    </span>
                  </span>

                  <span
                    className={
                      societe.enCours > 0
                        ? `${styles.celluleFormalites} ${styles.enCours}`
                        : styles.celluleFormalites
                    }
                  >
                    {societe.formalites}
                  </span>

                  <span className={styles.celluleEcheance}>
                    {societe.echeance ? (
                      <>
                        <span className={styles.echeanceNom}>{societe.echeance.intitule}</span>
                        <span className={styles.echeanceQuand}>{societe.echeance.quand}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>

                  <svg
                    className={styles.chevron}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
