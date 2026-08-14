"use client";

import {
  CIVILITES,
  REGIMES_MATRIMONIAUX,
  SITUATIONS_MATRIMONIALES,
  conjointRequis,
  type Conjoint,
  type PersonnePhysique,
} from "@/domain/formalite/etat-civil";
import { Adresse } from "./Adresse";
import { Choix } from "./Choix";
import { DateChoisie } from "./DateChoisie";
import styles from "./Parcours.module.css";

/**
 * L'état civil d'une personne physique, et le champ qui l'encadre.
 *
 * Les mêmes quinze champs servent aux associés et aux dirigeants : le formulaire
 * d'origine les recopiait dans deux gabarits JavaScript distincts (associes.js et
 * dirigeants.js), qui avaient fini par diverger - le conjoint n'y avait pas les
 * mêmes libellés selon l'écran.
 *
 * Le régime matrimonial passe par le select « Contrat de mariage » de l'original :
 * « Non » vaut le régime légal, la communauté réduite aux acquêts, et non une
 * absence de régime - c'est ce qui s'écrit dans les statuts.
 */

/** Le libellé du select de contrat, tel qu'il était, et ce qu'il enregistre. */
const CONTRATS = [
  { libelle: "Non", contrat: false, regime: "Communauté réduite aux acquêts" as const },
  { libelle: "Oui - Séparation de biens", contrat: true, regime: "Séparation de biens" as const },
  {
    libelle: "Oui - Communauté universelle",
    contrat: true,
    regime: "Communauté universelle" as const,
  },
  {
    libelle: "Oui - Participation aux acquêts",
    contrat: true,
    regime: "Participation aux acquêts" as const,
  },
];

/** Un champ : son libellé, sa saisie, et son refus juste dessous. */
export function Champ({
  id,
  libelle,
  requis = false,
  pleineLargeur = false,
  anomalie,
  children,
}: {
  id: string;
  libelle: string;
  requis?: boolean;
  pleineLargeur?: boolean;
  anomalie?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={pleineLargeur ? `${styles.field} ${styles.full}` : styles.field}>
      <label htmlFor={id} className={requis ? styles.requis : undefined}>
        {libelle}
      </label>
      {children}
      {anomalie && <p role="alert">{anomalie}</p>}
    </div>
  );
}


/* ---------- L'associé personne physique ---------- */

