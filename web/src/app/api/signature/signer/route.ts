import { NextResponse } from "next/server";
import { z } from "zod";
import { signer } from "@/infrastructure/db/depots/signatures";
import { SignatureRefusee } from "@/domain/formalite/signature";
import { validerCorps } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Enregistre une signature.
 *
 * Ouvert sans session : les associés n'ont pas de compte. Le jeton fait foi, et
 * il ne sert qu'une fois.
 */
const SCHEMA = z.object({
  jeton: z.string().trim().min(32, "Lien invalide").max(128),
  trace: z.string().min(1, "Signature manquante"),
  /*
   * Le paraphe, quand le nom permet de le composer.
   *
   * Facultatif : un signataire dont le dossier ne porte qu'un prénom d'une lettre n'en
   * a pas, et cela ne doit pas empêcher sa signature. Il est vérifié comme le tracé -
   * les deux finissent dans un document, on n'y injecte pas de contenu arbitraire.
   */
  paraphe: z.string().min(1).nullish(),
});

export const POST = route(async (requete: Request) => {
  const { jeton, trace, paraphe } = await validerCorps(SCHEMA, requete);

  try {
    const resultat = await signer(jeton, trace, paraphe ?? null);

    if (!resultat.ok) {
      // On ne distingue pas « jeton inconnu » de « déjà signé » vers l'extérieur :
      // la réponse ne doit pas permettre de sonder les jetons.
      return NextResponse.json(
        { error: "Ce lien de signature n'est plus valable" },
        { status: 410 }
      );
    }

    return NextResponse.json({ ok: true, complet: resultat.complet });
  } catch (e) {
    if (e instanceof SignatureRefusee) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
