"use client";

import { ChampChoix } from "@/components/formulaire/ChampChoix";
import {
  agrementDeDroit,
  cessionVide,
  nomDeLAssocie,
  prixParPart,
  repartitionApres,
  totalDesParts,
  type Cession,
  ORIGINES_DE_PROPRIETE,
} from "@/domain/modification/cession";
import type { AssociePresent } from "@/domain/modification/gabarit";
import { identiteSurUneLigne, separerLIdentite } from "@/domain/formalite/noms";
import { ChampDate } from "@/components/formulaire/ChampDate";
import { ChampNombre } from "@/components/formulaire/ChampNombre";
import { AdresseUneLigne } from "@/components/formulaire/Adresse";
import styles from "./Modification.module.css";

/*
 * D'où le cédant tient les titres qu'il cède.
 *
 * L'acte l'écrit à l'article « Origine de propriété », et la phrase se poursuit :
 * « lesquelles ont été souscrites lors de la constitution ». Chaque valeur est donc
 * rédigée pour s'y insérer telle quelle.
 */
/*
 * La liste des origines vit dans le domaine, avec l'acte qui la rédige.
 *
 * Elle était ici, et la valeur enregistrée est la fin d'une phrase : « lesquelles {…}
 * et sont intégralement libérées ». Le domaine qui écrit l'acte ne connaissait donc
 * pas les valeurs qu'il rend.
 */
const ORIGINES = ORIGINES_DE_PROPRIETE.map((o) => ({ valeur: o.phrase, libelle: o.libelle }));

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
  /** Ce que les statuts prévoient, là où la loi ne l'impose pas. */
  agrementStatutaire: string | null | undefined;
  /** Les conditions de l'acte, communes à toutes les cessions de l'assemblée. */
  valeurs: Record<string, string | number | boolean | null | undefined>;
  surAssocies: (associes: AssociePresent[]) => void;
  surCessions: (cessions: Cession[]) => void;
  surAgrementStatutaire: (reponse: string) => void;
  surValeur: (champ: string, valeur: string) => void;
}

