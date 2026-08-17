"use client";

import {
  agrementDeDroit,
  cessionVide,
  nomDeLAssocie,
  prixParPart,
  repartitionApres,
  totalDesParts,
  type Cession,
} from "@/domain/modification/cession";
import type { AssociePresent } from "@/domain/modification/gabarit";
import { ChampDate } from "@/components/formulaire/ChampDate";
import styles from "./Modification.module.css";

/**
 * Les cessions de parts.
 *
 * Le formulaire demandait « Nom du cédant » dans un champ vide, alors que l'étape
 * suivante faisait saisir les mêmes personnes avec leurs parts : on répondait deux
 * fois, et rien ne reliait les deux réponses. On pouvait céder cinq cents parts quand
 * on en détenait cent, et l'acte sortait ainsi.
 *
 * Ici, on dit d'abord qui détient quoi - une seule fois, l'assemblée reprendra la même
 * liste - puis chaque cession se compose à partir d'elle. Ce qui se calcule se calcule,
 * et la répartition d'après s'affiche à mesure : c'est elle qui rend visibles les
 * erreurs qu'un formulaire plat laisse passer.
 */

interface Props {
  associes: AssociePresent[];
  cessions: Cession[];
  forme: string | null | undefined;
  anomalies: { champ: string; message: string }[];
  surAssocies: (associes: AssociePresent[]) => void;
  surCessions: (cessions: Cession[]) => void;
}

