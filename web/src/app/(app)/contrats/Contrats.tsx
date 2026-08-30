"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  etatLisible,
  actionAttendue,
  FILTRES,
  dansLeFiltre,
  comptesParFiltre,
  parUrgence,
  OFFRES,
  type FiltreContrat,
  type Offre,
} from "@/domain/contrat/parcours";
import {
  CONTRATS,
  definitionContrat,
  verifierContrat,
  type ChampContrat,
} from "@/domain/contrat/catalogue";
import { filtresUtiles } from "@/domain/document/statuts";
import { formaterDate } from "@/lib/dates";
import { ChampDate } from "@/components/formulaire/ChampDate";
import { ChampNombre } from "@/components/formulaire/ChampNombre";
import styles from "./Contrats.module.css";
import { Redaction } from "./Redaction";
import { BarreDOutils, Selecteur } from "@/components/page/BarreDOutils";

export interface ContratAffiche {
  id: number;
  titre: string;
  type: string;
  status: string | null;
  fichier: string | null;
  majLe: string | null;
  valeurs: Record<string, string>;
}

function Feuille() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function Croix() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const TEINTES: Record<string, string> = {
  vous: styles.etatVous,
  avocat: styles.etatAvocat,
  personne: styles.etatFini,
};

/**
 * Les contrats.
 *
 * La page ne suppose aucun vocabulaire juridique : le parcours est expliqué en haut,
 * chaque ligne dit dans quel état est le contrat et à qui la main, et l'assistant
 * demande des informations, jamais des clauses.
 */
