import { journal } from "@/lib/journal";
import { RedactionIndisponible } from "./indisponible";
import { consigne, invite, nettoyerProposition } from "@/domain/formalite/objet-social";
import { texteDeLaReponse } from "./reponse";

/**
 * Rédaction assistée par Gemini.
 *
 * Un service extérieur : il tombe, il change de format, il refuse parfois de répondre.
 * Ce module traduit ses aléas en une erreur claire, et ne laisse jamais remonter sa
 * réponse brute - elle vient d'ailleurs.
 *
 * Il ne choisit pas : `redaction.ts` désigne le fournisseur, et les deux exposent la
 * même fonction. C'est ce qui permet de les comparer sur la même invite.
 */
/*
 * L'alias, non une version figée.
 *
 * « gemini-2.0-flash » a été retiré par Google, et le service a répondu 404 : la
 * rédaction assistée annonçait « momentanément indisponible » à chaque essai, sur une
 * panne qui ne passerait jamais. Une version épinglée se périme sans prévenir, et rien
 * ici ne le verrait avant qu'un client ne bute dessus.
 *
 * L'alias suit le modèle courant de la famille. Il peut changer de comportement d'un
 * jour à l'autre - c'est le prix - mais l'objet social est relu et corrigé par l'avocat
 * avant de figurer dans un acte, et la proposition est annoncée comme telle à l'écran.
 */
const MODELE = "gemini-flash-latest";

/*
 * Trente secondes, parce que le modèle réfléchit avant de répondre.
 *
 * Vingt suffisaient à l'invite d'origine, qui tenait en dix lignes. La famille flash
 * délibère désormais avant d'écrire - la réponse porte une `thoughtSignature` - et une
 * consigne qui montre deux objets sociaux complets demande une bonne dizaine de
 * secondes - une vingtaine, mesurées. Le délai coupait donc une génération qui
 * aboutissait, et l'écran annonçait « momentanément indisponible » sur un service qui
 * répondait.
 *
 * La reprise ne s'ajoute pas à cette attente : elle ne se déclenche que sur une réponse
 * de surcharge, qui arrive vite, jamais sur une échéance dépassée.
 *
 * On ne peut pas lui demander de ne pas réfléchir : `thinkingConfig.thinkingBudget: 0`
 * fait répondre 503 sur cet alias, essai après essai.
 */
const DELAI_MS = 30_000;

/*
 * Ce qu'on demande au modèle de faire de sa marge.
 *
 * Sans réglage, la valeur par défaut est celle d'un assistant de conversation : elle
 * varie d'un appel à l'autre, et deux dossiers identiques rendaient deux objets
 * différents. Un texte qui finit dans un acte déposé au greffe n'a rien à gagner à
 * l'invention - on lui laisse juste de quoi tourner une phrase.
 *
 * Le plafond de jetons tient une dizaine de clauses avec leurs incises ; la réponse est
 * de toute façon coupée à neuf lignes ensuite.
 */
const REGLAGES = {
  temperature: 0.2,
  topP: 0.8,
  candidateCount: 1,
  /*
   * Le plafond couvre la réflexion, pas seulement la réponse.
   *
   * À neuf cents jetons, le modèle délibérait puis se faisait couper au milieu de sa
   * première clause : l'écran affichait un objet social d'une ligne, tronqué en pleine
   * phrase. La délibération en consommait cinq cents à elle seule.
   *
   * Le budget de réflexion la borne - zéro n'est pas accepté, cinq cents suffisent - et
   * ce qui reste tient largement neuf clauses avec leurs incises.
   */
  maxOutputTokens: 3000,
  thinkingConfig: { thinkingBudget: 512 },
};

/*
 * Une seule reprise, et seulement sur une surcharge.
 *
 * Le service rend des 503 par périodes, plusieurs d'affilée sur la même minute : c'est
 * son état, non notre requête. Réessayer une fois suffit à passer la plupart, et
 * s'arrêter là évite de transformer une panne durable en attente d'une minute.
 *
 * Ni 400 ni 401 ne se réessaient : ceux-là viennent de nous et se répéteraient à
 * l'identique.
 */
const STATUTS_A_REPRENDRE = [429, 500, 502, 503, 504];
const ATTENTE_REPRISE_MS = 1_500;

export async function redigerAvecGemini(
  description: string,
  forme?: string | null
): Promise<string> {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) {
    journal.warn("Clé de rédaction assistée absente");
    throw new RedactionIndisponible("La rédaction assistée n'est pas configurée");
  }

  const appel = () => {
    /* Une échéance par tentative : la reprise repart avec son propre délai. */
    const abandon = AbortSignal.timeout(DELAI_MS);
    return fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        MODELE +
        ":generateContent?key=" +
        encodeURIComponent(cle),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /*
         * La consigne et la description ne voyagent pas ensemble.
         *
         * `systemInstruction` est le champ prévu pour ce qu'on demande ; `contents` pour
         * ce qu'on donne à lire. Tout tenait dans un seul bloc : le nettoyage protégeait
         * déjà de l'injection, mais rien ne séparait structurellement l'ordre de la
         * matière.
         */
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: consigne(forme) }] },
          contents: [{ parts: [{ text: invite(description) }] }],
          generationConfig: REGLAGES,
        }),
        signal: abandon,
      }
    );
  };

  let reponse: Response;
  try {
    reponse = await appel();
    if (STATUTS_A_REPRENDRE.includes(reponse.status)) {
      journal.warn({ statut: reponse.status }, "Rédaction assistée surchargée : une reprise");
      await new Promise((suite) => setTimeout(suite, ATTENTE_REPRISE_MS));
      reponse = await appel();
    }
  } catch (e) {
    throw new RedactionIndisponible(undefined, e);
  }

  if (!reponse.ok) {
    // Le corps peut contenir la clé en écho : on n'en garde que le statut.
    throw new RedactionIndisponible(undefined, new Error("statut " + reponse.status));
  }

  let donnees: unknown;
  try {
    donnees = await reponse.json();
  } catch (e) {
    throw new RedactionIndisponible(undefined, e);
  }

  const texte = texteDeLaReponse(donnees);

  if (!texte.trim()) {
    throw new RedactionIndisponible("Aucune proposition n'a pu être rédigée");
  }

  return nettoyerProposition(texte);
}
