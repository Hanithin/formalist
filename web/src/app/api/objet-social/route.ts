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
});

/** Chaque appel a un coût : dix par heure et par compte suffisent largement. */
const QUOTA = { maximum: 10, fenetreMs: 60 * 60 * 1000 };

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { description } = await validerCorps(SCHEMA, requete);

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
    const proposition = await redigerObjetSocial(propre);
    return NextResponse.json({
      proposition,
      // Le texte est une proposition, pas un acte : l'écran doit le dire.
      avertissement: "Proposition à relire et à ajuster avant dépôt.",
    });
  } catch (e) {
    if (e instanceof RedactionIndisponible) {
      return NextResponse.json({ error: e.message }, { status: e.statut });
    }
    throw e;
  }
});
