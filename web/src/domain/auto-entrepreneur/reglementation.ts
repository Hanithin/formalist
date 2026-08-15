/**
 * Savoir si son activité est réglementée.
 *
 * Une case « mon activité est réglementée » demande à quelqu'un de trancher une
 * question de droit qu'il ne connaît pas. Cochée à tort, elle réclame un diplôme
 * inutile ; oubliée, elle fait refuser le dossier au guichet après des semaines.
 *
 * On ne lui demande donc plus de trancher : on lui montre la liste, et il reconnaît
 * son métier - ou ne le reconnaît pas. Trois réponses, pas deux : la troisième est
 * « je ne sais pas », et c'est la plus importante. Ce module ne prétend jamais qu'une
 * activité n'est pas réglementée : il dit ce qu'il sait, et nomme ce qu'il ignore.
 *
 * La liste est celle de l'article L121-1 du code de l'artisanat, dans sa rédaction en
 * vigueur depuis le 1er juillet 2023 (ordonnance n° 2023-208 du 28 mars 2023, décret
 * n° 2023-500 du 22 juin 2023 pour la partie réglementaire). La coiffure y figure au
 * titre de la loi n° 46-1173 du 23 mai 1946.
 *
 * Elle ne couvre que les activités artisanales soumises à qualification. Les
 * professions réglementées d'un autre ordre - santé, droit, transport, sécurité
 * privée, immobilier, débit de boissons - relèvent de textes propres et ne sont pas
 * ici : c'est précisément pourquoi « je ne sais pas » existe.
 */

export interface ActiviteReglementee {
  code: string;
  /** L'intitulé légal, repris tel quel. */
  intitule: string;
  /** Les métiers que l'intitulé recouvre, en mots courants. */
  exemples: string[];
}

export const ACTIVITES_REGLEMENTEES: ActiviteReglementee[] = [
  {
    code: "vehicules",
    intitule: "L'entretien et la réparation des véhicules terrestres à moteur et des machines agricoles",
    exemples: ["Garagiste", "Carrossier", "Mécanicien deux-roues", "Réparation d'engins agricoles"],
  },
  {
    code: "batiment",
    intitule: "La construction, l'entretien et la réparation des bâtiments",
    exemples: ["Maçon", "Charpentier", "Couvreur", "Menuisier", "Peintre en bâtiment", "Carreleur"],
  },
  {
    code: "fluides",
    intitule: "La mise en place, l'entretien et la réparation des réseaux et des équipements utilisant les fluides",
    exemples: ["Plombier", "Chauffagiste", "Électricien", "Climatisation", "Installation de gaz"],
  },
  {
    code: "ramonage",
    intitule: "Le ramonage",
    exemples: ["Ramoneur"],
  },
  {
    code: "esthetique",
    intitule: "Les soins esthétiques à la personne autres que médicaux et paramédicaux et les modelages esthétiques",
    exemples: ["Esthéticienne", "Onglerie", "Épilation", "Modelage esthétique"],
  },
  {
    code: "protheses",
    intitule: "La réalisation de prothèses dentaires",
    exemples: ["Prothésiste dentaire"],
  },
  {
    code: "alimentaire",
    intitule: "La préparation ou la fabrication de produits frais de boulangerie, pâtisserie, boucherie, charcuterie et poissonnerie",
    exemples: ["Boulanger", "Pâtissier", "Boucher", "Charcutier", "Poissonnier", "Glacier"],
  },
  {
    code: "marechal",
    intitule: "L'activité de maréchal-ferrant",
    exemples: ["Maréchal-ferrant"],
  },
  {
    code: "coiffure",
    intitule: "La coiffure",
    exemples: ["Coiffeur en salon", "Coiffeur à domicile"],
  },
];

export function activiteReglementee(code: string | null | undefined): ActiviteReglementee | null {
  return ACTIVITES_REGLEMENTEES.find((a) => a.code === code) ?? null;
}

/**
 * Ce que la personne a répondu.
 *
 * « incertain » n'est pas une absence de réponse : c'est une réponse, et elle engage
 * une vérification par l'avocat. Le distinguer de « pas encore répondu » évite de
 * laisser filer un dossier dont personne ne s'est occupé.
 */
export type ReponseReglementation = "oui" | "non" | "incertain";

export const REPONSES: { valeur: ReponseReglementation; libelle: string; explication: string }[] = [
  {
    valeur: "oui",
    libelle: "Oui, c'est l'une de ces activités",
    explication: "Un diplôme, un titre ou trois ans d'expérience vous seront demandés.",
  },
  {
    valeur: "non",
    libelle: "Non, aucune ne correspond",
    explication:
      "Aucune qualification artisanale n'est exigée. D'autres métiers relèvent de textes propres : dites-le nous si vous avez un doute.",
  },
  {
    valeur: "incertain",
    libelle: "Je ne sais pas",
    explication: "L'avocat vérifie avant le dépôt. Rien ne bloque votre déclaration.",
  },
];

export function reponseValide(brut: string | null | undefined): ReponseReglementation | null {
  return REPONSES.some((r) => r.valeur === brut) ? (brut as ReponseReglementation) : null;
}

/**
 * Faut-il un justificatif de qualification ?
 *
 * Seulement quand la personne a reconnu son métier dans la liste. Un doute ne
 * réclame pas de pièce : il réclame un avis, et le demander à tort ferait renoncer
 * quelqu'un qui n'en a pas besoin.
 */
export function qualificationExigee(reponse: string | null | undefined): boolean {
  return reponseValide(reponse) === "oui";
}

/** Le dossier demande-t-il un regard de l'avocat sur ce point ? */
export function verificationAttendue(reponse: string | null | undefined): boolean {
  return reponseValide(reponse) === "incertain";
}

/**
 * Une réponse « oui » sans métier désigné ne dit rien.
 *
 * C'est le seul cas où l'on refuse d'avancer : « oui » engage une pièce, et on ne
 * sait pas laquelle tant que la catégorie n'est pas nommée.
 */
export function reponseIncomplete(
  reponse: string | null | undefined,
  categorie: string | null | undefined
): boolean {
  return reponseValide(reponse) === "oui" && !activiteReglementee(categorie);
}
