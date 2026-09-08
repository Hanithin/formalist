import Anthropic from "@anthropic-ai/sdk";
import { journal } from "@/lib/journal";
import { RedactionIndisponible } from "./indisponible";
import { consigne, invite, nettoyerProposition } from "@/domain/formalite/objet-social";

/**
 * Rédaction assistée par Claude.
 *
 * Même invite que chez Gemini, à la virgule près : c'est la condition pour que la
 * comparaison porte sur le modèle et non sur ce qu'on lui demande. La consigne part dans
 * `system`, la description dans le message - la même séparation qu'ailleurs.
 */

/*
 * Le modèle, en identifiant daté.
 *
 * C'est la différence de fond avec l'alias de Gemini : celui-ci ne change pas de
 * comportement d'un jour à l'autre, et une version retirée ne se découvre pas par un 404
 * en production.
 */
const MODELE = process.env.CLAUDE_MODELE?.trim() || "claude-opus-5";

/*
 * Une sortie courte, et bornée.
 *
 * Neuf clauses font quatre cents jetons ; deux mille laissent la marge sans permettre
 * une dissertation. Contrairement à Gemini, la réflexion ne se compte pas dedans - le
 * plafond ne peut donc pas couper la réponse au profit de la délibération.
 */
const JETONS_MAXIMUM = 2000;

/**
 * Tous les modèles n'acceptent pas `effort`.
 *
 * Haiku 4.5 le refuse en 400 - « This model does not support the effort parameter » -
 * et il n'en a pas besoin : il ne délibère pas avant d'écrire. Le réglage n'existe que
 * sur les familles qui réfléchissent, et `CLAUDE_MODELE` permet d'en changer sans
 * déploiement : la requête doit donc s'adapter au modèle, non l'inverse.
 */
function accepteLEffort(modele: string): boolean {
  return !/haiku/i.test(modele);
}

/** Le texte des blocs, dans l'ordre. Le reste - réflexion, outils - ne nous regarde pas. */
function texteDesBlocs(message: Anthropic.Message): string {
  return message.content
    .filter((bloc): bloc is Anthropic.TextBlock => bloc.type === "text")
    .map((bloc) => bloc.text)
    .join("");
}

export async function redigerAvecClaude(
  description: string,
  forme?: string | null
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    journal.warn("Clé de rédaction assistée absente");
    throw new RedactionIndisponible("La rédaction assistée n'est pas configurée");
  }

  /*
   * L'espace de travail, quand la clé n'en désigne pas.
   *
   * Une clé rattachée à un espace n'a besoin de rien : elle dit d'elle-même où imputer
   * l'appel. Une clé qui ne l'est pas se fait refuser en 400 - « this request must
   * include the anthropic-workspace-id header » - et le message ne remonte pas jusqu'à
   * l'écran, qui annonce une indisponibilité pour un défaut de configuration.
   *
   * L'identifiant n'est pas un secret, mais il vit avec la clé : les deux se règlent au
   * même endroit, et l'un sans l'autre ne sert à rien.
   */
  const espace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = new Anthropic(
    espace ? { defaultHeaders: { "anthropic-workspace-id": espace } } : {}
  );

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODELE,
      max_tokens: JETONS_MAXIMUM,
      system: consigne(forme),
      messages: [{ role: "user", content: invite(description) }],
      /*
       * Peu d'effort, mais de la réflexion quand même.
       *
       * La désactiver sur les familles qui réfléchissent se paie de deux façons connues -
       * un appel d'outil écrit dans le texte, des balises internes qui fuient - et
       * rédiger un objet social ne demande pas de longue délibération. `effort` est le
       * réglage prévu pour ça.
       */
      ...(accepteLEffort(MODELE) ? { output_config: { effort: "low" as const } } : {}),
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      /* Le corps peut porter la clé en écho : on n'en garde que le statut. */
      throw new RedactionIndisponible(undefined, new Error("statut " + e.status));
    }
    throw new RedactionIndisponible(undefined, e);
  }

  /*
   * Un refus est une réponse, non une panne.
   *
   * Il arrive avec un 200 : lire `content` sans regarder `stop_reason` rendrait une
   * chaîne vide et ferait chercher la panne du mauvais côté.
   */
  if (message.stop_reason === "refusal") {
    throw new RedactionIndisponible("Aucune proposition n'a pu être rédigée");
  }

  const texte = texteDesBlocs(message);
  if (!texte.trim()) {
    throw new RedactionIndisponible("Aucune proposition n'a pu être rédigée");
  }

  return nettoyerProposition(texte);
}