export function EtatCivil({
  rang,
  personne,
  surChangement,
  surConjoint,
  anomalies,
  prefixe = "associes",
}: {
  rang: number;
  personne: PersonnePhysique;
  surChangement: (valeurs: Partial<PersonnePhysique>) => void;
  surConjoint: (valeurs: Partial<Conjoint>) => void;
  anomalies: Record<string, string>;
  /** La racine des clés d'anomalies : « associes » ou « dirigeants.2 ». */
  prefixe?: string;
}) {
  // « associes » porte le rang, « dirigeants.2 » le porte déjà : la clé se
  // construit donc à partir du préfixe tel qu'il est donné.
  const cle = prefixe === "associes" ? "associes." + rang : prefixe;
  const conjoint = personne.conjoint ?? {};
  const situation = personne.situationMatrimoniale;
  const pacs = situation === "Pacsé(e)";
  // Le contrat de mariage ne concerne pas un PACS : la ligne disparaît, comme
  // dans le formulaire d'origine.
  const contratCourant = CONTRATS.find(
    (c) => c.contrat === (conjoint.contratDeMariage ?? false) && c.regime === conjoint.regimeMatrimonial
  );

  return (
    <>
      <Champ id={"civilite-" + rang} libelle="Civilité">
        <Choix
          id={"civilite-" + rang}
          valeur={personne.civilite ?? ""}
          options={CIVILITES.map((c) => ({ valeur: c, libelle: c }))}
          surChangement={(v) =>
            surChangement({ civilite: (v || undefined) as PersonnePhysique["civilite"] })
          }
        />
      </Champ>

      <Champ
        id={"prenom-" + rang}
        libelle="Prénom"
        requis
        anomalie={anomalies[cle]}
      >
        <input
          id={"prenom-" + rang}
          value={personne.prenom ?? ""}
          onChange={(e) => surChangement({ prenom: e.target.value })}
        />
      </Champ>

      <Champ id={"nom-" + rang} libelle="Nom" requis>
        <input
          id={"nom-" + rang}
          value={personne.nom ?? ""}
          onChange={(e) => surChangement({ nom: e.target.value })}
        />
      </Champ>

      <Champ id={"email-" + rang} libelle="Email">
        <input
          id={"email-" + rang}
          type="email"
          placeholder="email@exemple.com"
          value={personne.email ?? ""}
          onChange={(e) => surChangement({ email: e.target.value })}
        />
      </Champ>

      <Champ id={"adresse-" + rang} libelle="Adresse" pleineLargeur>
        <Adresse
          id={"adresse-" + rang}
          valeur={personne.adresse ?? ""}
          surChangement={(v) => surChangement({ adresse: v })}
          surCompletion={(codePostal, ville) => surChangement({ codePostal, ville })}
          placeholder="Adresse de l'associé"
        />
      </Champ>

      <Champ
        id={"naissance-" + rang}
        libelle="Date de naissance"
        requis
        anomalie={anomalies[cle + ".dateDeNaissance"]}
      >
        <DateChoisie
          id={"naissance-" + rang}
          valeur={personne.dateDeNaissance ?? ""}
          surChangement={(iso) => surChangement({ dateDeNaissance: iso })}
        />
      </Champ>

      <Champ id={"villeNaissance-" + rang} libelle="Ville de naissance">
        <input
          id={"villeNaissance-" + rang}
          value={personne.villeDeNaissance ?? ""}
          onChange={(e) => surChangement({ villeDeNaissance: e.target.value })}
        />
      </Champ>

      <Champ id={"cpNaissance-" + rang} libelle="Code postal de naissance">
        <input
          id={"cpNaissance-" + rang}
          inputMode="numeric"
          maxLength={5}
          value={personne.codePostalDeNaissance ?? ""}
          onChange={(e) =>
            surChangement({ codePostalDeNaissance: e.target.value.replace(/\D/g, "") })
          }
        />
      </Champ>

      <Champ id={"paysNaissance-" + rang} libelle="Pays de naissance">
        <input
          id={"paysNaissance-" + rang}
          placeholder="France"
          value={personne.paysDeNaissance ?? ""}
          onChange={(e) => surChangement({ paysDeNaissance: e.target.value })}
        />
      </Champ>

      {/* Les noms des parents figurent dans les actes d'état civil demandés par
          le greffe, et servent à déduire le nom de jeune fille. */}
      <Champ id={"pere-" + rang} libelle="Nom et prénom du père">
        <input
          id={"pere-" + rang}
          value={personne.nomDuPere ?? ""}
          onChange={(e) => surChangement({ nomDuPere: e.target.value })}
        />
      </Champ>

      <Champ id={"mere-" + rang} libelle="Nom et prénom de la mère">
        <input
          id={"mere-" + rang}
          value={personne.nomDeLaMere ?? ""}
          onChange={(e) => surChangement({ nomDeLaMere: e.target.value })}
        />
      </Champ>

      <Champ id={"nationalite-" + rang} libelle="Nationalité">
        <input
          id={"nationalite-" + rang}
          placeholder="Française"
          value={personne.nationalite ?? ""}
          onChange={(e) => surChangement({ nationalite: e.target.value })}
        />
      </Champ>

      <Champ id={"situation-" + rang} libelle="Situation matrimoniale">
        <Choix
          id={"situation-" + rang}
          valeur={situation ?? ""}
          options={SITUATIONS_MATRIMONIALES.map((s) => ({ valeur: s, libelle: s }))}
          surChangement={(v) =>
            surChangement({
              situationMatrimoniale: (v || undefined) as PersonnePhysique["situationMatrimoniale"],
            })
          }
        />
      </Champ>

      {/* Le conjoint n'apparaît que pour un mariage ou un PACS, et les libellés
          suivent : « date de PACS » et non « date de mariage ». */}
      {conjointRequis(situation) && (
        <div className={`${styles.full} ${styles.conjoint}`}>
          <h3 className={styles.conjointTitre}>Informations du conjoint</h3>

          <div className={styles.formGrid}>
            <Champ id={"conjointCivilite-" + rang} libelle="Civilité du conjoint">
              <Choix
                id={"conjointCivilite-" + rang}
                valeur={conjoint.civilite ?? ""}
                options={CIVILITES.map((c) => ({ valeur: c, libelle: c }))}
                surChangement={(v) =>
                  surConjoint({ civilite: (v || undefined) as Conjoint["civilite"] })
                }
              />
            </Champ>

            <Champ
              id={"conjointNom-" + rang}
              libelle="Nom du conjoint"
              requis
              anomalie={anomalies[cle + ".conjoint"]}
            >
              <input
                id={"conjointNom-" + rang}
                value={conjoint.nom ?? ""}
                onChange={(e) => surConjoint({ nom: e.target.value })}
              />
            </Champ>

            <Champ id={"conjointPrenom-" + rang} libelle="Prénom du conjoint">
              <input
                id={"conjointPrenom-" + rang}
                value={conjoint.prenom ?? ""}
                onChange={(e) => surConjoint({ prenom: e.target.value })}
              />
            </Champ>

            <Champ id={"conjointNaissance-" + rang} libelle="Nom de naissance du conjoint">
              <input
                id={"conjointNaissance-" + rang}
                value={conjoint.nomDeNaissance ?? ""}
                onChange={(e) => surConjoint({ nomDeNaissance: e.target.value })}
              />
            </Champ>

            <Champ
              id={"dateUnion-" + rang}
              libelle={pacs ? "Date de PACS" : "Date de mariage"}
            >
              <DateChoisie
                id={"dateUnion-" + rang}
                valeur={conjoint.dateMariage ?? ""}
                surChangement={(iso) => surConjoint({ dateMariage: iso })}
              />
            </Champ>

            <Champ
              id={"villeUnion-" + rang}
              libelle={pacs ? "Ville de PACS" : "Ville de mariage"}
            >
              <input
                id={"villeUnion-" + rang}
                value={conjoint.villeMariage ?? ""}
                onChange={(e) => surConjoint({ villeMariage: e.target.value })}
              />
            </Champ>

            {!pacs && (
              <Champ id={"contrat-" + rang} libelle="Contrat de mariage">
                <Choix
                  id={"contrat-" + rang}
                  valeur={contratCourant?.libelle ?? ""}
                  options={CONTRATS.map((c) => ({ valeur: c.libelle, libelle: c.libelle }))}
                  surChangement={(v) => {
                    const choix = CONTRATS.find((c) => c.libelle === v);
                    surConjoint({
                      contratDeMariage: choix?.contrat ?? false,
                      // Sans contrat, le régime légal s'applique : il est écrit,
                      // parce que les statuts le mentionnent.
                      regimeMatrimonial: choix?.regime,
                    });
                  }}
                />
              </Champ>
            )}

            {/* Pour un PACS, le régime se choisit directement : il n'y a pas de
                contrat de mariage à déclarer. */}
            {pacs && (
              <Champ id={"regime-" + rang} libelle="Régime">
                <Choix
                  id={"regime-" + rang}
                  valeur={conjoint.regimeMatrimonial ?? ""}
                  options={REGIMES_MATRIMONIAUX.map((r) => ({ valeur: r, libelle: r }))}
                  surChangement={(v) =>
                    surConjoint({
                      regimeMatrimonial: (v || undefined) as Conjoint["regimeMatrimonial"],
                    })
                  }
                />
              </Champ>
            )}
          </div>
        </div>
      )}
    </>
  );
}

