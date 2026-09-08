import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { redigerObjetSocial, RedactionIndisponible } from "@/infrastructure/ia/redaction";
import {
  nettoyerDescription,
  verifierDescription,
  LONGUEUR_MAXIMALE_DESCRIPTION,
} from "@/domain/formalite/objet-social";
import { verifierQuota, enregistrerTentative } from "@/infrastructure/db/limitation";
import { validerCorps, EntreeInvalide } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({
  description: z.string().max(LONGUEUR_MAXIMALE_DESCRIPTION * 4),
  /*
   * La forme juridique change l'objet, pas seulement son style.
   *
   * Une société civile dont l'objet mentionne l'achat pour revendre devient commerciale
   * en fait - autre imposition, autre responsabilité, et un greffe qui refuse. Elle est
   * facultative : l'écran la connaît, mais un appel qui l'omet doit rendre un texte,
   * non une erreur.
   */
  forme: z.string().trim().max(20).optional(),
});

/** Chaque appel a un coût : dix par heure et par compte suffisent largement. */
const QUOTA = { maximum: 10, fenetreMs: 60 * 60 * 1000 };

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { description, forme } = await validerCorps(SCHEMA, requete);

  // Nettoyage avant tout : ce texte se retrouve dans une invite.
  const propre = nettoyerDescription(description);
  const anomalies = verifierDescription(propre);
  if (anomalies.length > 0) {
    throw new EntreeInvalide(Object.fromEntries(anomalies.map((a) => [a.champ, [a.message]])));
  }

  // Limite par compte, pas par adresse : c'est le coût qu'on encadre.
  await verifierQuota("objet-social", String(utilisateur.id), QUOTA);
  await enregistrerTentative("objet-social", String(utilisateur.id));

  try {
    const proposition = await redigerObjetSocial(propre, forme);
    return NextResponse.json({
      proposition,
      // Le texte est une proposition, pas un acte : l'écran doit le dire.
      avertissement: "Proposition à relire et à ajuster avant dépôt.",
    });
  } catch (e) {
    if (e instanceof RedactionIndisponible) {
      /*
       * De quoi diagnostiquer sans lire les journaux du serveur.
       *
       * Le message affiché ne change pas ; la réponse dit en plus lequel des deux
       * services a été appelé et ce qu'il a rendu. Une panne se réduisait sinon à
       * « momentanément indisponible », et distinguer un quota épuisé d'une clé absente
       * demandait un accès aux logs de production.
       *
       * Ni la clé ni le corps de l'erreur n'y figurent : un nom de fournisseur et un
       * code HTTP ne révèlent rien qu'un attaquant ne puisse déduire du temps de
       * réponse.
       */
      return NextResponse.json(
        {
          error: e.message,
          ...(e.fournisseur ? { fournisseur: e.fournisseur } : {}),
          ...(e.statutFournisseur ? { statutFournisseur: e.statutFournisseur } : {}),
        },
        { status: e.statut }
      );
    }
    throw e;
  }
});
