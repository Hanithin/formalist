"use client";

import { useEffect, useRef, useState } from "react";
import { formeDeLaCategorie, libelleDeLaCategorie } from "@/domain/formalite/categories-juridiques";
import styles from "@/app/(app)/modification/Modification.module.css";

/**
 * Chercher une société au registre, partout où un acte doit en nommer une.
 *
 * Le composant vivait au milieu du parcours de modification, quatre mille sept cents
 * lignes, et trois autres parcours allaient l'y prendre - la fermeture, le dépôt des
 * comptes, la cessation - en important la page d'un parcours voisin pour un champ de
 * recherche. Le quatrième ne le pouvait pas : la cession de parts est un composant de
 * ce même parcours, et l'import aurait bouclé.
 *
 * Il est donc ici, avec les autres champs. La feuille de styles reste celle de la
 * modification : les classes y sont écrites, et les recopier ailleurs aurait fait deux
 * apparences pour un seul champ.
 */

export interface ResultatRecherche {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  nature_juridique?: string;
  siege?: { adresse?: string; code_postal?: string; libelle_commune?: string };
}

/**
 * La recherche au registre, partagée.
 *
 * La société du dossier et les associés personnes morales se cherchent au même
 * endroit : l'annuaire public des entreprises, gratuit et sans clé. Recopier une
 * dénomination, un SIREN et un siège à la main dans un acte est exactement là où
 * l'erreur se glisse, et elle se paie au greffe.
 */
export interface SocieteTrouvee {
  denomination: string;
  /**
   * La forme, si la catégorie du registre en désigne une.
   *
   * Vide sinon - une société étrangère, un GIE, une association n'en ont pas au sens de
   * nos actes. Vide ne veut pas dire « garde la précédente » : c'est ce contresens qui
   * faisait porter à une SELAS la forme de la société cherchée juste avant.
   */
  forme: string;
  /** Le code à quatre chiffres du registre, tel quel. */
  categorie: string;
  /** Ce que ce code veut dire, en toutes lettres, pour pouvoir le montrer. */
  libelleCategorie: string;
  siren: string;
  /** Le siège sur une ligne, tel qu'un acte l'écrit. */
  siege: string;
  /** Les deux morceaux, pour qui doit en déduire le greffe compétent. */
  codePostal: string;
  commune: string;
}

/**
 * Le siège sur une ligne, sans le répéter.
 *
 * L'annuaire rend une adresse déjà complète - « 34 RUE LAUGIER 75017 PARIS » - et,
 * à côté, le code postal et la commune séparément. On collait les trois : le siège
 * d'un associé s'écrivait « 34 RUE LAUGIER 75017 PARIS 75017 PARIS », et partait tel
 * quel dans l'acte.
 */
/**
 * Le capital d'une société, au registre national.
 *
 * L'annuaire public ne le publie pas ; le relais `/api/societe/{siren}` interroge
 * l'INPI, qui exige un compte connecté. Une panne de ce côté ne doit rien empêcher :
 * le champ reste saisissable, et l'on rend simplement « on ne sait pas ».
 */
export async function capitalAuRegistre(siren: string): Promise<number | null> {
  const propre = (siren ?? "").replace(/\s/g, "");
  if (!/^\d{9}$/.test(propre)) return null;

  try {
    const reponse = await fetch("/api/societe/" + encodeURIComponent(propre));
    if (!reponse.ok) return null;
    const donnees = (await reponse.json()) as { societe?: { capital?: number | null } };
    return typeof donnees.societe?.capital === "number" ? donnees.societe.capital : null;
  } catch {
    return null;
  }
}

function siegeSurUneLigne(siege: {
  adresse?: string;
  code_postal?: string;
  libelle_commune?: string;
}): string {
  const complete = (siege.adresse ?? "").trim();
  const codePostal = (siege.code_postal ?? "").trim();

  // L'adresse porte déjà le code postal : elle porte donc aussi la commune.
  if (codePostal && complete.includes(codePostal)) return complete;

  return [complete, codePostal, siege.libelle_commune].filter(Boolean).join(" ").trim();
}

