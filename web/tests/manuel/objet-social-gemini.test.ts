import { it } from "vitest";
import { redigerObjetSocial } from "@/infrastructure/ia/redaction";

/**
 * Ce que Gemini rend vraiment, avec l'invite du jour.
 *
 * Aucune assertion : la qualité d'un objet social ne se vérifie pas par un `expect`,
 * elle se lit. Ce test sert à la relire après chaque retouche de la consigne, sur les
 * cas qui ont posé problème - « HOLDING PASSIVE » rendait deux lignes - et sur ceux où
 * la forme juridique change la réponse.
 *
 * Hors de la suite : il appelle un service tiers et coûte un appel par cas.
 *   npm run objet-social:essai
 */

const CAS: { description: string; forme: string }[] = [
  { description: "HOLDING PASSIVE", forme: "SAS" },
  { description: "Agence de voyages en ligne", forme: "SASU" },
  { description: "Achat et location d'appartements", forme: "SCI" },
];

it("rédige un objet social pour chaque cas", async () => {
  for (const cas of CAS) {
    const entete = "\n══════ " + cas.forme + " - « " + cas.description + " » ";
    try {
      const objet = await redigerObjetSocial(cas.description, cas.forme);
      console.log(entete + "- " + objet.split("\n").length + " clauses\n" + objet);
    } catch (e) {
      /*
       * Un cas qui échoue n'arrête pas les autres.
       *
       * Le service rend des 503 par périodes : sans cela, la première surcharge privait
       * de la seule chose qu'on vient voir - ce que rendent les deux cas suivants.
       */
      console.log(entete + "- ÉCHEC : " + (e as Error).message);
    }
  }
}, 240_000);
