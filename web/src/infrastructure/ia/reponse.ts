/**
 * Le texte d'une réponse du modèle.
 *
 * Il paraît anodin de prendre le premier morceau : ce l'était, tant que la réponse n'en
 * portait qu'un. Les modèles récents rendent leur raisonnement dans un morceau à part,
 * marqué comme tel, avant la réponse - le premier venu ramènerait ce brouillon, ou rien
 * du tout s'il ne porte pas de texte.
 *
 * Cette lecture est partagée par les deux usages du modèle - la rédaction d'un objet
 * social et la lecture d'un bilan - parce qu'ils se cassent de la même façon.
 */

interface Morceau {
  text?: string;
  /** Le raisonnement du modèle, quand il le rend séparément. */
  thought?: boolean;
}

interface Reponse {
  candidates?: { content?: { parts?: Morceau[] } }[];
}

export function texteDeLaReponse(donnees: unknown): string {
  const morceaux = (donnees as Reponse)?.candidates?.[0]?.content?.parts ?? [];

  return morceaux
    .filter((morceau) => morceau?.thought !== true && typeof morceau?.text === "string")
    .map((morceau) => morceau.text)
    .join("");
}
