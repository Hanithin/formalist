"use client";

import { useState } from "react";

import { nomDeLaPartie, nomComplet } from "@/domain/formalite/etat-civil";
import { regle } from "@/domain/formalite/formes";
import { apportsDe, repartitionDesTitres, valeurNominale } from "@/domain/formalite/capital";
import { elider, nombreEnFrancais } from "@/domain/formalite/lettres";
import { motAssocie, motPart, type Associe, type Brouillon } from "@/domain/formalite/parcours";
import { Champ } from "./EtatCivil";
import styles from "./Parcours.module.css";

/**
 * La répartition du capital.
 *
 * Reprise de l'étape « Capital » de public/creation.html : la barre de couverture
 * en tête, une carte par associé avec son nombre de parts et sa part du gâteau, le
 * bloc d'apport en nature qui se déplie, et le récapitulatif chiffré en pied.
 *
 * Tous les montants sont calculés, jamais saisis deux fois : le souscrit se déduit
 * des parts et de la valeur nominale, le reste à libérer du versement. Le
 * formulaire d'origine faisait déjà ainsi, et c'est ce qui garantit que les
 * statuts et l'attestation de dépôt annoncent le même chiffre.
 *
 * Les calculs viennent de domain/formalite/capital : ce sont exactement ceux qui
 * remplissent les actes et qui décident si l'étape est cohérente.
 */

interface Props {
  brouillon: Brouillon;
  surChangement: (valeurs: Partial<Brouillon>) => void;
  surAssocies: (associes: Associe[]) => void;
  anomalies: Record<string, string>;
}

