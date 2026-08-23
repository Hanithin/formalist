/**
 * Les deux documents d'une cessation d'auto-entreprise.
 *
 * Il n'y a pas d'acte juridique à rédiger : une auto-entreprise n'a ni associés, ni
 * assemblée, ni statuts. La déclaration au guichet unique est un formulaire, non un
 * acte, et c'est nous qui le déposons.
 *
 * Restent deux pièces, et elles servent vraiment. Le pouvoir, parce que le guichet
 * exige une identification de l'entrepreneur : sans mandat écrit, un tiers ne peut pas
 * déposer à sa place. Et la déclaration récapitulative, parce qu'elle est la seule
 * trace datée de ce qui a été déclaré - utile le jour où l'URSSAF réclame des
 * cotisations pour une période postérieure à l'arrêt, ce qui arrive.
 */

export interface ActeAProduire {
  titre: string;
  gabarit: string;
}

export function actesDeLaCessation(nature: "definitive" | "temporaire"): ActeAProduire[] {
  return [
    {
      titre:
        nature === "temporaire"
          ? "Déclaration de suspension d'activité"
          : "Déclaration de cessation d'activité",
      gabarit: "cessation-declaration.docx",
    },
    {
      titre: "Pouvoir pour la formalité au guichet unique",
      gabarit: "cessation-pouvoir.docx",
    },
  ];
}

export const GABARITS_DE_CESSATION = ["cessation-declaration.docx", "cessation-pouvoir.docx"];
