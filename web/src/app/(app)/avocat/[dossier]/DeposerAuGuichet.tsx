"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dateHeureLongue } from "@/lib/dates";
import { ChampChoix } from "@/components/formulaire/ChampChoix";
import { ChampDate } from "@/components/formulaire/ChampDate";
import styles from "../Avocat.module.css";

/**
 * Déposer le dossier au guichet unique, depuis l'écran où il se travaille.
 *
 * L'avocat déposait à la main : rouvrir le site de l'INPI, retaper quarante champs,
 * téléverser huit pièces, puis revenir cocher « Dépôt » ici. Le bouton fait les quatre
 * appels que le contrat impose - créer, joindre, rafraîchir la synthèse, signer - et
 * rend l'état que le guichet renvoie.
 *
 * Il ne s'ouvre que sur une création. Une modification se signe avec un certificat
 * électronique que nous ne savons pas encore produire, et un bouton qui échouerait au
 * dernier appel vaut moins qu'un bouton absent.
 *
 * Trois choses lui manquent toujours, et il les demande plutôt que de les inventer : la
 * catégorie d'activité, que la description libre ne donne pas ; la commune de naissance
 * en code INSEE, que plusieurs communes homonymes rendent indevinable ; l'annonce
 * légale, connue seulement une fois parue.
 */

interface Manque {
  chemin: string;
  quoi: string;
  origine: string;
}

interface Dirigeant {
  rang: number;
  nom: string;
  villeDeNaissance: string | null;
}

interface Preparation {
  type: string;
  piecesCompletes: boolean;
  piecesManquantes: string[];
  manques: Manque[];
  dirigeants: Dirigeant[];
  compte: { username: string; verifieLe: string | null } | null;
  compteDuServeur: boolean;
}

interface Categorie {
  value: string;
  label: string;
  subValues?: Categorie[];
}

interface Resultat {
  formaliteId: number;
  lien: string;
  numNat: string | null;
  statut: string | null;
  explication: string;
  piecesJointes: string[];
  piecesEcartees: { nom: string; raison: string }[];
}

/*
 * Les niveaux de l'arbre, nommés plutôt que numérotés.
 *
 * « Précision 1, Précision 2, Précision 3 » ne dit rien de ce qu'on choisit et se lit
 * comme une suite ; ce sont des degrés de finesse, et l'avocat s'y repère mieux par le
 * mot que par le rang.
 */
const NIVEAUX = ["Domaine", "Catégorie", "Sous-catégorie", "Précision"];

/** La première lettre en bas de casse : la date entre dans une phrase. */
function enPhrase(texte: string): string {
  return texte.charAt(0).toLowerCase() + texte.slice(1);
}

function Croix() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * La commune de naissance, cherchée plutôt que saisie.
 *
 * Le guichet veut un code INSEE et vérifie qu'il correspond au nom : « Le code commune
 * 98392 n'est pas compatible avec la commune de naissance Lyon ». Demander cinq chiffres
 * de mémoire, c'est demander une faute - et la découvrir après le refus, une fois la
 * formalité déjà créée chez eux.
 *
 * `geo.api.gouv.fr` les donne, sans clé, et le produit s'en sert déjà pour les adresses.
 * Les grandes villes ont un code par arrondissement : la liste les montre, et c'est
 * l'avocat qui tranche - Lyon 3e n'est pas Lyon 7e sur un acte d'état civil.
 */
