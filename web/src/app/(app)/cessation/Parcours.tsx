"use client";

import { ChampChoix } from "@/components/formulaire/ChampChoix";
import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Champ, RechercheAuRegistre, type SocieteTrouvee } from "../modification/Parcours";
import { Adresse, Ville } from "@/components/formulaire/Adresse";
import { montantLisible } from "@/domain/modification/offre";
import type { ActeProduit } from "@/domain/document/publication";
import type { Cessation } from "@/infrastructure/db/depots/cessation";
import { champsAffiches, verifierCessation } from "@/domain/cessation/verification";
import { echeancesDe, FORMALITE_GRATUITE, type Periodicite } from "@/domain/cessation/regles";
import { devisDeCessation, DELAI, PRESTATIONS } from "@/domain/cessation/offre";
import styles from "../modification/Modification.module.css";
import { remonterEnHaut } from "@/lib/defilement";
import { memoriserEtape } from "@/lib/etape-dans-l-adresse";

const TRAITS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ETAPES = [
  { titre: "Votre auto-entreprise", court: "Entreprise" },
  { titre: "L'arrêt et vos échéances", court: "Arrêt" },
  { titre: "Récapitulatif et règlement", court: "Règlement" },
];

interface Props {
  dossier: number;
  initial: Cessation;
  etapeInitiale: number;
  issueDuPaiement?: "regle" | "annule";
  actesInitiaux: ActeProduit[];
}

/**
 * Trois étapes, et pas une de plus.
 *
 * Une auto-entreprise n'a ni associés, ni capital, ni assemblée : lui faire traverser
 * sept écrans comme une société serait la traiter pour ce qu'elle n'est pas. Ce qui
 * prend de la place ici, c'est le calendrier des suites - la seule chose que le client
 * ne trouvera nulle part ailleurs.
 */