/**
 * Interroge l'annuaire public des entreprises.
 *
 * L'annuaire ne cherche que des mots entiers : « gremlins commu » ne trouve rien,
 * quand « gremlins communication » trouve la société. Personne ne tape un nom complet
 * avant d'attendre une suggestion - c'est tout l'intérêt d'en proposer.
 *
 * On retente donc sans le dernier mot, celui qu'on est en train d'écrire : la liste
 * se remplit dès les premières lettres, et se resserre à mesure qu'on les termine.
 */
export async function chercherAuRegistre(
  terme: string,
  signal: AbortSignal
): Promise<ResultatRecherche[]> {
  async function interroger(question: string, combien: number): Promise<ResultatRecherche[]> {
    const reponse = await fetch(
      "https://recherche-entreprises.api.gouv.fr/search?q=" +
        encodeURIComponent(question) +
        "&per_page=" +
        combien +
        "&page=1",
      { signal }
    );
    if (!reponse.ok) return [];
    const donnees = (await reponse.json()) as { results?: ResultatRecherche[] };
    return donnees.results ?? [];
  }

  const propre = terme.trim().replace(/\s+/g, " ");
  const trouves = await interroger(propre, MONTREES);
  if (trouves.length > 0) return trouves;

  const mots = propre.split(" ");
  if (mots.length < 2) return [];

  /*
   * Le repli remonte large, puis remet en ordre.
   *
   * « gremlins commu » cherché sur « gremlins » seul rend d'abord les trois « LES
   * GREMLINS », et « GREMLINS COMMUNICATION » - celui qu'on est en train d'écrire -
   * se perd au-delà du sixième. On en demande vingt et l'on fait remonter ceux dont
   * le nom porte le mot commencé.
   */
  const amorce = normaliser(mots[mots.length - 1]);
  const larges = await interroger(mots.slice(0, -1).join(" "), 20);

  return larges
    .map((r, rang) => ({
      r,
      /* Le rang de l'annuaire départage ceux qui répondent aussi bien. */
      score: normaliser(r.nom_complet ?? r.nom_raison_sociale ?? "").includes(amorce) ? -1 : 0,
      rang,
    }))
    .sort((a, b) => a.score - b.score || a.rang - b.rang)
    .slice(0, MONTREES)
    .map((x) => x.r);
}

/** Le nombre de suggestions affichées : au-delà, la liste couvre le formulaire. */
const MONTREES = 6;