export function Cessions({
  associes: recus,
  cessions: recues,
  forme,
  anomalies,
  surAssocies,
  surCessions,
}: Props) {
  /*
   * Jamais zéro ligne.
   *
   * Un écran qui n'offre que « + Ajouter un associé » et « + Une autre cession »
   * demande deux clics avant de pouvoir écrire quoi que ce soit - et le second bouton
   * parlait d'une « autre » cession alors qu'aucune n'existait encore. La première
   * ligne est là, vide : c'est un formulaire, pas une liste à peupler.
   */
  const associes = recus.length > 0 ? recus : [{ parts: null }];
  const cessions = recues.length > 0 ? recues : [cessionVide()];

  const refus = (champ: string) => anomalies.find((a) => a.champ === champ)?.message;
  const total = totalDesParts(associes);
  const repartition = repartitionApres(associes, cessions);
  const nomme = associes.some((a) => nomDeLAssocie(a, 0) !== "Associé 1" || (a.parts ?? 0) > 0);

  function modifierAssocie(rang: number, changement: Partial<AssociePresent>) {
    surAssocies(associes.map((a, i) => (i === rang ? { ...a, ...changement } : a)));
  }

  function modifier(rang: number, changement: Partial<Cession>) {
    surCessions(cessions.map((c, i) => (i === rang ? { ...c, ...changement } : c)));
  }

  return (
    <div className={styles.cessions}>
      {/* ---------- Qui détient quoi aujourd'hui ---------- */}
      <section className={styles.capital}>
        <div className={styles.capitalTete}>
          <h4 className={styles.capitalTitre}>
            <span className={styles.etapeNum}>1</span> Qui détient quoi aujourd&apos;hui
          </h4>
          <span className={styles.capitalTotal}>
            {total > 0 ? total + (total > 1 ? " parts" : " part") : "aucune part saisie"}
          </span>
        </div>
        <p className={styles.capitalAide}>
          La même liste servira au procès-verbal : elle ne se saisit qu&apos;une fois.
        </p>

        <ul className={styles.detenteurs}>
          {associes.map((associe, rang) => (
            <li key={rang} className={styles.detenteur}>
              <input
                aria-label={"Nom de l'associé " + (rang + 1)}
                className={styles.detenteurNom}
                placeholder={"Associé " + (rang + 1)}
                value={
                  associe.nature === "morale"
                    ? (associe.denomination ?? "")
                    : [associe.prenom, associe.nom].filter(Boolean).join(" ")
                }
                onChange={(e) => {
                  const saisi = e.target.value;
                  if (associe.nature === "morale") {
                    modifierAssocie(rang, { denomination: saisi });
                    return;
                  }
                  /*
                   * Le premier mot est le prénom, le reste le nom.
                   *
                   * Deux champs pour une ligne de liste alourdiraient l'écran ; l'étape
                   * de l'assemblée les sépare pour l'acte, où la distinction compte.
                   */
                  const morceaux = saisi.trim().split(/\s+/);
                  modifierAssocie(rang, {
                    prenom: morceaux.length > 1 ? morceaux[0] : saisi,
                    nom: morceaux.length > 1 ? morceaux.slice(1).join(" ") : "",
                  });
                }}
              />

              {/*
                Un champ de texte, non un compteur.
                Les flèches d'un `type="number"` occupaient la moitié d'un champ étroit
                et se plaçaient devant le chiffre qu'on venait taper.
              */}
              <input
                aria-label={"Parts de l'associé " + (rang + 1)}
                className={styles.detenteurParts}
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={associe.parts ?? ""}
                onChange={(e) => {
                  const chiffres = e.target.value.replace(/[^0-9]/g, "");
                  modifierAssocie(rang, { parts: chiffres === "" ? null : Number(chiffres) });
                }}
              />
              <span className={styles.detenteurUnite}>parts</span>

              <button
                type="button"
                className={styles.detenteurRetrait}
                aria-label={"Retirer l'associé " + (rang + 1)}
                onClick={() => surAssocies(associes.filter((_, i) => i !== rang))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className={styles.cessionAjouter}
          onClick={() => surAssocies([...associes, { parts: null }])}
        >
          + Ajouter un associé
        </button>
      </section>

      {/* ---------- Les cessions ---------- */}
      {cessions.map((cession, rang) => {
        const detenues = cession.cedant !== null ? (associes[cession.cedant]?.parts ?? 0) : 0;
        const unitaire = prixParPart(cession);
        const agrement = agrementDeDroit(forme, cession.vers);

        return (
          <section key={rang} className={styles.cession}>
            <div className={styles.cessionTete}>
              <h4 className={styles.cessionTitre}>
                {rang === 0 && <span className={styles.etapeNum}>2</span>}
                {cessions.length > 1 ? "Cession " + (rang + 1) : "Ce qui est cédé"}
              </h4>
              {cessions.length > 1 && (
                <button
                  type="button"
                  className={styles.cessionRetrait}
                  onClick={() => surCessions(cessions.filter((_, i) => i !== rang))}
                >
                  Retirer
                </button>
              )}
            </div>

            <div className={styles.champs}>
              <div className={styles.champ}>
                <label htmlFor={"cession-cedant-" + rang}>Cédant</label>
                <select
                  id={"cession-cedant-" + rang}
                  value={cession.cedant ?? ""}
                  onChange={(e) =>
                    modifier(rang, { cedant: e.target.value === "" ? null : Number(e.target.value) })
                  }
                >
                  <option value="">{nomme ? "Choisir" : "Renseignez d'abord les associés"}</option>
                  {nomme &&
                    associes.map((associe, i) => (
                      <option key={i} value={i}>
                        {nomDeLAssocie(associe, i)} · {associe.parts ?? 0} parts
                      </option>
                    ))}
                </select>
                {refus("cession-" + rang + "-cedant") && (
                  <p role="alert">{refus("cession-" + rang + "-cedant")}</p>
                )}
              </div>

              <div className={styles.champ}>
                <label htmlFor={"cession-parts-" + rang}>Parts cédées</label>
                <input
                  id={"cession-parts-" + rang}
                  type="text"
                  inputMode="numeric"
                  value={cession.parts ?? ""}
                  onChange={(e) => {
                    const chiffres = e.target.value.replace(/[^0-9]/g, "");
                    modifier(rang, { parts: chiffres === "" ? null : Number(chiffres) });
                  }}
                />
                {detenues > 0 && (
                  <p className={styles.devisPrecision}>
                    sur {detenues} détenue{detenues > 1 ? "s" : ""}
                  </p>
                )}
                {refus("cession-" + rang + "-parts") && (
                  <p role="alert">{refus("cession-" + rang + "-parts")}</p>
                )}
              </div>
            </div>

            {/*
              Le destinataire décide de la suite : un associé se choisit dans la liste,
              un tiers se nomme et entre au capital.
            */}
            <div className={styles.natures}>
              {(["associe", "tiers"] as const).map((vers) => (
                <label
                  key={vers}
                  className={
                    cession.vers === vers ? `${styles.nature} ${styles.natureChoisie}` : styles.nature
                  }
                >
                  <input
                    type="radio"
                    name={"vers-" + rang}
                    checked={cession.vers === vers}
                    onChange={() => modifier(rang, { vers })}
                  />
                  {vers === "associe" ? "À un associé" : "À un tiers"}
                </label>
              ))}
            </div>

            <div className={styles.champs}>
              {cession.vers === "associe" ? (
                <div className={styles.champ}>
                  <label htmlFor={"cession-cessionnaire-" + rang}>Cessionnaire</label>
                  <select
                    id={"cession-cessionnaire-" + rang}
                    value={cession.cessionnaire ?? ""}
                    onChange={(e) =>
                      modifier(rang, {
                        cessionnaire: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">Choisir</option>
                    {associes.map((associe, i) => (
                      <option key={i} value={i}>
                        {nomDeLAssocie(associe, i)}
                      </option>
                    ))}
                  </select>
                  {refus("cession-" + rang + "-cessionnaire") && (
                    <p role="alert">{refus("cession-" + rang + "-cessionnaire")}</p>
                  )}
                </div>
              ) : (
                <div className={styles.champ}>
                  <label htmlFor={"cession-nom-" + rang}>Nom du cessionnaire</label>
                  <input
                    id={"cession-nom-" + rang}
                    value={cession.nom ?? ""}
                    onChange={(e) => modifier(rang, { nom: e.target.value })}
                  />
                  {refus("cession-" + rang + "-nom") && (
                    <p role="alert">{refus("cession-" + rang + "-nom")}</p>
                  )}
                </div>
              )}

              <div className={styles.champ}>
                <label htmlFor={"cession-prix-" + rang}>Prix de cession, en euros</label>
                <input
                  id={"cession-prix-" + rang}
                  type="text"
                  inputMode="numeric"
                  value={cession.prix ?? ""}
                  onChange={(e) => {
                    const chiffres = e.target.value.replace(/[^0-9]/g, "");
                    modifier(rang, { prix: chiffres === "" ? null : Number(chiffres) });
                  }}
                />
                {unitaire !== null && (
                  <p className={styles.devisPrecision}>
                    soit {unitaire.toLocaleString("fr-FR")} € la part
                  </p>
                )}
                {refus("cession-" + rang + "-prix") && (
                  <p role="alert">{refus("cession-" + rang + "-prix")}</p>
                )}
              </div>

              {cession.vers === "tiers" && (
                <div className={`${styles.champ} ${styles.pleineLargeur}`}>
                  <label htmlFor={"cession-adresse-" + rang}>Adresse du cessionnaire</label>
                  <input
                    id={"cession-adresse-" + rang}
                    value={cession.adresse ?? ""}
                    onChange={(e) => modifier(rang, { adresse: e.target.value })}
                  />
                </div>
              )}

              <div className={styles.champ}>
                <label htmlFor={"cession-date-" + rang}>Date de cession</label>
                <ChampDate
                  id={"cession-date-" + rang}
                  valeur={cession.date ?? ""}
                  surChangement={(iso) => modifier(rang, { date: iso })}
                />
                {refus("cession-" + rang + "-date") && (
                  <p role="alert">{refus("cession-" + rang + "-date")}</p>
                )}
              </div>
            </div>

            {/*
              L'agrément se déduit de la forme et du destinataire, avec son motif.
              « Choisir » sur un menu vide ne guide personne.
            */}
            <p className={styles.agrement}>
              <span className={agrement.requis ? styles.agrementOui : styles.agrementNon}>
                {agrement.requis ? "Agrément requis" : "Agrément non requis"}
              </span>
              {agrement.motif}
            </p>
          </section>
        );
      })}

      {/*
        Une assemblée peut décider plusieurs cessions. Le bouton ne s'offre qu'une fois
        la première renseignée : « une autre cession » n'a aucun sens avant.
      */}
      {cessions[cessions.length - 1]?.cedant !== null && (
        <button
          type="button"
          className={styles.cessionAjouter}
          onClick={() => surCessions([...cessions, cessionVide()])}
        >
          + Ajouter une autre cession
        </button>
      )}

      {refus("cessions") && (
        <p className={styles.manques} role="alert">
          {refus("cessions")}
        </p>
      )}

      {/* ---------- La répartition qui en résulte ---------- */}
      {total > 0 && cessions.some((c) => (c.parts ?? 0) > 0) && (
        <section className={styles.repartition}>
          <h4 className={styles.capitalTitre}>
            <span className={styles.etapeNum}>3</span> Après la cession
          </h4>
          <ul className={styles.repartitionListe}>
            {repartition.map((ligne, i) => (
              <li
                key={i}
                className={
                  ligne.entrant
                    ? `${styles.repartitionLigne} ${styles.repartitionEntrant}`
                    : ligne.sortant
                      ? `${styles.repartitionLigne} ${styles.repartitionSortant}`
                      : styles.repartitionLigne
                }
              >
                <span className={styles.repartitionNom}>{ligne.nom}</span>
                <span className={styles.repartitionAvant}>{ligne.avant}</span>
                <span className={styles.repartitionFleche} aria-hidden="true">
                  →
                </span>
                <span className={styles.repartitionApres}>{ligne.apres}</span>
                {ligne.entrant && <span className={styles.repartitionMarque}>entre</span>}
                {ligne.sortant && <span className={styles.repartitionMarque}>sort</span>}
              </li>
            ))}
          </ul>
          <p className={styles.capitalAide}>
            Total après cession : {repartition.reduce((t, l) => t + l.apres, 0)} sur {total} parts.
            Une cession n&apos;en crée ni n&apos;en supprime.
          </p>
        </section>
      )}
    </div>
  );
}
