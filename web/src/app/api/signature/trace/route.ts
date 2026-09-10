import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { traceDeLaSignature } from "@/infrastructure/db/depots/signatures";
import { validerParametres, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Le tracé d'une signature recueillie, en image.
 *
 * Le suivi annonçait « Signé le 10 septembre à 23h41 » et rien d'autre : une date, sur
 * la foi de la plateforme. Ce qui prouve une signature, c'est la signature - celle-là
 * même qui s'appose au bas des actes. La montrer relie les deux.
 *
 * Une route à part plutôt qu'un champ du suivi : un tracé pèse quelques dizaines de
 * milliers d'octets, et quatre signataires rechargés à chaque geste feraient passer une
 * liste de quatre lignes pour un téléversement. Ici le navigateur la garde en cache, et
 * ne la redemande pas.
 */
const DEMANDE = z.object({ demande: schemas.identifiant });

export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { demande } = validerParametres(DEMANDE, new URL(requete.url));

  const trace = await traceDeLaSignature(utilisateur, demande);
  if (!trace) {
    return NextResponse.json({ error: "Signature introuvable" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(trace), {
    headers: {
      "Content-Type": "image/png",
      /*
       * Privée, mais gardée : une signature ne change plus une fois recueillie - le
       * jeton est à usage unique - et la ligne se réaffiche à chaque retour sur
       * l'écran. « private » interdit les caches partagés, pas celui du navigateur.
       */
      "Cache-Control": "private, max-age=3600",
    },
  });
});
