import { describe, it, expect } from "vitest";
import {
  jalonDeLEnvoi,
  dateDuJalon,
  libelleJalon,
  peutRelancer,
  DELAI_ENTRE_RELANCES,
  MOTIF_REJET,
  conseilDuJalon,
  type SuiviDemande,
} from "@/domain/formalite/signature";

/**
 * Ce qu'on peut affirmer d'une demande, et rien de plus.
 *
 * L'écran n'en disait rien : « chacun reçoit son lien par email » s'affichait une fois,
 * puis le bloc se taisait. Pire, sans clé d'envoi - le cas de toute machine de
 * développement - il affichait « aucun courriel n'est parti, prévenez le cabinet » en
 * rouge, pour un circuit qui fonctionnait comme prévu.
 *
 * Chaque jalon a son mot, et le mot dit exactement ce que la source sait : « Envoyé »
 * n'est pas « Remis », et « Mail ouvert » n'est pas « Lien ouvert ».
 */

const VIDE: SuiviDemande = {
  id: 1,
  nom: "Jean Dupont",
  email: "jean@exemple.fr",
  ouverteLe: null,
  signeeLe: null,
  envoyeLe: null,
  remisLe: null,
  mailOuvertLe: null,
  motif: null,
  relances: 0,
};

const LUNDI = new Date("2026-09-07T09:00:00Z");
const MARDI = new Date("2026-09-08T09:00:00Z");
const MERCREDI = new Date("2026-09-09T09:00:00Z");

describe("le jalon d'une demande de signature", () => {
  it("ne dit rien avant le premier envoi", () => {
    expect(jalonDeLEnvoi(VIDE)).toBe("non_envoye");
  });

  it("tient un refus du fournisseur pour un envoi manqué", () => {
    const refuse = { ...VIDE, envoyeLe: LUNDI, motif: "domain is not verified" };
    expect(jalonDeLEnvoi(refuse)).toBe("echec");
    /* Et la phrase du fournisseur remonte à l'écran : c'est elle qui dit quoi
       corriger, et elle finissait dans le journal, où personne ne va. */
    expect(conseilDuJalon(refuse)).toBe("domain is not verified");
  });

  it("dit ce qu'il y a à faire d'une adresse qui rend le message", () => {
    /*
     * Une pastille rouge dit qu'il y a un problème ; elle ne dit pas comment en sortir.
     * Ici la seule chose à faire est de corriger l'adresse et de relancer, et c'est ce
     * que la ligne doit dire - « Adresse rejetée » décrit le geste du serveur d'en
     * face, pas le nôtre.
     */
    const rendu = { ...VIDE, envoyeLe: LUNDI, motif: MOTIF_REJET };
    expect(jalonDeLEnvoi(rendu)).toBe("rejete");
    expect(libelleJalon("rejete")).toBe("Adresse incorrecte");
    expect(conseilDuJalon(rendu)).toContain("Corrigez-la ci-dessus, puis relancez");
  });

  it("n'affirme pas la remise sur la foi de l'envoi", () => {
    /* Poster n'est pas remettre : un message accepté par le fournisseur peut encore
       rebondir. Tant qu'aucun avis n'est arrivé, on ne dit que ce qu'on a fait. */
    expect(jalonDeLEnvoi({ ...VIDE, envoyeLe: LUNDI })).toBe("envoye");
    expect(jalonDeLEnvoi({ ...VIDE, envoyeLe: LUNDI, remisLe: MARDI })).toBe("remis");
  });

  it("distingue l'ouverture du courriel de celle du lien", () => {
    /* On peut ouvrir un message sans cliquer, et cliquer un lien transmis par un tiers
       sans avoir jamais reçu le message. Les deux dates ne racontent pas la même
       chose, et les confondre ferait dire à l'écran ce qu'il ne sait pas. */
    const mail = { ...VIDE, envoyeLe: LUNDI, remisLe: MARDI, mailOuvertLe: MERCREDI };
    expect(jalonDeLEnvoi(mail)).toBe("mail_ouvert");
    expect(jalonDeLEnvoi({ ...mail, ouverteLe: MERCREDI })).toBe("lien_ouvert");
  });

  it("fait passer un rejet devant ce qui l'a précédé", () => {
    /*
     * Un serveur peut accepter un message puis le rendre : le rejet arrive après la
     * remise, et parfois après une ouverture. Le laisser derrière elles afficherait un
     * message en route alors qu'il est revenu, et cacherait la seule chose à faire -
     * corriger l'adresse.
     */
    const rendu = {
      ...VIDE,
      envoyeLe: LUNDI,
      remisLe: MARDI,
      mailOuvertLe: MERCREDI,
      motif: MOTIF_REJET,
    };
    expect(jalonDeLEnvoi(rendu)).toBe("rejete");
    /* Sans date dans sa pastille : elle n'apprend rien à qui doit corriger une
       adresse, et le conseil en dessous la porte déjà. */
    expect(dateDuJalon(rendu)).toBeNull();
  });

  it("laisse la signature emporter tout le reste", () => {
    const signee = { ...VIDE, envoyeLe: LUNDI, motif: MOTIF_REJET, signeeLe: MERCREDI };
    expect(jalonDeLEnvoi(signee)).toBe("signee");
  });
});

describe("la date affichée à côté du jalon", () => {
  it("est celle de l'événement le plus avancé", () => {
    const demande = {
      ...VIDE,
      envoyeLe: LUNDI,
      remisLe: MARDI,
      mailOuvertLe: MERCREDI,
    };
    expect(dateDuJalon(demande)).toBe(MERCREDI);
    expect(dateDuJalon({ ...demande, signeeLe: MERCREDI })).toBe(MERCREDI);
    expect(dateDuJalon({ ...VIDE, envoyeLe: LUNDI })).toBe(LUNDI);
  });
});

describe("la relance", () => {
  it("ne s'offre pas à qui a signé", () => {
    /* Il n'y a plus rien à lui demander, et le lui redemander laisserait croire que sa
       signature n'a pas été prise. */
    expect(peutRelancer({ ...VIDE, envoyeLe: LUNDI, signeeLe: MARDI }, MERCREDI)).toBe(false);
  });

  it("ne part pas deux fois dans la minute", () => {
    const envoi = new Date("2026-09-07T09:00:00Z");
    const juste = new Date(envoi.getTime() + DELAI_ENTRE_RELANCES - 1);
    const apres = new Date(envoi.getTime() + DELAI_ENTRE_RELANCES);

    expect(peutRelancer({ ...VIDE, envoyeLe: envoi }, juste)).toBe(false);
    expect(peutRelancer({ ...VIDE, envoyeLe: envoi }, apres)).toBe(true);
  });

  it("reste possible sur une demande qui n'est jamais partie", () => {
    /* C'est précisément le cas où l'on en a besoin : le premier envoi a échoué, et le
       jeton dort en base sans que personne ne l'ait reçu. */
    expect(peutRelancer(VIDE, MERCREDI)).toBe(true);
  });
});