/** La palette des segments, dans l'ordre de la page d'origine. */
const COULEURS = [
  "#111",
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

/** Un pourcentage à une décimale, sans le zéro inutile : « 33,3 » et « 50 ». */
function pourcent(valeur: number): string {
  return valeur.toFixed(1).replace(/\.0$/, "");
}

function euros(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " €";
}

/**
 * La valeur nominale, sans arrondi complaisant ni notation savante.
 *
 * Deux mille euros en six cent soixante-sept actions font 2,9985 € : arrondi à deux
 * décimales, on lirait « 3 € », et six cent soixante-sept fois trois euros ne font pas
 * deux mille. C'est ce chiffre exact que portent les statuts.
 *
 * En dessous du centime, on descend à douze décimales. `String(2000 / 3e12)` rend
 * « 6.666666666666666e-10 », que le champ affichait tronqué à sa largeur : on y lisait
 * « 6,66 € » là où l'action vaut moins d'un milliardième d'euro. Et six décimales
 * auraient rendu « 0 », tout aussi faux.
 */
function nominaleLisible(valeur: number, groupee = true): string {
  if (!Number.isFinite(valeur) || valeur <= 0) return "";
  return valeur.toLocaleString("fr-FR", {
    maximumFractionDigits: valeur < 0.01 ? 12 : 6,
    useGrouping: groupee,
  });
}

/** « Camille Durand » donne CD ; une société, la première lettre de son nom. */
function initiales(nom: string): string {
  return (
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((mot) => mot[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Capital({ brouillon, surChangement, surAssocies, anomalies }: Props) {
  const associes = brouillon.associes ?? [];
  const capital = brouillon.capital ?? 0;
  const partsTotales = brouillon.partsTotales ?? 0;
  const nominale = valeurNominale(brouillon);

  const forme = regle(brouillon.forme);
  const mot = motAssocie();
  const minimumLiberation = Math.round((forme?.liberationMinimale ?? 0) * 100);

  /*
   * Ce qui est tapé dans « valeur d'une action », tant qu'on y touche.
   *
   * Le champ affiche d'ordinaire la valeur calculée - le capital divisé par le nombre
   * de titres. Pendant la frappe, c'est la saisie qui prime : sans quoi « 3 » sur un
   * capital de 2 000 € se verrait aussitôt remplacé par 2,998, l'arrondi de la
   * division. La saisie s'efface dès qu'un autre champ bouge.
   */
  const [nominaleSaisie, setNominaleSaisie] = useState<string | null>(null);

  /* Un seul associé : il détient la totalité, et son nombre suit le total émis. */
  const seul = associes.length === 1;

  const detail = associes.map((a) => apportsDe(a, nominale));
  const partsReparties = detail.reduce((somme, d) => somme + d.parts, 0);
  const totalVerse = detail.reduce((somme, d) => somme + d.verse, 0);
  const totalReste = detail.reduce((somme, d) => somme + d.reste, 0);

  /**
   * Le dégradé conique du camembert.
   *
   * Un segment par associé dans l'ordre de la liste, puis le reste non réparti en
   * gris. Au-delà de 100 %, le disque passe entièrement au rouge : ce n'est plus
   * une répartition, c'est une erreur.
   */
  const pourcentageGlobal =
    partsTotales > 0 ? Math.round((partsReparties / partsTotales) * 100) : 0;
  const repartition = repartitionDesTitres(brouillon.forme, partsReparties, partsTotales);

  const segments: string[] = [];
  let degre = 0;
  detail.forEach((a, i) => {
    if (a.parts <= 0) return;
    const angle = partsTotales > 0 ? (a.parts / partsTotales) * 360 : 0;
    segments.push(
      COULEURS[i % COULEURS.length] +
        " " +
        degre.toFixed(2) +
        "deg " +
        (degre + angle).toFixed(2) +
        "deg"
    );
    degre += angle;
  });
  if (degre < 360 && partsReparties < partsTotales) {
    segments.push("#e0e0e0 " + degre.toFixed(2) + "deg 360deg");
  }

  const gradient =
    partsReparties > partsTotales
      ? "conic-gradient(#ef4444 0deg 360deg)"
      : segments.length > 0
        ? "conic-gradient(" + segments.join(", ") + ")"
        : "conic-gradient(#e0e0e0 0deg 360deg)";

  const teinteDuCentre =
    pourcentageGlobal === 100 ? "#22c55e" : pourcentageGlobal > 100 ? "#ef4444" : "#111";

  function modifierAssocie(index: number, valeurs: Partial<Associe>) {
    surAssocies(associes.map((a, i) => (i === index ? { ...a, ...valeurs } : a)));
  }

  function modifierNature(index: number, valeurs: { description?: string; montant?: number }) {
    surAssocies(
      associes.map((a, i) =>
        i === index ? { ...a, apportEnNature: { ...a.apportEnNature, ...valeurs } } : a
      )
    );
  }

  /**
   * La libération se saisit en pourcentage, comme dans l'original, et se range en
   * euros : c'est le montant qui figure sur l'attestation de dépôt, et un
   * pourcentage arrondi donnerait un capital faux.
   */
  function modifierLiberation(index: number, pourcentage: number, numeraire: number) {
    const borne = Math.min(Math.max(pourcentage, 0), 100);
    modifierAssocie(index, { versement: Math.round(numeraire * borne) / 100 });
  }

  /**
   * Le nombre de titres, et l'associé unique avec.
   *
   * Il fallait écrire deux fois le même nombre : le total en tête, puis la totalité
   * dans la carte de l'associé - alors qu'à un seul associé, il détient tout par
   * construction. Sa carte le rappelle et n'attend plus de saisie.
   */
  function modifierLeTotal(nombre: number | undefined) {
    setNominaleSaisie(null);
    surChangement({ partsTotales: nombre });
    if (associes.length === 1) {
      surAssocies([{ ...associes[0], parts: nombre }]);
    }
  }

  /**
   * La valeur d'un titre commande leur nombre.
   *
   * On sait ce qu'on veut mettre au capital et à combien on veut l'action ; le nombre
   * s'en déduit. Il fallait faire la division soi-même, et se tromper d'un facteur dix
   * ne se voyait nulle part.
   *
   * Des trois nombres, deux ne se négocient pas : le capital est celui qu'on a décidé
   * de mettre, et un titre ne se découpe pas - on n'émet pas six cent soixante-six
   * actions et demie. C'est donc la valeur nominale qui absorbe le reste : deux mille
   * euros en six cent soixante-sept actions font 2,9985 € l'une, et c'est ce chiffre-là
   * que portent les statuts. La saisie sert à trouver le nombre ; la phrase en dessous
   * dit la valeur exacte qui en résulte.
   */
  function modifierLaNominale(saisie: string) {
    setNominaleSaisie(saisie);

    const valeur = Number(saisie.replace(",", "."));
    if (!Number.isFinite(valeur) || valeur <= 0 || capital <= 0) return;

    // On compare en centimes : 0,1 + 0,2 ne fait pas 0,3 en virgule flottante.
    const centimes = Math.round(valeur * 100);
    const capitalCentimes = Math.round(capital * 100);
    if (centimes === 0) return;

    // Une action qui vaut plus que tout le capital ne donne aucun nombre entier.
    const nombre = Math.round(capitalCentimes / centimes);
    if (nombre < 1) return;

    surChangement({ partsTotales: nombre });
    if (associes.length === 1) {
      surAssocies([{ ...associes[0], parts: nombre }]);
    }
  }

  /* Une valeur sous le centime ne s'écrit dans aucun acte : on le dit avant l'avocat. */
  const sousLeCentime = nominale > 0 && nominale < 0.01;

  /* Une action ne peut pas valoir plus que le capital entier. */
  const nominaleDemandee = Number((nominaleSaisie ?? "").replace(",", "."));
  const nominaleTropGrande =
    Number.isFinite(nominaleDemandee) &&
    nominaleDemandee > 0 &&
    capital > 0 &&
    nominaleDemandee > capital;

  return (
    <div className={styles.full}>
      {/*
        Les deux nombres qui commandent l'étape, en tête.

        Ils venaient en troisième, après une barre de progression et un camembert qui
        ne peuvent rien afficher tant qu'ils sont vides : on arrivait sur deux
        graphiques à zéro pour cent sans savoir par où commencer.
      */}
      <div className={styles.emission}>
        <div className={styles.emissionGrille}>
          <Champ id="capital" libelle="Capital social" requis anomalie={anomalies.capital}>
            <span className={styles.suffix}>
              <input
                id="capital"
                inputMode="decimal"
                value={brouillon.capital ?? ""}
                onChange={(e) => {
                  setNominaleSaisie(null);
                  surChangement({ capital: Number(e.target.value) || 0 });
                }}
              />
              <span>€</span>
            </span>
          </Champ>

          {/* On saisit l'un ou l'autre : chacun donne le second. */}
          <Champ id="nominale" libelle={"Valeur d'une " + motPart(brouillon.forme)}>
            <span className={styles.suffix}>
              <input
                id="nominale"
                inputMode="decimal"
                value={nominaleSaisie ?? nominaleLisible(nominale, false)}
                onChange={(e) => modifierLaNominale(e.target.value)}
              />
              <span>€</span>
            </span>
          </Champ>

          <Champ
            id="partsTotales"
            libelle={"Nombre total " + elider(motPart(brouillon.forme, true))}
            requis
            anomalie={anomalies.partsTotales}
          >
            <input
              id="partsTotales"
              inputMode="numeric"
              value={brouillon.partsTotales ?? ""}
              onChange={(e) => modifierLeTotal(Number(e.target.value) || undefined)}
            />
          </Champ>
        </div>

        <p className={styles.emissionNote}>
          {nominaleTropGrande
            ? "Une " + motPart(brouillon.forme) + " ne peut pas valoir plus que le capital entier."
            : sousLeCentime
              ? partsTotales.toLocaleString("fr-FR") +
                " " +
                motPart(brouillon.forme, true) +
                " pour " +
                euros(capital) +
                " font moins d'un centime l'une : réduisez leur nombre, ou augmentez le capital."
              : nominale > 0
                ? partsTotales.toLocaleString("fr-FR") +
                  " " +
                  motPart(brouillon.forme, partsTotales > 1) +
                  " à " +
                  nominaleLisible(nominale) +
                  " € l'une."
                : "Renseignez le capital, puis la valeur " +
                  elider("une " + motPart(brouillon.forme)) +
                  " ou leur nombre : l'un donne l'autre."}
        </p>
      </div>

      {/*
        Où en est la répartition, là où l'on répartit.

        La barre de progression disait le même nombre que le camembert, l'un sous
        l'autre, et tous deux avant les champs qu'ils mesurent.
      */}
      <p
        className={`${styles.attribue} ${styles["attribue-" + repartition.etat] ?? ""}`}
        id={seul ? "parts-toutes" : undefined}
      >
        {seul && partsTotales > 0
          ? "Votre " +
            mot.toLowerCase() +
            " unique détient les " +
            partsTotales.toLocaleString("fr-FR") +
            " " +
            motPart(brouillon.forme, partsTotales > 1) +
            "."
          : repartition.phrase}
      </p>

      {/* ---------- Une carte par associé ---------- */}
      <div className={styles.cartes}>
        {associes.map((associe, i) => {
          const nom =
            nomDeLaPartie(associe) || nomComplet(associe.personne ?? {}) || mot + " " + (i + 1);
          const a = detail[i];
          const pourcentage =
            partsTotales > 0 ? Math.round((a.parts / partsTotales) * 1000) / 10 : 0;
          const enNature = associe.apportEnNature?.montant ?? 0;

          return (
            <div key={i} className={styles.carte}>
              <div className={styles.carteHaut}>
                <span className={styles.carteAvatar} aria-hidden="true">
                  {initiales(nom)}
                </span>

                <div className={styles.carteInfo}>
                  <div className={styles.carteNom}>{nom}</div>
                  <div className={styles.carteDetail}>
                    {euros(a.souscrit)} · {pourcentage}%
                  </div>
                  <div className={styles.cartePiste}>
                    <div
                      className={styles.carteRemplissage}
                      style={{ width: Math.min(pourcentage, 100) + "%" }}
                    />
                  </div>
                </div>

                {/*
                  Un associé seul détient tout : il n'y a rien à répartir.

                  Il fallait écrire deux fois le même nombre - le total en tête, puis
                  la totalité ici - et l'on cherchait longtemps pourquoi la répartition
                  restait incomplète. Le champ suit le total, et la phrase le dit.
                */}
                <div className={styles.carteSaisie}>
                  <label htmlFor={"parts-" + i} className={styles.carteSaisieLibelle}>
                    {motPart(brouillon.forme, true)}
                  </label>
                  <input
                    id={"parts-" + i}
                    inputMode="numeric"
                    value={associe.parts ?? ""}
                    readOnly={seul}
                    aria-describedby={seul ? "parts-toutes" : undefined}
                    className={seul ? styles.carteSaisieFigee : undefined}
                    onChange={(e) =>
                      modifierAssocie(i, { parts: Number(e.target.value) || undefined })
                    }
                  />
                </div>
              </div>

              <div className={styles.carteBas}>
                <div className={styles.apportLigne}>
                  <div className={styles.apportChamp}>
                    <label htmlFor={"liberation-" + i}>Libération numéraire (%)</label>
                    <input
                      id={"liberation-" + i}
                      inputMode="numeric"
                      value={a.pourcentageLibere}
                      onChange={(e) =>
                        modifierLiberation(i, Number(e.target.value) || 0, a.numeraire)
                      }
                    />
                    <p className={styles.apportAide}>
                      Min {minimumLiberation}% ({brouillon.forme ?? "forme non choisie"})
                    </p>
                  </div>

                  <div className={styles.apportChamp}>
                    <label htmlFor={"nature-" + i}>Montant apport en nature (€)</label>
                    <input
                      id={"nature-" + i}
                      inputMode="decimal"
                      value={enNature || ""}
                      onChange={(e) =>
                        modifierNature(i, { montant: Number(e.target.value) || undefined })
                      }
                    />
                  </div>
                </div>

                {/* La description n'apparaît qu'avec un montant : un apport en
                    nature non décrit ne peut pas figurer dans les statuts. */}
                {enNature > 0 && (
                  <div className={styles.apportLigne}>
                    <div className={styles.apportChamp}>
                      <label htmlFor={"natureDesc-" + i}>
                        Description de l&apos;apport en nature
                      </label>
                      <textarea
                        id={"natureDesc-" + i}
                        placeholder="Ex : Matériel informatique, fonds de commerce..."
                        value={associe.apportEnNature?.description ?? ""}
                        onChange={(e) => modifierNature(i, { description: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className={styles.apportResume}>
                  <span className={styles.apportResumeItem}>
                    <span className={styles.apportResumeLibelle}>Souscription</span>
                    <span className={styles.apportResumeValeur}>{euros(a.souscrit)}</span>
                  </span>
                  <span className={styles.apportResumeItem}>
                    <span className={styles.apportResumeLibelle}>Versé</span>
                    <span className={styles.apportResumeValeur}>{euros(a.verse)}</span>
                  </span>
                  <span className={styles.apportResumeItem}>
                    <span className={styles.apportResumeLibelle}>Reste à libérer</span>
                    <span className={styles.apportResumeValeur}>{euros(a.reste)}</span>
                  </span>
                </div>

                {anomalies["associes." + i + ".versement"] && (
                  <p role="alert">{anomalies["associes." + i + ".versement"]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {associes.length === 0 && (
        <p role="alert">
          Ajoutez d&apos;abord un {mot.toLowerCase()} à l&apos;étape « {mot}s ».
        </p>
      )}

      {/* ---------- Le camembert de la répartition ---------- */}
      <div className={styles.chartSection}>
        <div className={styles.donutWrap}>
          <div className={styles.donut} style={{ background: gradient }} />
          <div className={styles.donutCenter}>
            <span className={styles.donutPct} style={{ color: teinteDuCentre }}>
              {pourcentageGlobal}%
            </span>
            <span className={styles.donutLabel}>réparti</span>
          </div>
        </div>

        <div className={styles.donutLegend}>
          {associes.map((associe, i) => {
            const nom =
              nomDeLaPartie(associe) || nomComplet(associe.personne ?? {}) || mot + " " + (i + 1);
            const a = detail[i];
            const pct = partsTotales > 0 ? (a.parts / partsTotales) * 100 : 0;
            const montant = partsTotales > 0 ? (a.parts / partsTotales) * capital : 0;

            return (
              <div key={i} className={styles.donutItem}>
                <span
                  className={styles.donutDot}
                  style={{ background: COULEURS[i % COULEURS.length] }}
                  aria-hidden="true"
                />
                <span className={styles.donutInfo}>
                  <span className={styles.donutNom}>{nom}</span>
                  <span className={styles.donutDetail}>
                    {a.parts} {motPart(brouillon.forme, a.parts > 1)} · {euros(montant)}
                  </span>
                </span>
                <span className={styles.donutItemPct}>{pourcent(pct)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- Le récapitulatif ---------- */}
      <dl className={styles.recap}>
        <div className={styles.recapItem}>
          <dt>Capital total</dt>
          <dd>{euros(capital)}</dd>
        </div>
        <div className={styles.recapItem}>
          <dt>Nombre de parts</dt>
          <dd>{partsTotales || "-"}</dd>
        </div>
        <div className={styles.recapItem}>
          <dt>Valeur nominale</dt>
          <dd>{nominale > 0 ? euros(nominale) : "-"}</dd>
        </div>
        <div className={styles.recapItem}>
          <dt>Associés</dt>
          <dd>{associes.length}</dd>
        </div>
        <div className={styles.recapItem}>
          <dt>Total versé à la création</dt>
          <dd>{euros(totalVerse)}</dd>
        </div>
        <div className={styles.recapItem}>
          <dt>Reste à libérer</dt>
          <dd>{euros(totalReste)}</dd>
        </div>
      </dl>

      {/* Le capital en lettres est ce qui sera écrit dans les statuts : le montrer
          ici permet de le relire avant qu'il y figure. */}
      {capital > 0 && (
        <p className={styles.recapLettres}>
          Dans les statuts : « au capital de {nombreEnFrancais(capital)} euros ({euros(capital)}) ».
        </p>
      )}

      {anomalies.repartition && (
        <p role="alert" className={styles.erreurCapital}>
          {anomalies.repartition}
        </p>
      )}
      {anomalies.libere && <p role="alert">{anomalies.libere}</p>}
    </div>
  );
}
