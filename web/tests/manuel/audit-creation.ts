import { mkdirSync, writeFileSync } from "node:fs";
import { documentsAProduire } from "@/domain/formalite/documents";
import { donneesDeGabarit } from "@/domain/formalite/gabarit";
import { genererDocument } from "@/infrastructure/documents/generation";
import { typographierLeDocument } from "@/infrastructure/documents/typographie-docx";
import type { Brouillon, Associe } from "@/domain/formalite/parcours";
import type { PersonnePhysique, PersonneMorale } from "@/domain/formalite/etat-civil";

const SORTIE = "/private/tmp/claude-501/-Users-hanithing/bb5ca284-0c32-454c-9699-893dbdf734e0/scratchpad/audit/";

const CLAIRE: PersonnePhysique = {
  civilite: "Madame",
  prenom: "Claire",
  nom: "DUFOUR",
  nomDeNaissance: "MERCIER",
  email: "claire@exemple.fr",
  dateDeNaissance: "1984-03-07",
  villeDeNaissance: "Lyon 3e",
  codePostalDeNaissance: "69003",
  paysDeNaissance: "France",
  nomDuPere: "MERCIER",
  nomDeLaMere: "BONNET",
  nationalite: "française",
  adresse: "12 rue des Capucins",
  codePostal: "69001",
  ville: "Lyon",
  situationMatrimoniale: "Marié(e)",
  conjoint: {
    civilite: "Monsieur",
    prenom: "Paul",
    nom: "DUFOUR",
    regimeMatrimonial: "Communauté réduite aux acquêts",
    dateMariage: "2012-06-16",
    villeMariage: "Lyon",
    contratDeMariage: false,
  },
};

const LUCAS: PersonnePhysique = {
  civilite: "Monsieur",
  prenom: "Lucas",
  nom: "LARÉGINIE",
  email: "lucas@exemple.fr",
  dateDeNaissance: "1990-11-23",
  villeDeNaissance: "Tournon-sur-Rhône",
  codePostalDeNaissance: "07300",
  paysDeNaissance: "France",
  nomDuPere: "LARÉGINIE",
  nomDeLaMere: "ROUX",
  nationalite: "française",
  adresse: "5 avenue Jean Jaurès",
  codePostal: "69007",
  ville: "Lyon",
  situationMatrimoniale: "Célibataire",
};

const HOLDING: PersonneMorale = {
  denomination: "KERGUELEN INVEST",
  forme: "SAS",
  capital: 50000,
  adresse: "12 rue de la Paix",
  codePostal: "75002",
  ville: "Paris",
  numeroRcs: "812 345 678",
  villeImmatriculation: "Paris",
  siret: "812345678",
  representant: { civilite: "Madame", prenom: "Claire", nom: "DUFOUR" },
};

function brouillon(sur: Partial<Brouillon>): Brouillon {
  const base: Brouillon = {
    forme: "SAS",
    denomination: "ATELIER MERIDIEN",
    adresse: "12 rue des Capucins",
    codePostal: "69001",
    ville: "Lyon",
    modeDomiciliation: "Domicile personnel du dirigeant",
    occupationDomicile: "locataire",
    capital: 10000,
    capitalLibere: 10000,
    partsTotales: 1000,
    banque: "Qonto",
    dateDebutActivite: "2026-10-01",
    dateCloturePremierExercice: "2027-12-31",
    dureeDeVie: 99,
    optionFiscale: "IS",
    activite:
      "La conception, la fabrication et la vente de mobilier contemporain, en France et à l'étranger ; la prestation de services de décoration d'intérieur.",
    associes: [
      { type: "physique", personne: CLAIRE, apport: 6000, versement: 6000, parts: 600 },
      { type: "physique", personne: LUCAS, apport: 4000, versement: 4000, parts: 400 },
    ],
    dirigeants: [
      { associe: 0, remuneration: "Déterminée ultérieurement", regimeSocial: "Assimilé salarié" },
    ],
    paraphes: "CD / LL",
  };
  return { ...base, ...sur };
}

const SEULE: Associe[] = [
  { type: "physique", personne: CLAIRE, apport: 10000, versement: 10000, parts: 1000 },
];

const CAS: [string, Brouillon][] = [
  ["sas-deux-associes", brouillon({})],
  [
    "sasu-femme-seule",
    brouillon({
      forme: "SASU",
      denomination: "STUDIO VERLAINE",
      associes: SEULE,
      dirigeants: [
        { associe: 0, remuneration: "Déterminée ultérieurement", regimeSocial: "Assimilé salarié" },
      ],
    }),
  ],
  [
    "sarl-couple",
    brouillon({
      forme: "SARL",
      denomination: "MERIDIEN BOIS",
      dirigeants: [{ associe: 1, remuneration: "Fixe", regimeSocial: "Travailleur non salarié" }],
    }),
  ],
  [
    "sas-avec-personne-morale",
    brouillon({
      associes: [
        { type: "morale", societe: HOLDING, apport: 7000, versement: 7000, parts: 700 },
        { type: "physique", personne: LUCAS, apport: 3000, versement: 3000, parts: 300 },
      ],
      dirigeants: [
        { personne: LUCAS, remuneration: "Déterminée ultérieurement", regimeSocial: "Assimilé salarié" },
      ],
    }),
  ],
  [
    "sci-deux-associes",
    brouillon({
      forme: "SCI",
      denomination: "LES CAPUCINS",
      activite:
        "L'acquisition, l'administration et la location de tous biens immobiliers, bâtis ou non bâtis.",
      dirigeants: [{ associe: 0, remuneration: "Déterminée ultérieurement", regimeSocial: "Travailleur non salarié" }],
    }),
  ],
];

for (const [nom, b] of CAS) {
  const dossier = SORTIE + nom;
  mkdirSync(dossier, { recursive: true });

  const documents = documentsAProduire({
    forme: b.forme ?? "SAS",
    modeDomiciliation: b.modeDomiciliation,
    conjointMarie: (b.associes ?? []).some(
      (a) => a.personne?.situationMatrimoniale === "Marié(e)"
    ),
    aUnDirigeant: (b.dirigeants ?? []).length > 0,
  });

  const donnees = donneesDeGabarit(b, { maintenant: new Date("2026-09-12T10:00:00Z") });

  for (const d of documents) {
    try {
      writeFileSync(
        dossier + "/" + d.gabarit,
        typographierLeDocument(genererDocument(d.gabarit, donnees))
      );
    } catch (e) {
      console.log("ÉCHEC", nom, d.gabarit, (e as Error).message.slice(0, 200));
    }
  }
  console.log(nom, ":", documents.map((d) => d.gabarit).join(", "));
}