export function Parcours({ dossier, initial, etapeInitiale, issueDuPaiement, actesInitiaux }: Props) {
  const [etat, setEtat] = useState<Cessation>(initial);
  const [etape, setEtape] = useState(etapeInitiale);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tentative, setTentative] = useState(false);
  const [atteinte, setAtteinte] = useState(etapeInitiale);
  const [enCours, demarrer] = useTransition();

  const anomalies = useMemo(() => verifierCessation(etat), [etat]);
  const refusDe = (champ: string) =>
    tentative ? anomalies.find((a) => a.champ === champ)?.message : undefined;

  function changer(changement: Partial<Cessation>) {
    setEtat((actuel) => ({ ...actuel, ...changement }));
  }

  function majValeurs(maj: (v: Cessation["valeurs"]) => Cessation["valeurs"]) {
    setEtat((actuel) => ({ ...actuel, valeurs: maj(actuel.valeurs) }));
  }

  function manquesDe(rang: number) {
    if (rang === 1) return anomalies.filter((a) => ["denomination", "siren"].includes(a.champ));
    if (rang === 2) return anomalies.filter((a) => !["denomination", "siren"].includes(a.champ));
    return [];
  }

  const manquesCourants = manquesDe(etape);

  function aller(vers: number) {
    setErreur(null);
    if (vers > etape && manquesDe(etape).length > 0) {
      setTentative(true);
      return;
    }
    setTentative(false);

    demarrer(async () => {
      const reponse = await fetch("/api/formalites/cessation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier,
          entreprise: etat.entreprise,
          entrepreneur: etat.entrepreneur,
          valeurs: etat.valeurs,
        }),
      });

      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => ({}));
        setErreur(corps.error ?? "L'enregistrement n'a pas abouti");
        return;
      }

      setEtape(vers);
      memoriserEtape(dossier, vers);
      setAtteinte((loin) => Math.max(loin, vers));
      remonterEnHaut();
    });
  }

  return (
    <div className={styles.parcours}>
      {issueDuPaiement && <FinDePaiement issue={issueDuPaiement} dossier={dossier} />}

      <Frise etape={etape} atteinte={atteinte} surChoix={aller} />

      <div className={styles.contenu}>
        <div className={styles.etapeTete}>
          <h2 className={styles.etapeTitre}>{ETAPES[etape - 1]?.titre}</h2>
          <span className={styles.avancement}>
            Étape {etape} sur {ETAPES.length}
          </span>
        </div>

        {etape === 1 && <EtapeEntreprise etat={etat} changer={changer} refusDe={refusDe} />}

        {etape === 2 && (
          <>
            <Champs etat={etat} majValeurs={majValeurs} refusDe={refusDe} />
            <Echeances etat={etat} />
          </>
        )}

        {etape === 3 && (
          <EtapeReglement
            dossier={dossier}
            etat={etat}
            anomalies={anomalies}
            actesInitiaux={actesInitiaux}
          />
        )}

        {tentative && manquesCourants.length > 0 && (
          <p className={styles.manques} role="alert">
            {manquesCourants.length === 1
              ? manquesCourants[0].message
              : "Il reste " +
                manquesCourants.length +
                " points à régler : " +
                manquesCourants.map((m) => m.message).join(", ")}
          </p>
        )}

        {erreur && (
          <p className={styles.manques} role="alert">
            {erreur}
          </p>
        )}

        <div className={styles.actions}>
          {etape > 1 && (
            <button type="button" onClick={() => aller(etape - 1)} disabled={enCours}>
              Retour
            </button>
          )}
          {etape < ETAPES.length && (
            <button
              type="button"
              className={styles.principal}
              onClick={() => aller(etape + 1)}
              disabled={enCours}
            >
              {enCours ? "Enregistrement" : "Continuer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Frise({
  etape,
  atteinte,
  surChoix,
}: {
  etape: number;
  atteinte: number;
  surChoix: (vers: number) => void;
}) {
  return (
    <ol className={styles.frise}>
      {ETAPES.map((e, rang) => {
        const numero = rang + 1;
        const faite = numero < etape;
        const courante = numero === etape;
        /* « À venir » est l'état par défaut : il n'a pas de classe. */
        const ton = faite ? styles.friseFaite : courante ? styles.friseCourante : "";
        const marque = faite ? (
          <svg viewBox="0 0 24 24" {...TRAITS} aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          numero
        );

        return (
          <li key={e.court} className={`${styles.friseEtape} ${ton}`}>
            {/*
              Une étape déjà atteinte se rouvre d'un clic.
              Celles qu'on n'a pas encore vues ne sont pas des boutons : y sauter
              enjamberait les contrôles qui gardent les précédentes.
            */}
            {numero <= atteinte ? (
              <button
                type="button"
                className={styles.friseGeste}
                onClick={() => surChoix(numero)}
                aria-current={courante ? "step" : undefined}
              >
                <span className={styles.friseMarque}>{marque}</span>
                <span className={styles.friseLibelle}>{e.court}</span>
              </button>
            ) : (
              <span className={styles.friseGeste}>
                <span className={styles.friseMarque}>{marque}</span>
                <span className={styles.friseLibelle}>{e.court}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function EtapeEntreprise({
  etat,
  changer,
  refusDe,
}: {
  etat: Cessation;
  changer: (c: Partial<Cessation>) => void;
  refusDe: (champ: string) => string | undefined;
}) {
  function retenir(trouvee: SocieteTrouvee) {
    changer({
      entreprise: {
        ...etat.entreprise,
        denomination: trouvee.denomination,
        siren: trouvee.siren,
        adresse: trouvee.siege,
        codePostal: trouvee.codePostal,
        ville: trouvee.commune,
      },
    });
  }

  const maj = (champ: string, valeur: string) =>
    changer({ entreprise: { ...etat.entreprise, [champ]: valeur } });

  /*
   * Plusieurs champs de l'entreprise d'un coup.
   *
   * Retenir une adresse écrit la voie, le code postal et la ville dans le même cycle :
   * trois appels à maj partiraient tous de la même entreprise capturée.
   */
  const majPlusieurs = (champs: Record<string, string>) =>
    changer({ entreprise: { ...etat.entreprise, ...champs } });

  const majPersonne = (champ: string, valeur: string) =>
    changer({ entrepreneur: { ...etat.entrepreneur, [champ]: valeur } });

  return (
    <>
      <p className={styles.description}>
        Cherchez votre auto-entreprise au registre : elle y figure sous votre nom, ou
        sous celui que vous lui avez donné.
      </p>

      <RechercheAuRegistre id="cessation-recherche" surSelection={retenir} />

      <div className={styles.champs}>
        <div className={`${styles.champ} ${styles.pleineLargeur}`}>
          <label htmlFor="cessation-denomination">Nom de l&apos;entreprise</label>
          <input
            id="cessation-denomination"
            value={etat.entreprise.denomination ?? ""}
            onChange={(e) => maj("denomination", e.target.value)}
          />
          {refusDe("denomination") && <p role="alert">{refusDe("denomination")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="cessation-siren">SIREN</label>
          <input
            id="cessation-siren"
            value={etat.entreprise.siren ?? ""}
            onChange={(e) => maj("siren", e.target.value)}
          />
          {refusDe("siren") && <p role="alert">{refusDe("siren")}</p>}
        </div>

        <div className={styles.champ}>
          <label htmlFor="cessation-activite">Activité exercée</label>
          <input
            id="cessation-activite"
            value={etat.entreprise.activite ?? ""}
            onChange={(e) => maj("activite", e.target.value)}
          />
        </div>

        <div className={`${styles.champ} ${styles.pleineLargeur}`}>
          <label htmlFor="cessation-adresse">Adresse de l&apos;entreprise</label>
          {/* Cherchée à la Base Adresse Nationale, comme partout ailleurs. */}
          <Adresse
            id="cessation-adresse"
            valeur={etat.entreprise.adresse ?? ""}
            surChangement={(voie) => maj("adresse", voie)}
            surCompletion={(codePostal, ville, voie) =>
              majPlusieurs({ adresse: voie, codePostal, ville })
            }
            placeholder="Rechercher l'adresse..."
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="cessation-cp">Code postal</label>
          <input
            id="cessation-cp"
            value={etat.entreprise.codePostal ?? ""}
            inputMode="numeric"
            maxLength={5}
            onChange={(e) => maj("codePostal", e.target.value.replace(/\D/g, ""))}
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="cessation-ville">Ville</label>
          {/* La commune se cherche aussi, et rapporte son code postal. */}
          <Ville
            id="cessation-ville"
            valeur={etat.entreprise.ville ?? ""}
            surChangement={(ville) => maj("ville", ville)}
            surCompletion={(codePostal, ville) => majPlusieurs({ codePostal, ville })}
          />
        </div>
      </div>

      {/*
        L'entrepreneur, non un dirigeant.
        Une auto-entreprise se confond avec la personne : c'est elle qui signe le
        pouvoir, et c'est son nom qui figure sur la déclaration.
      */}
      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Vous</h3>
        <p className={styles.blocTexte}>
          Une auto-entreprise se confond avec la personne qui l&apos;exerce : c&apos;est
          vous qui déclarez, et vous qui signez.
        </p>

        <div className={styles.champs}>
          <div className={styles.champ}>
            <label htmlFor="cessation-civilite">Civilité</label>
            <ChampChoix
              id="cessation-civilite"
              valeur={etat.entrepreneur.civilite ?? ""}
              options={["Monsieur", "Madame"]}
              surChangement={(civilite) => majPersonne("civilite", civilite)}
            />
          </div>

          <div className={styles.champ}>
            <label htmlFor="cessation-prenom">Prénom</label>
            <input
              id="cessation-prenom"
              value={etat.entrepreneur.prenom ?? ""}
              onChange={(e) => majPersonne("prenom", e.target.value)}
            />
          </div>

          <div className={styles.champ}>
            <label htmlFor="cessation-nom">Nom</label>
            <input
              id="cessation-nom"
              value={etat.entrepreneur.nom ?? ""}
              onChange={(e) => majPersonne("nom", e.target.value.toLocaleUpperCase("fr"))}
            />
          </div>
        </div>
      </section>
    </>
  );
}

function Champs({
  etat,
  majValeurs,
  refusDe,
}: {
  etat: Cessation;
  majValeurs: (maj: (v: Cessation["valeurs"]) => Cessation["valeurs"]) => void;
  refusDe: (champ: string) => string | undefined;
}) {
  const visibles = champsAffiches(etat);

  return (
    <div className={styles.champs}>
      {visibles.map((champ, rang) => (
        <Fragment key={champ.identifiant}>
          {champ.groupe && champ.groupe !== visibles[rang - 1]?.groupe && (
            <h4 className={styles.champsGroupe}>{champ.groupe}</h4>
          )}
          <Champ
            champ={champ}
            valeur={etat.valeurs[champ.identifiant]}
            refus={refusDe(champ.identifiant)}
            surChangement={(identifiant, valeur) =>
              majValeurs((v) => ({ ...v, [identifiant]: valeur }))
            }
            surSociete={() => {}}
            surAdresse={(adresse) =>
              majValeurs((v) => ({ ...v, [champ.identifiant]: adresse }))
            }
          />
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Le calendrier, calculé à mesure qu'on répond.
 *
 * C'est ce que le client vient chercher sans le savoir. La formalité est gratuite et
 * tient en dix minutes ; ce sont les quatre échéances d'après qui coûtent cher quand
 * on les manque, et personne ne les lui donnera datées.
 */
function Echeances({ etat }: { etat: Cessation }) {
  const echeances = echeancesDe({
    nature: etat.nature,
    dateCessation: String(etat.valeurs.dateCessation ?? "") || null,
    periodicite:
      (String(etat.valeurs.periodicite ?? "").toLowerCase() as Periodicite) || "trimestrielle",
    commerciale: etat.valeurs.activiteCommerciale === "Oui",
    assujettiTva: etat.valeurs.assujettiTva === "Oui",
    agentCommercial: etat.valeurs.agentCommercial === "Oui",
  });

  return (
    <section className={styles.bloc}>
      <h3 className={styles.blocTitre}>Ce qu&apos;il vous restera à faire</h3>
      <p className={styles.blocTexte}>
        Nous déposons la déclaration. Le reste vous appartient, et personne ne vous le
        rappellera : voici les dates, calculées d&apos;après vos réponses.
      </p>

      <ul className={styles.jalons}>
        {echeances.map((echeance) => (
          <li key={echeance.cle} className={styles.jalon}>
            <span className={styles.jalonCase} aria-hidden="true" />
            <div>
              <p className={styles.jalonIntitule}>
                {echeance.intitule}
                {" · "}
                <strong>
                  {echeance.limite
                    ? echeance.limite.split("-").reverse().join("/")
                    : (echeance.quand ?? "")}
                </strong>
                {/* Ce qui nous revient se distingue de ce qui lui revient. */}
                {echeance.pourNous && (
                  <span className={styles.jalonNotre}> — nous nous en chargeons</span>
                )}
              </p>
              <p className={styles.jalonTexte}>{echeance.explication}</p>
              <p className={styles.jalonFondement}>{echeance.fondement}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EtapeReglement({
  dossier,
  etat,
  anomalies,
  actesInitiaux,
}: {
  dossier: number;
  etat: Cessation;
  anomalies: { champ: string; message: string }[];
  actesInitiaux: ActeProduit[];
}) {
  const [documents, setDocuments] = useState<ActeProduit[]>(actesInitiaux);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const montant = devisDeCessation(etat.nature);

  function produire() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/cessation/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(corps.error ?? "Les pièces n'ont pas pu être produites");
        return;
      }
      setDocuments(corps.documents ?? []);
    });
  }

  function payer() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/cessation/paiement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(corps.error ?? "Le paiement n'a pas pu être ouvert");
        return;
      }
      window.location.href = corps.adresse;
    });
  }

  return (
    <>
      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Vos pièces</h3>
        <p className={styles.blocTexte}>
          Une déclaration récapitulative, qui vous reste comme preuve de ce qui a été
          déclaré, et un pouvoir : le guichet n&apos;accepte un dépôt par un tiers que
          sur mandat écrit.
        </p>

        {documents.length > 0 && (
          <ul className={styles.actes}>
            {documents.map((d) => (
              <li key={d.id} className={styles.acte}>
                <span className={styles.acteTitre}>{d.titre}</span>
                <span className={d.enRelecture ? styles.acteEnRelecture : styles.acteRemis}>
                  {d.enRelecture ? "En relecture" : "Relu, à votre disposition"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.blocActions}>
          <button
            type="button"
            className={documents.length > 0 ? undefined : styles.blocPrincipal}
            onClick={produire}
            disabled={enCours}
          >
            {enCours ? "Production" : documents.length > 0 ? "Reproduire" : "Produire les pièces"}
          </button>
        </div>

        {refus && (
          <p className={styles.paiementManque} role="alert">
            {refus}
          </p>
        )}
      </section>

      <section className={styles.bloc}>
        <h3 className={styles.blocTitre}>Ce que nous faisons</h3>
        <ul className={styles.prestationsCompactes}>
          {PRESTATIONS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <dl className={`${styles.faits} ${styles.faitsPrix}`}>
          {montant.honoraires.map((ligne) => (
            <div className={styles.fait} key={ligne.libelle}>
              <dt>{ligne.libelle}</dt>
              <dd>
                <span className={styles.faitValeur}>
                  {montantLisible(ligne.centimes)} HT
                </span>
                {ligne.precision && (
                  <span className={styles.faitPrecision}>{ligne.precision}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className={styles.blocNote}>
          Total à régler : {montantLisible(montant.totalTTC)} TTC. {FORMALITE_GRATUITE} {DELAI}
        </p>

        {anomalies.length > 0 ? (
          <p className={styles.paiementManque}>
            {anomalies.length === 1
              ? "Une information manque : "
              : anomalies.length + " informations manquent : "}
            {anomalies.map((a) => a.message).join(", ")}.
          </p>
        ) : (
          <div className={styles.blocActions}>
            <button
              type="button"
              className={styles.blocPrincipal}
              onClick={payer}
              disabled={enCours}
            >
              {enCours ? "Ouverture du paiement" : "Régler et confier au cabinet"}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function FinDePaiement({ issue, dossier }: { issue: "regle" | "annule"; dossier: number }) {
  return (
    <div className={styles.obligations} role="status">
      <ul>
        <li>
          {issue === "regle" ? (
            <>
              Votre règlement est enregistré. Le dossier {dossier} part au cabinet, qui
              déposera la déclaration au guichet unique.{" "}
              <Link href="/documents">Vos pièces sont dans vos documents.</Link>
            </>
          ) : (
            "Le paiement a été abandonné : rien n'a été débité. Vous pouvez le reprendre quand vous voulez."
          )}
        </li>
      </ul>
    </div>
  );
}