/** Sans accents ni casse : « communication » se reconnaît dans « COMMUNICATION ». */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function RechercheAuRegistre({
  id,
  libelle = "Chercher la société au registre",
  valeur,
  surSaisie,
  surSelection,
  compacte = false,
}: {
  id: string;
  libelle?: string;
  /**
   * Posée en bout de ligne plutôt qu'en tête de fiche.
   *
   * Dans la fiche d'un associé, la recherche prenait une rangée entière pour un champ
   * qu'on n'utilise qu'une fois, au tout début. Compacte, elle tient à droite des deux
   * onglets, là où il n'y avait rien - et son intitulé passe au placeholder, l'étiquette
   * restant lisible aux lecteurs d'écran.
   */
  compacte?: boolean;
  /*
   * Contrôlé depuis l'extérieur quand on le lui demande.
   *
   * La recherche gardait son terme dans son propre état : rouvrir un dossier
   * réaffichait un champ vide au-dessus de données déjà remplies, et l'on ne savait
   * plus quelle société avait été retenue. Sans `valeur`, elle se gère comme avant.
   */
  valeur?: string;
  surSaisie?: (terme: string) => void;
  surSelection: (societe: SocieteTrouvee) => void;
}) {
  const [interne, setInterne] = useState("");
  const controle = valeur !== undefined;
  const terme = controle ? valeur : interne;
  const setTerme = (v: string) => {
    if (controle) surSaisie?.(v);
    else setInterne(v);
  };
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [remarque, setRemarque] = useState<string | null>(null);
  const frappe = useRef(false);

  useEffect(() => {
    if (!frappe.current) return;
    frappe.current = false;
    if (terme.trim().length < 3) return;

    const abandon = new AbortController();
    const minuteur = setTimeout(async () => {
      try {
        setResultats(await chercherAuRegistre(terme, abandon.signal));
        setOuvert(true);
      } catch {
        // Annuaire injoignable : les champs restent saisissables à la main.
      }
    }, 280);

    return () => {
      clearTimeout(minuteur);
      abandon.abort();
    };
  }, [terme]);

  function retenir(resultat: ResultatRecherche) {
    const nom = resultat.nom_complet ?? resultat.nom_raison_sociale ?? "";
    const siege = resultat.siege ?? {};

    setTerme(nom);
    setOuvert(false);
    setResultats([]);

    const categorie = resultat.nature_juridique ?? "";
    const forme = formeDeLaCategorie(categorie) ?? "";
    const libelleCategorie = libelleDeLaCategorie(categorie) ?? "";

    /*
     * Dire ce qu'on a lu quand on ne sait pas le traduire.
     *
     * Une catégorie sans forme correspondante laissait le champ vide, sans rien dire :
     * on ne pouvait pas savoir si le registre n'avait rien répondu ou si sa réponse
     * n'avait pas été comprise. La nommer permet de choisir en connaissance de cause.
     */
    setRemarque(
      forme || !libelleCategorie
        ? null
        : "Le registre indique « " +
            libelleCategorie +
            " » : choisissez la forme à écrire dans les actes."
    );

    surSelection({
      denomination: nom,
      forme,
      categorie,
      libelleCategorie,
      siren: resultat.siren ?? "",
      siege: siegeSurUneLigne(siege),
      codePostal: siege.code_postal ?? "",
      commune: siege.libelle_commune ?? "",
    });
  }

  return (
    <div
      className={compacte ? `${styles.recherche} ${styles.rechercheCompacte}` : styles.recherche}
    >
      <label htmlFor={id} className={compacte ? styles.invisible : undefined}>
        {libelle}
      </label>
      <input
        id={id}
        value={terme}
        autoComplete="off"
        placeholder={compacte ? "Rechercher une société" : "Nom ou SIREN"}
        onChange={(e) => {
          frappe.current = true;
          setTerme(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
      />

      {ouvert && resultats.length > 0 && (
        <ul className={styles.resultats}>
          {resultats.map((r) => (
            <li key={r.siren}>
              <button type="button" className={styles.resultat} onMouseDown={() => retenir(r)}>
                <span className={styles.resultatNom}>{r.nom_complet ?? r.nom_raison_sociale}</span>
                <span className={styles.resultatDetail}>
                  {r.siren} - {r.siege?.libelle_commune ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        Rien trouvé : on le dit.

        La liste ne s'affichait que si elle avait quelque chose à montrer : sur un nom
        introuvable, l'écran ne répondait rien, et l'on ne savait pas si la recherche
        tournait, si l'annuaire était en panne, ou si la société n'y était pas.
      */}
      {ouvert && resultats.length === 0 && (
        <p className={styles.resultatVide}>
          Aucune société de ce nom au registre. Vérifiez l&apos;orthographe, essayez le SIREN, ou
          remplissez les champs à la main.
        </p>
      )}

      {/*
        La catégorie lue, quand elle ne désigne aucune de nos formes.

        Le champ restait vide sans rien dire : on ne pouvait pas distinguer une réponse
        absente d'une réponse incomprise. Le registre parle en codes à quatre chiffres,
        et tous ne désignent pas une société - un GIE, une association, une société
        étrangère n'ont pas de forme au sens de nos actes.
      */}
      {remarque && <p className={styles.resultatVide}>{remarque}</p>}
    </div>
  );
}
