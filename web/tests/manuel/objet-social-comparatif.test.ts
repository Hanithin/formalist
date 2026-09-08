import { it } from "vitest";
import { redigerObjetSocial, type Fournisseur } from "@/infrastructure/ia/redaction";

/**
 * Gemini contre Claude, sur la même invite.
 *
 * La question posée est « lequel écrit le mieux un objet social », et elle ne se tranche
 * pas de mémoire. Les deux reçoivent la consigne et la description du même endroit :
 * ce qui les sépare ici est le modèle, rien d'autre.
 *
 * Trois cas, choisis pour ce qu'ils mettent à l'épreuve :
 *   - « HOLDING PASSIVE » est celui qui a échoué - deux lignes au lieu d'un objet ;
 *   - l'agence de voyages demande des activités connexes qu'une description ne dit pas ;
 *   - la SCI est le seul où une erreur coûte cher : un objet commercial la rendrait
 *     commerciale en fait, avec une autre imposition et un greffe qui refuse.
 *
 * Aucune assertion : la qualité d'un objet social se lit. Ce qui se mesure - la durée,
 * l'échec - est rapporté à côté.
 *
 *   npm run objet-social:comparatif
 */

const CAS = [
  { description: "HOLDING PASSIVE", forme: "SAS" },
  { description: "Agence de voyages en ligne", forme: "SASU" },
  { description: "Achat et location d'appartements", forme: "SCI" },
  /* Six caractères : le minimum accepté depuis qu'une activité peut se dire en un mot. */
  { description: "holding", forme: "SASU" },
];

const FOURNISSEURS: Fournisseur[] = ["gemini", "claude"];

interface Mesure {
  fournisseur: Fournisseur;
  cas: string;
  ms: number;
  clauses: number;
  echec?: string;
}

it("compare les fournisseurs sur les mêmes cas", async () => {
  const mesures: Mesure[] = [];

  for (const cas of CAS) {
    for (const fournisseur of FOURNISSEURS) {
      const debut = Date.now();
      const entete = "\n══════ " + fournisseur.toUpperCase() + " - " + cas.forme + " - « " + cas.description + " »";
      try {
        const objet = await redigerObjetSocial(cas.description, cas.forme, fournisseur);
        const ms = Date.now() - debut;
        const clauses = objet.split("\n").filter(Boolean).length;
        mesures.push({ fournisseur, cas: cas.description, ms, clauses });
        console.log(entete + " - " + clauses + " clauses en " + (ms / 1000).toFixed(1) + " s\n" + objet);
      } catch (e) {
        const ms = Date.now() - debut;
        const echec = (e as Error).message;
        mesures.push({ fournisseur, cas: cas.description, ms, clauses: 0, echec });
        console.log(entete + " - ÉCHEC en " + (ms / 1000).toFixed(1) + " s : " + echec);
      }
    }
  }

  console.log("\n══════ RÉCAPITULATIF");
  for (const fournisseur of FOURNISSEURS) {
    const siennes = mesures.filter((m) => m.fournisseur === fournisseur);
    const reussies = siennes.filter((m) => !m.echec);
    const duree = reussies.length
      ? (reussies.reduce((t, m) => t + m.ms, 0) / reussies.length / 1000).toFixed(1)
      : "-";
    const clauses = reussies.length
      ? (reussies.reduce((t, m) => t + m.clauses, 0) / reussies.length).toFixed(1)
      : "-";
    console.log(
      "  " +
        fournisseur.padEnd(8) +
        reussies.length + "/" + siennes.length + " réussis, " +
        duree + " s en moyenne, " +
        clauses + " clauses en moyenne"
    );
  }
}, 300_000);
