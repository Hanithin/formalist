/**
 * Les trois formules de création.
 *
 * Reprises telles quelles de public/creation.html : noms, montants, frais annexes
 * et contenu détaillé. Ce sont des engagements commerciaux - ils ne se réécrivent
 * pas au passage à Next, et toute modification se décide ailleurs qu'ici.
 *
 * Les montants sont hors taxes, comme ils étaient affichés, et les frais annexes
 * sont annoncés à côté du prix plutôt que noyés dans le détail : l'annonce légale
 * et le greffe s'ajoutent à la facture, les cacher serait trompeur.
 */

export type CodeOffre = "starter" | "business" | "premium";

export interface Offre {
  code: CodeOffre;
  nom: string;
  /** En euros hors taxes. */
  prix: number;
  /** Les frais qui s'ajoutent, ligne par ligne. */
  fraisAnnexes: string[];
  description: string;
  /** L'en-tête de la liste : « Tout ce qui est inclus dans… ». */
  inclut: string;
  contenu: string[];
  /** La formule mise en avant, avec sa pastille. */
  recommandee?: boolean;
}

export const OFFRES: Offre[] = [
  {
    code: "starter",
    nom: "Starter",
    prix: 89,
    fraisAnnexes: ["+ 180€ HT de frais d'annonce légale", "Dépôt au greffe à votre charge"],
    description: "Démarrez votre entreprise en quelques clics.",
    inclut: "Inclus",
    contenu: [
      "Création 100% en ligne",
      "Statuts générés instantanément",
      "Objet social assisté par l'IA",
      "Annonce légale générée et disponible en moins de 15 minutes",
      "Accès à votre espace sécurisé",
      "Dépôt de votre formalité vous-même",
    ],
  },
  {
    code: "business",
    nom: "Business",
    prix: 345,
    fraisAnnexes: ["+ 180€ HT de frais d'annonce légale", "+ 55€ de frais de greffe"],
    description: "Créez votre société en toute sécurité, validée par un avocat.",
    inclut: "Tout ce qui est inclus dans le forfait Starter",
    contenu: [
      "Relecture et validation par un avocat",
      "Garantie anti-rejet de la formalité",
      "Suivi du dossier en temps réel",
      "Immatriculation sur le Guichet Unique",
      "Kbis disponible en ligne",
    ],
    recommandee: true,
  },
  {
    code: "premium",
    nom: "Premium",
    prix: 545,
    fraisAnnexes: ["+ 180€ HT de frais d'annonce légale", "+ 55€ de frais de greffe"],
    description: "Votre formalité traitée en urgence par un avocat !",
    inclut: "Tout ce qui est inclus dans le forfait Business",
    contenu: [
      "Traitement prioritaire sous 24h",
      "Rendez-vous téléphonique ou visio inclus",
      "Accompagnement par un avocat",
      "Conseils juridiques et fiscaux",
      "Mise en relation avec nos partenaires (comptabilité)",
    ],
  },
];

export function offre(code: string | null | undefined): Offre | null {
  return OFFRES.find((o) => o.code === code) ?? null;
}

/** Le nom d'une formule, pour un récapitulatif ou un titre de dossier. */
export function nomDeLOffre(code: string | null | undefined): string {
  return offre(code)?.nom ?? "Offre non choisie";
}