function ChoixDeCommune({
  intitule,
  depart,
  code,
  surChoix,
}: {
  intitule: string;
  depart: string;
  code: string;
  surChoix: (code: string) => void;
}) {
  const [terme, setTerme] = useState(depart);
  const [communes, setCommunes] = useState<{ nom: string; code: string }[]>([]);
  const [cherche, setCherche] = useState(false);

  /*
   * Une frappe de moins de deux lettres ne cherche rien : « L » rendrait tout.
   *
   * Le vidage se fait au rendu, non dans l'effet : un `setState` synchrone au montage
   * relance un rendu pour rien, et React le signale.
   */
  const assezLong = terme.trim().length >= 2;

  useEffect(() => {
    const nom = terme.trim();
    if (nom.length < 2) return;

    const abandon = new AbortController();
    const minuteur = setTimeout(async () => {
      setCherche(true);
      try {
        const reponse = await fetch(
          "https://geo.api.gouv.fr/communes?nom=" +
            encodeURIComponent(nom) +
            "&fields=nom,code&boost=population&limit=8",
          { signal: abandon.signal }
        );
        if (reponse.ok) setCommunes((await reponse.json()) as { nom: string; code: string }[]);
      } catch {
        /* Service indisponible : le champ reste, et le code peut se coller à la main. */
      } finally {
        setCherche(false);
      }
    }, 250);

    return () => {
      clearTimeout(minuteur);
      abandon.abort();
    };
  }, [terme]);

  const proposees = assezLong ? communes : [];
  const retenue = proposees.find((c) => c.code === code);

  return (
    <div className={styles.guichetCommune}>
      <label className={styles.guichetLabel}>
        {intitule}
        <input
          type="text"
          value={terme}
          placeholder="Nom de la commune"
          onChange={(e) => {
            setTerme(e.target.value);
            surChoix("");
          }}
        />
      </label>

      {code ? (
        <p className={styles.guichetRetenu}>
          {retenue ? retenue.nom : "Commune retenue"} - code INSEE {code}
        </p>
      ) : proposees.length > 0 ? (
        <ul className={styles.guichetCommunes}>
          {proposees.map((commune) => (
            <li key={commune.code}>
              <button type="button" onClick={() => surChoix(commune.code)}>
                <span>{commune.nom}</span>
                <span className={styles.guichetCode}>{commune.code}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        assezLong && !cherche && (
          <p className={styles.guichetLegende}>Aucune commune de ce nom.</p>
        )
      )}
    </div>
  );
}

export interface DepotFait {
  formaliteId: number | null;
  numNat: string | null;
  /** ISO : le composant est client, la date traverse en chaîne. */
  deposeLe: string;
  /** Où la voir chez eux, ou rien si le guichet n'a pas rendu d'identifiant. */
  lien: string | null;
}

export function DeposerAuGuichet({
  dossier,
  type,
  depose,
}: {
  dossier: number;
  type: string;
  depose: DepotFait | null;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();

  const [ouverte, setOuverte] = useState(false);
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  /* Ce que le guichet reproche, champ par champ : c'est là qu'est la réponse. */
  const [reproches, setReproches] = useState<string[]>([]);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  /* La saisie de la fenêtre, telle qu'elle se remplit. */
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [choix, setChoix] = useState<string[]>([]);
  const [insee, setInsee] = useState<Record<number, string>>({});
  const [journal, setJournal] = useState("");
  const [dateParution, setDateParution] = useState("");

  /* Une modification ne se dépose pas d'un clic : le bouton ne s'affiche pas. */
  if (type !== "creation") return null;

  /*
   * Déposé une fois, déposé pour de bon.
   *
   * Le bouton restait après l'envoi : il invitait à recommencer, et un second dépôt
   * ferait immatriculer la société deux fois. À sa place, ce qui compte alors - que
   * c'est parti, et quand.
   */
  if (depose) {
    return (
      <span className={styles.guichetDepose}>
        <span className={styles.guichetDeposeQuand}>
          {/*
            `dateHeureLongue` met une capitale au jour de la semaine : elle est écrite
            pour un titre - « Mardi 8 septembre 2026 ». Au milieu d'une phrase, la
            capitale se voit ; le reste de la date ne change pas.
          */}
          Déposé le {enPhrase(dateHeureLongue(new Date(depose.deposeLe)))}
          {depose.numNat ? " - " + depose.numNat : ""}
        </span>
        {depose.lien && (
          /*
            Le dossier chez eux, en un clic.

            Un nouvel onglet : l'avocat travaille sur ce dossier-ci, et le lui faire
            quitter pour aller vérifier un statut lui ferait perdre sa place.
          */
          <a
            className={styles.decisionSecondaire}
            href={depose.lien}
            target="_blank"
            rel="noreferrer"
          >
            Voir sur le guichet
          </a>
        )}
      </span>
    );
  }

  const aBesoinDeLaCategorie = (preparation?.manques ?? []).some((m) =>
    m.chemin.includes("categorisationActivite")
  );
  const aBesoinDeLAnnonce = (preparation?.manques ?? []).some((m) =>
    m.chemin.endsWith("publicationLegale")
  );
  const communesADemander = (preparation?.manques ?? [])
    .filter((m) => m.chemin.endsWith("codeInseeGeographique"))
    .map((m) => Number(/pouvoirs\.(\d+)\./.exec(m.chemin)?.[1] ?? 0));

  /*
   * Ce que cette fenêtre ne sait pas demander.
   *
   * Elle connaît trois manques et leur donne un champ. Les autres, elle les passait
   * sous silence : le bouton s'activait, et le dépôt échouait sur le serveur avec un
   * message que rien à l'écran n'annonçait - c'est exactement ce qui est arrivé le jour
   * où le brouillon arrivait mal lu et où la forme juridique manquait.
   *
   * Un manque sans champ s'affiche donc tel quel, dans les mots du domaine, et retient
   * le dépôt. Mieux vaut une phrase technique qu'un bouton qui ment.
   */
  const couvert = (chemin: string) =>
    chemin.includes("categorisationActivite") ||
    chemin.endsWith("publicationLegale") ||
    chemin.endsWith("codeInseeGeographique");
  const manquesNonCouverts = (preparation?.manques ?? []).filter((m) => !couvert(m.chemin));

  function ouvrir() {
    setRefus(null);
    setReproches([]);
    setResultat(null);
    setOuverte(true);

    demarrer(async () => {
      const reponse = await fetch("/api/guichet/depot?dossier=" + dossier);
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(corps.error ?? "L'état du dossier n'a pas pu être lu.");
        return;
      }
      setPreparation(corps as Preparation);
      setIdentifiant((corps as Preparation).compte?.username ?? "");

      if ((corps as Preparation).manques.some((m) => m.chemin.includes("categorisationActivite"))) {
        const arbre = await fetch("/api/guichet/categories");
        if (arbre.ok) setCategories((await arbre.json()) as Categorie[]);
      }
    });
  }

  function connecter() {
    setRefus(null);
    setReproches([]);
    demarrer(async () => {
      const reponse = await fetch("/api/guichet/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: identifiant, password: motDePasse }),
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(
          corps.error ??
            "La connexion a échoué. Vérifiez le mot de passe, et que les conditions d'utilisation sont validées sur le site de l'INPI."
        );
        return;
      }
      /* Le mot de passe ne reste pas en mémoire une fois enregistré. */
      setMotDePasse("");
      setPreparation((etat) =>
        etat ? { ...etat, compte: { username: identifiant, verifieLe: new Date().toISOString() } } : etat
      );
    });
  }

  function deposer() {
    setRefus(null);
    setReproches([]);
    demarrer(async () => {
      const reponse = await fetch("/api/guichet/depot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dossier,
          complement: {
            ...(choix.filter(Boolean).length > 0
              ? { categorisationActivite: choix.filter(Boolean) }
              : {}),
            ...(Object.keys(insee).length > 0 ? { codeInseeNaissance: insee } : {}),
            ...(journal || dateParution
              ? { publicationLegale: { journal, date: dateParution } }
              : {}),
          },
        }),
      });
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) {
        setRefus(corps.error ?? "Le dépôt a échoué.");
        setReproches(Object.values(corps.details ?? {}).flat() as string[]);
        return;
      }
      setResultat(corps as Resultat);
      router.refresh();
    });
  }

  /* Les niveaux de l'arbre, du premier jusqu'à celui qu'on vient de choisir. */
  const niveaux: Categorie[][] = [];
  let branche: Categorie[] | undefined = categories;
  for (let rang = 0; branche && branche.length > 0 && rang < 4; rang++) {
    niveaux.push(branche);
    branche = branche.find((c) => c.value === choix[rang])?.subValues;
  }

  const pret =
    preparation !== null &&
    manquesNonCouverts.length === 0 &&
    preparation.piecesCompletes &&
    (preparation.compte !== null || preparation.compteDuServeur) &&
    (!aBesoinDeLaCategorie || choix.filter(Boolean).length >= 2) &&
    (!aBesoinDeLAnnonce || (journal.trim() !== "" && dateParution !== "")) &&
    communesADemander.every((rang) => (insee[rang] ?? "").trim() !== "");

  return (
    <>
      <button type="button" className={styles.decisionSecondaire} onClick={ouvrir}>
        Déposer au guichet unique
      </button>

      {ouverte && (
        <>
          <div className={styles.voile} onClick={() => setOuverte(false)} aria-hidden="true" />

          <div
            className={styles.correction}
            role="dialog"
            aria-modal="true"
            aria-label="Déposer au guichet unique"
          >
            <div className={styles.correctionTete}>
              <div>
                <h3 className={styles.correctionTitre}>Déposer au guichet unique</h3>
                <p className={styles.correctionDetail}>
                  La formalité est créée, les pièces jointes, la synthèse signée. Le dépôt
                  part sous votre compte e-procedures.
                </p>
              </div>
              <button
                type="button"
                className={styles.panneauFermer}
                onClick={() => setOuverte(false)}
                aria-label="Fermer"
              >
                <Croix />
              </button>
            </div>

            {refus && (
              <div className={styles.correctionRefus} role="alert">
                <p className={styles.correctionRefusTitre}>{refus}</p>
                {/*
                  Ce que le guichet reproche, dans ses mots.

                  Il nomme le champ et la raison ; les reprendre tels quels vaut mieux
                  que de les traduire, parce que c'est ce texte-là que l'avocat
                  retrouvera s'il ouvre le dossier sur le site de l'INPI.
                */}
                {reproches.length > 0 && (
                  <ul className={styles.correctionManques}>
                    {reproches.map((reproche) => (
                      <li key={reproche}>{reproche}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {resultat ? (
              <div className={styles.guichetResultat}>
                <p className={styles.guichetStatut}>{resultat.explication}</p>
                <dl className={styles.guichetFiche}>
                  <dt>Formalité</dt>
                  <dd>{resultat.formaliteId}</dd>
                  {resultat.numNat && (
                    <>
                      <dt>Numéro national</dt>
                      <dd>{resultat.numNat}</dd>
                    </>
                  )}
                  <dt>Pièces transmises</dt>
                  <dd>{resultat.piecesJointes.length}</dd>
                </dl>

                <a
                  className={styles.decisionSecondaire}
                  href={resultat.lien}
                  target="_blank"
                  rel="noreferrer"
                >
                  Voir sur le guichet unique
                </a>

                {/* Ce qui n'est pas parti se dit : le taire ferait croire le dossier complet. */}
                {resultat.piecesEcartees.length > 0 && (
                  <ul className={styles.correctionManques}>
                    {resultat.piecesEcartees.map((piece) => (
                      <li key={piece.nom}>
                        {piece.nom} - {piece.raison}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className={styles.guichetChamps}>
                {!preparation ? (
                  <p className={styles.correctionDetail}>Lecture du dossier…</p>
                ) : (
                  <>
                    {!preparation.piecesCompletes && (
                      <div className={styles.guichetBloc}>
                        <h4 className={styles.guichetTitre}>Pièces manquantes</h4>
                        <p className={styles.guichetLegende}>
                          Le dépôt attend qu&apos;elles soient au dossier.
                        </p>
                        <ul className={styles.correctionManques}>
                          {preparation.piecesManquantes.map((piece) => (
                            <li key={piece}>{piece}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {manquesNonCouverts.length > 0 && (
                      <div className={styles.guichetBloc}>
                        <h4 className={styles.guichetTitre}>À compléter dans le dossier</h4>
                        <p className={styles.guichetLegende}>
                          Le guichet réclame des informations que cette fenêtre ne sait pas
                          encore demander.
                        </p>
                        <ul className={styles.correctionManques}>
                          {manquesNonCouverts.map((manque) => (
                            <li key={manque.chemin}>{manque.quoi}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!preparation.compte && !preparation.compteDuServeur && (
                      <div className={styles.guichetBloc}>
                        <h4 className={styles.guichetTitre}>Votre compte e-procedures</h4>
                        <p className={styles.guichetLegende}>
                          Le compte de l&apos;INPI est nominatif : la formalité partira en
                          votre nom.
                        </p>
                        <label className={styles.guichetLabel}>
                          Identifiant
                          <input
                            type="text"
                            autoComplete="username"
                            value={identifiant}
                            onChange={(e) => setIdentifiant(e.target.value)}
                          />
                        </label>
                        <label className={styles.guichetLabel}>
                          Mot de passe
                          <input
                            type="password"
                            autoComplete="current-password"
                            value={motDePasse}
                            onChange={(e) => setMotDePasse(e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className={styles.decisionSecondaire}
                          onClick={connecter}
                          disabled={enCours || !identifiant || !motDePasse}
                        >
                          Vérifier et enregistrer
                        </button>
                      </div>
                    )}

                    {preparation.compte && (
                      <p className={styles.guichetLegende}>
                        Compte connecté : {preparation.compte.username}
                      </p>
                    )}

                    {aBesoinDeLaCategorie && (
                      <div className={styles.guichetBloc}>
                        <h4 className={styles.guichetTitre}>Catégorie d&apos;activité</h4>
                        <p className={styles.guichetLegende}>
                          Le guichet classe l&apos;activité dans son propre arbre. Précisez
                          jusqu&apos;où vous le pouvez : deux niveaux au moins.
                        </p>
                        {niveaux.map((options, rang) => (
                          <label key={rang} className={styles.guichetLabel}>
                            {NIVEAUX[rang]}
                            <ChampChoix
                              id={"categorie-" + rang}
                              valeur={choix[rang] ?? ""}
                              invite="Choisir"
                              options={options.map((o) => ({
                                valeur: o.value,
                                libelle: o.label,
                              }))}
                              surChangement={(valeur) =>
                                setChoix(choix.slice(0, rang).concat(valeur))
                              }
                            />
                          </label>
                        ))}
                      </div>
                    )}

                    {communesADemander.length > 0 && (
                      <div className={styles.guichetBloc}>
                        <h4 className={styles.guichetTitre}>Commune de naissance</h4>
                        <p className={styles.guichetLegende}>
                          Le guichet la veut en code INSEE. Cherchez la commune, le code
                          suit - Lyon en compte dix, un par arrondissement.
                        </p>
                        {communesADemander.map((rang) => {
                          const qui = preparation.dirigeants.find((d) => d.rang === rang);
                          return (
                            <ChoixDeCommune
                              key={rang}
                              intitule={
                                (qui?.nom ?? "Dirigeant " + (rang + 1)) +
                                (qui?.villeDeNaissance ? " - né à " + qui.villeDeNaissance : "")
                              }
                              depart={qui?.villeDeNaissance ?? ""}
                              code={insee[rang] ?? ""}
                              surChoix={(code) => setInsee({ ...insee, [rang]: code })}
                            />
                          );
                        })}
                      </div>
                    )}

                    {aBesoinDeLAnnonce && (
                      <div className={styles.guichetBloc}>
                        <h4 className={styles.guichetTitre}>Annonce légale</h4>
                        <p className={styles.guichetLegende}>
                          Telle qu&apos;elle a paru : c&apos;est ce que le greffe vérifie.
                        </p>
                        <label className={styles.guichetLabel}>
                          Journal
                          <input
                            type="text"
                            placeholder="Actu-Juridique"
                            value={journal}
                            onChange={(e) => setJournal(e.target.value)}
                          />
                        </label>
                        <label className={styles.guichetLabel}>
                          Date de parution
                          <ChampDate
                            id="parution"
                            valeur={dateParution}
                            surChangement={setDateParution}
                          />
                        </label>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className={styles.correctionActions}>
              <button
                type="button"
                className={styles.decisionSecondaire}
                onClick={() => setOuverte(false)}
              >
                {resultat ? "Fermer" : "Annuler"}
              </button>
              {!resultat && (
                <button
                  type="button"
                  className={styles.decisionValider}
                  onClick={deposer}
                  disabled={enCours || !pret}
                >
                  {enCours ? "Dépôt en cours…" : "Déposer"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