export function Cessions({
  associes: recus,
  cessions: recues,
  forme,
  anomalies,
  agrementStatutaire,
  valeurs,
  surAssocies,
  surCessions,
  surAgrementStatutaire,
  surValeur,
}: Props) {
  const lire = (champ: string) => String(valeurs[champ] ?? "");
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
                    : identiteSurUneLigne(associe)
                }
                onChange={(e) => {
                  const saisi = e.target.value;
                  if (associe.nature === "morale") {
                    modifierAssocie(rang, { denomination: saisi });
                    return;
                  }
                  /*
                   * Deux champs pour une ligne de liste alourdiraient l'écran ; l'acte,
                   * lui, distingue le prénom du nom. La casse tranche - c'est la
                   * convention des actes - et la règle vit dans le domaine, partagée
                   * avec les autres parcours.
                   */
                  const { civilite, prenom, nom } = separerLIdentite(saisi);
                  modifierAssocie(rang, { civilite, prenom, nom });
                }}
              />

              {/*
                Un champ de texte, non un compteur.
                Les flèches d'un `type="number"` occupaient la moitié d'un champ étroit
                et se plaçaient devant le chiffre qu'on venait taper.
              */}
              {/*
                Pas de « 0 » en indication.
                Il se lit comme une valeur et ne s'efface pas : on clique, on appuie sur
                retour arrière, et le zéro reste - puisqu'il n'a jamais été saisi. Le mot
                « parts » à côté du champ dit déjà ce qu'on y attend.
              */}
              <ChampNombre
                id={"detenteur-parts-" + rang}
                decimales={false}
                aria-label={"Parts de l'associé " + (rang + 1)}
                className={styles.detenteurParts}
                valeur={associe.parts ?? ""}
                surChangement={(nombre) =>
                  modifierAssocie(rang, { parts: nombre === "" ? null : nombre })
                }
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
          className={styles.ajouterLigne}
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
                <ChampChoix
                  id={"cession-cedant-" + rang}
                  valeur={cession.cedant === null || cession.cedant === undefined ? "" : String(cession.cedant)}
                  invite={nomme ? "Choisir" : "Renseignez d'abord les associés"}
                  disabled={!nomme}
                  options={
                    nomme
                      ? associes.map((associe, i) => ({
                          valeur: String(i),
                          libelle: nomDeLAssocie(associe, i) + " · " + (associe.parts ?? 0) + " parts",
                        }))
                      : []
                  }
                  surChangement={(v) => modifier(rang, { cedant: v === "" ? null : Number(v) })}
                />
                {refus("cession-" + rang + "-cedant") && (
                  <p role="alert">{refus("cession-" + rang + "-cedant")}</p>
                )}
              </div>

              <div className={styles.champ}>
                <label htmlFor={"cession-parts-" + rang}>Parts cédées</label>
                <ChampNombre
                  id={"cession-parts-" + rang}
                  decimales={false}
                  valeur={cession.parts ?? ""}
                  surChangement={(nombre) => modifier(rang, { parts: nombre === "" ? null : nombre })}
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
              Le choix portait sur deux pastilles collées au champ précédent, sans rien
              qui dise ce qu'on choisissait.
            */}
            <div className={styles.destinataire}>
              <span className={styles.destinataireLibelle}>Le cessionnaire est</span>
              <div className={styles.natures}>
                {(["associe", "tiers"] as const).map((vers) => (
                  <label
                    key={vers}
                    className={
                      cession.vers === vers
                        ? `${styles.nature} ${styles.natureChoisie}`
                        : styles.nature
                    }
                  >
                    <input
                      type="radio"
                      name={"vers-" + rang}
                      checked={cession.vers === vers}
                      onChange={() => modifier(rang, { vers })}
                    />
                    {vers === "associe" ? "un associé" : "un tiers, qui entre au capital"}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.champs}>
              {cession.vers === "associe" ? (
                <div className={styles.champ}>
                  <label htmlFor={"cession-cessionnaire-" + rang}>Cessionnaire</label>
                  <ChampChoix
                    id={"cession-cessionnaire-" + rang}
                    valeur={
                      cession.cessionnaire === null || cession.cessionnaire === undefined
                        ? ""
                        : String(cession.cessionnaire)
                    }
                    options={associes.map((associe, i) => ({
                      valeur: String(i),
                      libelle: nomDeLAssocie(associe, i),
                    }))}
                    surChangement={(v) =>
                      modifier(rang, { cessionnaire: v === "" ? null : Number(v) })
                    }
                  />
                  {refus("cession-" + rang + "-cessionnaire") && (
                    <p role="alert">{refus("cession-" + rang + "-cessionnaire")}</p>
                  )}
                </div>
              ) : (
                <>
                  <div className={styles.champ}>
                    <label htmlFor={"cession-nature-" + rang}>Le cessionnaire est</label>
                    <ChampChoix
                      id={"cession-nature-" + rang}
                      valeur={cession.nature ?? "physique"}
                      options={[
                        { valeur: "physique", libelle: "Une personne" },
                        { valeur: "morale", libelle: "Une société" },
                      ]}
                      surChangement={(v) =>
                        modifier(rang, { nature: v as "physique" | "morale" })
                      }
                    />
                  </div>

                  <div className={styles.champ}>
                    <label htmlFor={"cession-nom-" + rang}>
                      {cession.nature === "morale" ? "Dénomination" : "Civilité, prénom et nom"}
                    </label>
                    <input
                      id={"cession-nom-" + rang}
                      placeholder={
                        cession.nature === "morale"
                          ? "MERCIER PARTICIPATIONS"
                          : "Monsieur Paul DURAND"
                      }
                      value={cession.nom ?? ""}
                      onChange={(e) => modifier(rang, { nom: e.target.value })}
                    />
                    {refus("cession-" + rang + "-nom") && (
                      <p role="alert">{refus("cession-" + rang + "-nom")}</p>
                    )}
                  </div>
                </>
              )}

              <div className={styles.champ}>
                <label htmlFor={"cession-prix-" + rang}>Prix de cession, en euros</label>
                <ChampNombre
                  id={"cession-prix-" + rang}
                  valeur={cession.prix ?? ""}
                  decimales
                  surChangement={(nombre) => modifier(rang, { prix: nombre === "" ? null : nombre })}
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
                  <label htmlFor={"cession-adresse-" + rang}>
                    {cession.nature === "morale" ? "Siège social" : "Adresse personnelle"}
                  </label>
                  {/* L'acte nomme le cessionnaire par son adresse complète : elle se
                      cherche, comme les autres, plutôt que de se taper de mémoire. */}
                  <AdresseUneLigne
                    id={"cession-adresse-" + rang}
                    valeur={cession.adresse ?? ""}
                    surChangement={(adresse) => modifier(rang, { adresse })}
                  />
                </div>
              )}

              {/*
                L'état civil du tiers qui entre au capital.

                Un nom et une adresse suffisaient tant que l'acte se contentait de
                désigner les parties. Un acte de cession se présente à l'enregistrement
                au service des impôts, et il identifie l'acquéreur comme le ferait un
                notaire : état civil pour une personne, immatriculation et représentant
                pour une société.
              */}
              {cession.vers === "tiers" && cession.nature !== "morale" && (
                <>
                  <div className={styles.champ}>
                    <label htmlFor={"cession-ne-le-" + rang}>Né(e) le</label>
                    <ChampDate
                      id={"cession-ne-le-" + rang}
                      valeur={cession.neLe ?? ""}
                      surChangement={(iso) => modifier(rang, { neLe: iso })}
                    />
                  </div>

                  <div className={styles.champ}>
                    <label htmlFor={"cession-ne-a-" + rang}>Né(e) à</label>
                    <input
                      id={"cession-ne-a-" + rang}
                      placeholder="Lyon (Rhône)"
                      value={cession.neA ?? ""}
                      onChange={(e) => modifier(rang, { neA: e.target.value })}
                    />
                  </div>

                  <div className={styles.champ}>
                    <label htmlFor={"cession-nationalite-" + rang}>Nationalité</label>
                    <input
                      id={"cession-nationalite-" + rang}
                      placeholder="Française"
                      value={cession.nationalite ?? ""}
                      onChange={(e) => modifier(rang, { nationalite: e.target.value })}
                    />
                  </div>
                </>
              )}

              {cession.vers === "tiers" && cession.nature === "morale" && (
                <>
                  <div className={styles.champ}>
                    <label htmlFor={"cession-forme-" + rang}>Forme juridique</label>
                    <input
                      id={"cession-forme-" + rang}
                      placeholder="SASU"
                      value={cession.forme ?? ""}
                      onChange={(e) => modifier(rang, { forme: e.target.value })}
                    />
                  </div>

                  <div className={styles.champ}>
                    <label htmlFor={"cession-capital-" + rang}>Capital social, en euros</label>
                    <ChampNombre
                      id={"cession-capital-" + rang}
                      valeur={cession.capital ?? ""}
                      decimales
                      surChangement={(n) => modifier(rang, { capital: n === "" ? null : n })}
                    />
                  </div>

                  <div className={styles.champ}>
                    <label htmlFor={"cession-siren-" + rang}>SIREN</label>
                    <input
                      id={"cession-siren-" + rang}
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="9 chiffres"
                      value={cession.siren ?? ""}
                      onChange={(e) =>
                        modifier(rang, { siren: e.target.value.replace(/\D/g, "") })
                      }
                    />
                  </div>

                  <div className={styles.champ}>
                    <label htmlFor={"cession-rcs-" + rang}>Ville du RCS</label>
                    <input
                      id={"cession-rcs-" + rang}
                      placeholder="Lyon"
                      value={cession.villeRcs ?? ""}
                      onChange={(e) => modifier(rang, { villeRcs: e.target.value })}
                    />
                  </div>

                  <div className={`${styles.champ} ${styles.pleineLargeur}`}>
                    <label htmlFor={"cession-representant-" + rang}>Représentée par</label>
                    <input
                      id={"cession-representant-" + rang}
                      placeholder="son Président, Monsieur Paul DURAND"
                      value={cession.representant ?? ""}
                      onChange={(e) => modifier(rang, { representant: e.target.value })}
                    />
                  </div>
                </>
              )}

              {/*
                D'où le cédant tient ses titres.
                L'acte l'écrit à l'article « Origine de propriété » : sans elle, il
                affirme une souscription à la constitution qui peut être fausse.
              */}
              <div className={`${styles.champ} ${styles.pleineLargeur}`}>
                <label htmlFor={"cession-origine-" + rang}>
                  Comment le cédant a obtenu ces titres
                </label>
                <ChampChoix
                  id={"cession-origine-" + rang}
                  valeur={cession.origine ?? ""}
                  options={ORIGINES.map((origine) => ({
                    valeur: origine.valeur,
                    libelle: origine.libelle,
                  }))}
                  surChangement={(origine) => modifier(rang, { origine })}
                />
              </div>

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
        La clause d'agrément des statuts, demandée une fois pour toutes.

        Elle appartient à la société, non à chaque cession : la poser sous chaque bloc
        ferait répondre trois fois à la même question. Elle ne paraît que là où la loi
        laisse le choix - dans une société par actions, ou entre associés d'une SARL -
        parce qu'ailleurs la réponse est déjà écrite dans le code de commerce.
      */}
      {cessions.some((cession) => !agrementDeDroit(forme, cession.vers).requis) && (
        <section className={styles.cession}>
          <div className={styles.champs}>
            <div className={`${styles.champ} ${styles.pleineLargeur}`}>
              <label htmlFor="agrement-statutaire">
                Vos statuts prévoient-ils une clause d&apos;agrément ?
              </label>
              <ChampChoix
                id="agrement-statutaire"
                valeur={agrementStatutaire ?? ""}
                options={[
                  { valeur: "Oui", libelle: "Oui : la cession doit être agréée par les associés" },
                  { valeur: "Non", libelle: "Non : les titres se cèdent librement" },
                ]}
                surChangement={surAgrementStatutaire}
              />
              <p className={styles.devisPrecision}>
                La clause figure aux statuts, souvent sous un article « Cession des
                titres ». Sans réponse, l&apos;acte affirmerait qu&apos;aucun agrément
                n&apos;est dû, ce que le greffe lit à côté de vos statuts.
              </p>
              {refus("agrementRequis") && <p role="alert">{refus("agrementRequis")}</p>}
            </div>
          </div>
        </section>
      )}

      {/*
        Les conditions de l'acte, communes à toutes les cessions de cette assemblée.

        Elles ne se répètent pas par cession : c'est un seul contrat par acquéreur, avec
        un seul régime de garantie et une seule modalité de paiement. Les laisser au
        défaut revenait à faire signer une cession sans garantie et payée comptant sans
        que personne ne l'ait décidé.
      */}
      <section className={styles.cession}>
        <div className={styles.cessionTete}>
          <h4 className={styles.cessionTitre}>
            <span className={styles.etapeNum}>3</span>
            Les conditions
          </h4>
        </div>

        <div className={styles.champs}>
          <div className={styles.champ}>
            <label htmlFor="cession-paiement">Règlement du prix</label>
            <ChampChoix
              id="cession-paiement"
              valeur={lire("cessionModalitePaiement")}
              options={[
                { valeur: "", libelle: "Comptant, par virement, le jour de la signature" },
                { valeur: "Échelonné", libelle: "Échelonné, selon un échéancier annexé" },
                { valeur: "Séquestre", libelle: "Consigné entre les mains d'un séquestre" },
              ]}
              surChangement={(v) => surValeur("cessionModalitePaiement", v)}
            />
          </div>

          <div className={styles.champ}>
            <label htmlFor="cession-compte-courant">Compte courant d&apos;associé</label>
            <ChampChoix
              id="cession-compte-courant"
              valeur={lire("cessionCompteCourant")}
              options={[
                { valeur: "", libelle: "Non cédé : il reste au cédant" },
                { valeur: "Cédé séparément", libelle: "Cédé, par une convention séparée" },
              ]}
              surChangement={(v) => surValeur("cessionCompteCourant", v)}
            />
          </div>

          {/*
            La garantie d'actif et de passif, ou son absence assumée.

            Le silence n'est pas neutre : il laisse les parties découvrir après coup
            qu'aucune garantie n'a été stipulée. L'acte le dit désormais, dans un sens
            ou dans l'autre.
          */}
          <div className={`${styles.champ} ${styles.pleineLargeur}`}>
            <label htmlFor="cession-garantie">Garantie d&apos;actif et de passif</label>
            <ChampChoix
              id="cession-garantie"
              valeur={lire("cessionGarantiePassif")}
              options={[
                { valeur: "Non", libelle: "Aucune : l'acte l'écarte expressément, en le motivant" },
                {
                  valeur: "Oui",
                  libelle: "Consentie par le cédant, avec une durée et un plafond éventuel",
                },
              ]}
              surChangement={(v) => surValeur("cessionGarantiePassif", v)}
            />
          </div>

          {lire("cessionGarantiePassif") === "Oui" && (
            <>
              <div className={styles.champ}>
                <label htmlFor="cession-duree-garantie">Durée de la garantie</label>
                <input
                  id="cession-duree-garantie"
                  placeholder="trois ans"
                  value={lire("cessionDureeGarantie")}
                  onChange={(e) => surValeur("cessionDureeGarantie", e.target.value)}
                />
                {refus("cessionDureeGarantie") && (
                  <p role="alert">{refus("cessionDureeGarantie")}</p>
                )}
                <p className={styles.devisPrecision}>
                  En matière fiscale et sociale, elle est prorogée d&apos;office jusqu&apos;au
                  terme du délai de reprise.
                </p>
              </div>

              <div className={styles.champ}>
                <label htmlFor="cession-plafond-garantie">Plafond, s&apos;il y en a un</label>
                <input
                  id="cession-plafond-garantie"
                  placeholder="50 000 euros"
                  value={lire("cessionPlafondGarantie")}
                  onChange={(e) => surValeur("cessionPlafondGarantie", e.target.value)}
                />
              </div>
            </>
          )}

          {lire("cessionGarantiePassif") !== "Oui" && (
            <div className={`${styles.champ} ${styles.pleineLargeur}`}>
              <label htmlFor="cession-motif-absence">
                Pourquoi aucune garantie n&apos;est consentie
              </label>
              <textarea
                id="cession-motif-absence"
                rows={2}
                placeholder="Opération intragroupe, l'acquéreur connaissant la situation de la société."
                value={lire("cessionMotifAbsenceGarantie")}
                onChange={(e) => surValeur("cessionMotifAbsenceGarantie", e.target.value)}
              />
              <p className={styles.devisPrecision}>
                Laissé vide, l&apos;acte écrit une formule générale : la connaissance que
                l&apos;acquéreur a de la société.
              </p>
            </div>
          )}

          <div className={`${styles.champ} ${styles.pleineLargeur}`}>
            <label htmlFor="cession-contexte">Le contexte de l&apos;opération</label>
            <textarea
              id="cession-contexte"
              rows={2}
              placeholder="Réorganisation patrimoniale, entrée d'un investisseur, transmission familiale…"
              value={lire("cessionContexte")}
              onChange={(e) => surValeur("cessionContexte", e.target.value)}
            />
            <p className={styles.devisPrecision}>
              Il ouvre le préambule de l&apos;acte et explique pourquoi la cession a lieu.
            </p>
          </div>

          <div className={styles.champ}>
            <label htmlFor="cession-lieu">Lieu de signature</label>
            <input
              id="cession-lieu"
              placeholder="Lyon"
              value={lire("cessionLieuSignature")}
              onChange={(e) => surValeur("cessionLieuSignature", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/*
        Une assemblée peut décider plusieurs cessions. Le bouton ne s'offre qu'une fois
        la première renseignée : « une autre cession » n'a aucun sens avant.
      */}
      {cessions[cessions.length - 1]?.cedant !== null && (
        <button
          type="button"
          className={styles.ajouterLigne}
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