export function Contrats({ contrats }: { contrats: ContratAffiche[] }) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<FiltreContrat>("tous");
  const [assistant, setAssistant] = useState<{
    type: string | null;
    existant?: ContratAffiche;
  } | null>(null);
  const [avis, setAvis] = useState<string | null>(null);

  const comptes = comptesParFiltre(contrats);
  const retenus = parUrgence(
    contrats
      .filter((c) => dansLeFiltre(c.status, filtre))
      .map((c) => ({ ...c, majLe: c.majLe ? new Date(c.majLe) : null }))
  );

  return (
    <>
      {avis && (
        <div className={styles.avis} role="status">
          <span className={styles.avisPoint} />
          <span className={styles.avisTexte}>{avis}</span>
        </div>
      )}

      {/*
        Le bandeau des trois étapes a été retiré.

        Il expliquait le parcours en trois cartes - « À compléter », « En relecture »,
        « Relu par un avocat » - chacune avec son décompte et sa phrase. Les décomptes
        sont ceux des filtres, juste en dessous ; les phrases sont recopiées mot pour mot
        sur chaque ligne de la liste, qui les porte là où elles servent. Il disait donc
        trois fois ce que la page dit déjà, et prenait un tiers de l'écran pour le dire.
      */}

      {/*
        Les mêmes filtres que « Mes formalités » et que les consultations.

        Chacun portait ici son propre cadre bordé, et le bouton « Nouveau contrat »
        terminait la rangée : on le prenait pour un filtre de plus. Le sélecteur partagé
        met les filtres dans un cadre unique, dont le fond blanc glisse de l'un à
        l'autre, et le geste est parti dans la colonne. Un « 0 » collé au libellé
        n'informe pas : `filtresUtiles` écarte les rubriques vides.
      */}
      <BarreDOutils>
        <Selecteur
          intitule="Filtrer les contrats"
          actif={filtre}
          surChoix={(valeur) => setFiltre(valeur as FiltreContrat)}
          choix={filtresUtiles(FILTRES, comptes, filtre).map((f) => ({
            valeur: f.valeur,
            libelle: f.libelle,
            compte: comptes[f.valeur] > 0 ? comptes[f.valeur] : undefined,
          }))}
        />
      </BarreDOutils>

      {/*
        La grille ne commence qu'à la liste : la colonne de droite se pose ainsi au
        niveau du premier contrat, et non au-dessus du bandeau et des filtres.
      */}
      <div className={styles.grille}>

      {retenus.length === 0 ? (
        <div className={styles.vide}>
          <span className={styles.videTitre}>
            {contrats.length === 0 ? "Aucun contrat pour le moment" : "Rien dans cette catégorie"}
          </span>
          <span className={styles.videTexte}>
            {contrats.length === 0
              ? "Choisissez ce dont vous avez besoin : vous remplissez quelques informations, un avocat relit, et vous signez."
              : "Vos contrats sont peut-être à une autre étape."}
          </span>

          {contrats.length === 0 && (
            // On part d'un besoin - « il me faut un bail » - et non d'un bouton
            // « Nouveau » qui laisse deviner ce qu'on peut demander.
            <div className={styles.typeGrille}>
              {CONTRATS.map((definition) => (
                <button
                  type="button"
                  key={definition.code}
                  className={styles.typeCarte}
                  onClick={() => setAssistant({ type: definition.code })}
                >
                  <span className={styles.typeNom}>{definition.libelle}</span>
                  <span className={styles.typeTexte}>{definition.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.liste}>
          {retenus.map((contrat) => (
            <Ligne
              key={contrat.id}
              contrat={contrat}
              surReprise={() =>
                setAssistant({
                  type: contrat.type,
                  existant: { ...contrat, majLe: contrat.majLe?.toISOString() ?? null },
                })
              }
            />
          ))}
        </div>
      )}

        {/*
          La colonne de droite : rédiger, et ce qu'il faut savoir avant.

          Dernière du document - mais la grille la remonte au-dessus de la liste sur un
          écran étroit : ici on vient pour rédiger, non pour parcourir.
        */}
        <Redaction surNouveau={() => setAssistant({ type: null })} />
      </div>

      {assistant && (
        <Assistant
          typeInitial={assistant.type}
          existant={assistant.existant}
          onFermer={() => setAssistant(null)}
          onEnvoye={(message) => {
            setAssistant(null);
            setAvis(message);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** Ce que la ligne manipule : la date y est une Date, non plus la chaîne transmise. */
type ContratEnListe = Omit<ContratAffiche, "majLe"> & { majLe: Date | null };

function Ligne({ contrat, surReprise }: { contrat: ContratEnListe; surReprise: () => void }) {
  const etat = etatLisible(contrat.status);
  const geste = actionAttendue(contrat.status);
  const definition = definitionContrat(contrat.type);

  return (
    <div className={styles.ligne}>
      <span className={styles.icone}>
        <Feuille />
      </span>

      <span className={styles.corps}>
        <span className={styles.titre}>{contrat.titre}</span>
        <span className={styles.details}>
          <span>{definition?.libelle ?? contrat.type}</span>
          {contrat.majLe && <span>{formaterDate(contrat.majLe)}</span>}
          {/* L'explication est sur la ligne, non dans une infobulle : ce qu'on veut
              savoir en parcourant la liste, c'est si la balle est dans son camp. */}
          <span className={styles.explication}>{etat.explication}</span>
        </span>
      </span>

      <span className={styles.etatPastille + " " + TEINTES[etat.main]}>{etat.libelle}</span>

      <span className={styles.actions}>
        {contrat.fichier && (
          <a
            className={styles.action + " " + styles.actionPrincipale}
            href={
              "/api/fichier?nom=" +
              encodeURIComponent(contrat.fichier) +
              "&titre=" +
              encodeURIComponent(contrat.titre) +
              "&telecharger=1"
            }
          >
            Télécharger
          </a>
        )}

        {geste && etat.code === "brouillon" && (
          <button
            type="button"
            className={styles.action + " " + styles.actionPrincipale}
            onClick={surReprise}
          >
            {geste}
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * L'assistant : le type, les informations, puis l'envoi.
 *
 * Trois étapes et pas une de plus. Il demande des informations - un nom, une adresse,
 * un montant - et jamais de rédiger une clause : c'est le travail de l'avocat, et
 * c'est précisément ce qu'on vient chercher.
 */
function Assistant({
  typeInitial,
  existant,
  onFermer,
  onEnvoye,
}: {
  typeInitial: string | null;
  existant?: ContratAffiche;
  onFermer: () => void;
  onEnvoye: (message: string) => void;
}) {
  const [etape, setEtape] = useState(typeInitial ? 2 : 1);
  const [type, setType] = useState<string | null>(typeInitial);
  // Un contrat repris rouvre avec ce qui avait été saisi : le laisser vide obligerait
  // à tout ressaisir pour un champ manquant.
  const [valeurs, setValeurs] = useState<Record<string, string>>(existant?.valeurs ?? {});
  const [offre, setOffre] = useState<Offre | null>(null);
  const [anomalies, setAnomalies] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const definition = type ? definitionContrat(type) : null;

  function suivant() {
    setErreur(null);

    if (etape === 1) {
      if (!type) {
        setErreur("Choisissez le contrat dont vous avez besoin.");
        return;
      }
      setEtape(2);
      return;
    }

    if (etape === 2) {
      // La vérification est celle du domaine, la même que le serveur appliquera : deux
      // règles écrites deux fois finissent par diverger.
      const trouvees = verifierContrat(type ?? "", valeurs);
      if (trouvees.length > 0) {
        setAnomalies(Object.fromEntries(trouvees.map((a) => [a.champ, a.message])));
        return;
      }
      setAnomalies({});
      setEtape(3);
      return;
    }

    if (etape === 3) {
      if (!offre) {
        setErreur("Choisissez ce que vous voulez : le document seul, ou relu par un avocat.");
        return;
      }
      setEtape(4);
      return;
    }

    envoyer();
  }

  function envoyer() {
    const choisie = OFFRES.find((o) => o.code === offre);
    if (!type || !definition || !choisie) return;

    demarrer(async () => {
      try {
        let id = existant?.id ?? 0;

        // Un contrat repris n'en crée pas un second : on le complète.
        if (!existant) {
          const creation = await fetch("/api/contrats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, titre: definition.libelle }),
          });
          const donnees = await creation.json();
          if (!creation.ok) {
            setErreur((donnees.error as string) ?? "Le contrat n'a pas pu être créé.");
            return;
          }
          id = donnees.contrat.id as number;
        }

        /*
         * Les valeurs, puis la rédaction, puis - si l'offre le demande - la relecture.
         * Trois écritures parce que ce sont trois faits distincts, et l'offre choisie
         * décide seulement de la dernière : elle n'a pas de colonne à elle, l'état où
         * le contrat s'arrête la dit déjà.
         */
        const etapes: { valeurs?: typeof valeurs; etat?: string }[] = [
          { valeurs },
          { etat: "genere" },
        ];
        if (choisie.aboutit === "en_validation") etapes.push({ etat: "en_validation" });

        for (const corps of etapes) {
          const reponse = await fetch("/api/contrats/" + id, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(corps),
          });
          if (!reponse.ok) {
            const echec = await reponse.json().catch(() => ({}));
            setErreur((echec.error as string) ?? "L'envoi n'a pas abouti.");
            return;
          }
        }

        onEnvoye(
          choisie.aboutit === "en_validation"
            ? "Contrat envoyé à l'avocat. Il le relit et vous prévient : il n'y a rien d'autre à faire de votre côté."
            : "Contrat prêt. Vous pouvez le télécharger depuis la liste."
        );
      } catch {
        setErreur("L'envoi n'a pas abouti.");
      }
    });
  }

  return (
    <div
      className={styles.voile}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className={styles.fenetre}
        role="dialog"
        aria-modal="true"
        aria-label={existant ? "Compléter le contrat" : "Nouveau contrat"}
      >
        <div className={styles.fenetreTete}>
          <h2>{existant ? "Compléter le contrat" : "Nouveau contrat"}</h2>
          <button type="button" className={styles.fermer} onClick={onFermer} aria-label="Fermer">
            <Croix />
          </button>
        </div>

        <div className={styles.progres}>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={styles.progresEtape + (n <= etape ? " " + styles.progresFait : "")}
            />
          ))}
        </div>

        <div className={styles.fenetreCorps}>
          {etape === 1 && (
            <>
              <p className={styles.etapeTitre}>De quoi avez-vous besoin ?</p>
              <p className={styles.etapeSous}>
                Choisissez le contrat qui correspond à votre situation. Vous pourrez en parler avec
                l&apos;avocat avant de signer.
              </p>
              <div className={styles.typeGrille}>
                {CONTRATS.map((d) => (
                  <button
                    type="button"
                    key={d.code}
                    className={styles.typeCarte + (type === d.code ? " " + styles.typeChoisi : "")}
                    onClick={() => setType(d.code)}
                    aria-pressed={type === d.code}
                  >
                    <span className={styles.typeNom}>{d.libelle}</span>
                    <span className={styles.typeTexte}>{d.description}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {etape === 2 && definition && (
            <>
              <p className={styles.etapeTitre}>{definition.libelle}</p>
              <p className={styles.etapeSous}>
                Quelques informations suffisent. Vous n&apos;avez aucune clause à rédiger :
                c&apos;est le travail de l&apos;avocat.
              </p>

              <div className={styles.champs}>
                {definition.champs.map((champ) => (
                  <Champ
                    key={champ.identifiant}
                    champ={champ}
                    valeur={valeurs[champ.identifiant] ?? ""}
                    anomalie={anomalies[champ.identifiant]}
                    surSaisie={(v) => setValeurs({ ...valeurs, [champ.identifiant]: v })}
                  />
                ))}
              </div>
            </>
          )}

          {etape === 3 && (
            <>
              <p className={styles.etapeTitre}>Que voulez-vous ?</p>
              <p className={styles.etapeSous}>
                Formalist rédige le contrat. Vous pouvez le prendre tel quel, ou le faire relire par
                un avocat avant de l&apos;utiliser.
              </p>

              <div className={styles.offres}>
                {OFFRES.map((o) => (
                  <button
                    type="button"
                    key={o.code}
                    className={styles.typeCarte + (offre === o.code ? " " + styles.typeChoisi : "")}
                    onClick={() => setOffre(o.code)}
                    aria-pressed={offre === o.code}
                  >
                    <span className={styles.typeNom}>{o.libelle}</span>
                    <span className={styles.typeTexte}>{o.description}</span>
                  </button>
                ))}
              </div>

              {/*
                La signature ne se fait pas ici, et le dire évite de la chercher : le
                document est remis prêt à signer, les parties s'en chargent.
              */}
              <p className={styles.suite}>
                La signature se fait hors de Formalist : nous vous remettons le document prêt à être
                signé.
              </p>
            </>
          )}

          {etape === 4 && definition && (
            <>
              <p className={styles.etapeTitre}>Vérifiez avant d&apos;envoyer</p>
              <p className={styles.etapeSous}>
                Relisez ce que vous avez saisi avant d&apos;envoyer.
              </p>

              <div className={styles.recap}>
                <div className={styles.recapLigne}>
                  <span className={styles.recapCle}>Contrat</span>
                  <span className={styles.recapValeur}>{definition.libelle}</span>
                </div>
                {definition.champs.map((champ) => (
                  <div className={styles.recapLigne} key={champ.identifiant}>
                    <span className={styles.recapCle}>{champ.libelle}</span>
                    <span className={styles.recapValeur}>
                      {valeurs[champ.identifiant] || "Non renseigné"}
                    </span>
                  </div>
                ))}
              </div>

              <div className={styles.recap}>
                <div className={styles.recapLigne}>
                  <span className={styles.recapCle}>Ce que vous demandez</span>
                  <span className={styles.recapValeur}>
                    {OFFRES.find((o) => o.code === offre)?.libelle ?? "-"}
                  </span>
                </div>
              </div>

              {/* Ce qui se passe après, dit avant de cliquer. */}
              <p className={styles.suite}>
                {offre === "relecture"
                  ? "En envoyant, le contrat part chez l'avocat. Il le relit, le corrige si besoin, et vous prévient dès qu'il est prêt."
                  : "Le contrat est rédigé immédiatement. Vous le téléchargez depuis la liste, prêt à être signé."}
              </p>
            </>
          )}

          {erreur && (
            <p role="alert" className={styles.erreur}>
              {erreur}
            </p>
          )}
        </div>

        <div className={styles.fenetrePied}>
          <button
            type="button"
            className={styles.action}
            onClick={() => (etape === 1 ? onFermer() : setEtape(etape - 1))}
            disabled={enCours}
          >
            {etape === 1 ? "Annuler" : "Retour"}
          </button>
          <button
            type="button"
            className={styles.action + " " + styles.actionPrincipale}
            onClick={suivant}
            disabled={enCours}
          >
            {etape === 4
              ? enCours
                ? "Envoi en cours"
                : offre === "relecture"
                  ? "Envoyer à l'avocat"
                  : "Obtenir le document"
              : "Continuer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Champ({
  champ,
  valeur,
  anomalie,
  surSaisie,
}: {
  champ: ChampContrat;
  valeur: string;
  anomalie?: string;
  surSaisie: (valeur: string) => void;
}) {
  const identifiant = "champ-" + champ.identifiant;
  const commun = {
    id: identifiant,
    className: styles.champ + (anomalie ? " " + styles.champFautif : ""),
    value: valeur,
    "aria-invalid": anomalie ? true : undefined,
  };

  return (
    <div className={champ.type === "long" ? styles.champLong : undefined}>
      <label className={styles.champLabel} htmlFor={identifiant}>
        {champ.libelle}
        {champ.facultatif && <span className={styles.facultatif}> (facultatif)</span>}
      </label>

      {champ.type === "long" ? (
        <textarea {...commun} rows={4} onChange={(e) => surSaisie(e.target.value)} />
      ) : champ.type === "date" ? (
        /* Notre calendrier, comme partout : celui du navigateur ne s'habille pas. */
        <ChampDate id={identifiant} valeur={valeur} surChangement={surSaisie} />
      ) : champ.type === "nombre" ? (
        /* Sans compteur : sa molette change la valeur au passage du curseur. */
        <ChampNombre
          id={identifiant}
          className={commun.className}
          valeur={valeur}
          decimales
          aria-invalid={anomalie ? true : undefined}
          surChangement={(nombre) => surSaisie(nombre === "" ? "" : String(nombre))}
        />
      ) : (
        <input {...commun} type="text" onChange={(e) => surSaisie(e.target.value)} />
      )}

      {anomalie && <span className={styles.messageChamp}>{anomalie}</span>}
    </div>
  );
}
