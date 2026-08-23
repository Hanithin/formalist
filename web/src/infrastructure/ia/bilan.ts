import { journal } from "@/lib/journal";
import { CHAMPS_DU_BILAN, type ChampDuBilan } from "@/domain/comptes/types";
import { posteslus, type PosteTrouve } from "@/domain/comptes/extraction";

/**
 * Les chiffres d'une liasse, lus par repères puis complétés par le modèle.
 *
 * Les repères d'abord, parce qu'ils sont sûrs : une liasse française écrit toujours
 * « RÉSULTAT DE L'EXERCICE » au même endroit, et une expression régulière ne
 * l'invente pas. Le modèle ensuite, pour les liasses mal formées, les scans dont la
 * reconnaissance a mangé les colonnes, et les libellés d'éditeurs exotiques.
 *
 * L'ordre a une conséquence pratique : sans clé configurée, l'extraction fonctionne
 * quand même, en dégradé. C'est le cas en développement, et ce serait le cas un jour
 * de panne du service.
 *
 * Aucun chiffre n'est jamais posé sans que l'écran puisse le corriger. Un montant mal
 * lu deviendrait un dividende faux dans un acte, avec l'autorité d'une valeur « lue
 * dans le document » - c'est plus dangereux qu'un champ vide.
 */

const MODELE = "gemini-2.0-flash";
const DELAI_MS = 25_000;
/** Une liasse dépasse ce que le modèle lit d'un coup : on lui donne le début, qui porte le bilan. */
const CARACTERES_MAXIMUM = 60_000;

export interface ChiffreExtrait {
  champ: ChampDuBilan;
  valeur: number;
  /** D'où il vient : une ligne du document, ou la lecture du modèle. */
  origine: string;
  /** Par quel moyen, pour que l'écran le dise. */
  par: "reperes" | "modele";
}

export async function extraireLesChiffres(texte: string): Promise<ChiffreExtrait[]> {
  const parReperes: ChiffreExtrait[] = posteslus(texte).map((poste: PosteTrouve) => ({
    champ: poste.champ,
    valeur: poste.valeur,
    origine: poste.ligne,
    par: "reperes" as const,
  }));

  const manquants = CHAMPS_DU_BILAN.filter(
    (champ) => !parReperes.some((trouve) => trouve.champ === champ)
  );
  if (manquants.length === 0) return parReperes;

  const parLeModele = await demanderAuModele(texte, manquants);
  return [...parReperes, ...parLeModele];
}

async function demanderAuModele(
  texte: string,
  manquants: readonly ChampDuBilan[]
): Promise<ChiffreExtrait[]> {
  const cle = process.env.GEMINI_API_KEY;
  if (!cle) {
    journal.warn("Clé de lecture assistée absente : extraction du bilan par repères seuls");
    return [];
  }

  const invite = [
    "Tu lis une liasse fiscale française. Rends uniquement un objet JSON, sans phrase autour.",
    "Pour chacune de ces clés, donne le montant en euros, nombre simple, sans espace ni symbole :",
    manquants.join(", "),
    "",
    "Règles impératives :",
    "- une perte, un report à nouveau débiteur ou un montant entre parenthèses est négatif ;",
    "- « resultat » est le résultat NET de l'exercice, jamais le résultat d'exploitation ;",
    "- « totalBilan » est le total général de l'actif, colonne nette ;",
    "- « effectif » est un nombre de personnes, pas un montant ;",
    "- omets une clé plutôt que d'inventer sa valeur.",
    "",
    "Document :",
    texte.slice(0, CARACTERES_MAXIMUM),
  ].join("\n");

  let reponse: Response;
  try {
    reponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        MODELE +
        ":generateContent?key=" +
        encodeURIComponent(cle),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: invite }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(DELAI_MS),
      }
    );
  } catch (e) {
    journal.warn({ err: e }, "Lecture assistée du bilan injoignable");
    return [];
  }

  if (!reponse.ok) {
    journal.warn({ statut: reponse.status }, "Lecture assistée du bilan refusée");
    return [];
  }

  try {
    const corps = (await reponse.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const brut = corps.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const lu = JSON.parse(brut) as Record<string, unknown>;

    /*
     * On ne retient que ce qu'on a demandé, et seulement si c'est un nombre.
     *
     * Le modèle rend parfois « 48 200 € » ou « non trouvé » : ce qui n'est pas un
     * nombre est écarté plutôt que converti, une conversion ratée valant zéro et un
     * zéro se lisant comme un chiffre réel dans le formulaire.
     */
    return manquants
      .map((champ) => ({ champ, valeur: Number(lu[champ]) }))
      .filter(({ valeur }) => Number.isFinite(valeur))
      .map(({ champ, valeur }) => ({
        champ,
        valeur,
        origine: "lecture du document par le modèle",
        par: "modele" as const,
      }));
  } catch (e) {
    journal.warn({ err: e }, "Lecture assistée du bilan illisible");
    return [];
  }
}
