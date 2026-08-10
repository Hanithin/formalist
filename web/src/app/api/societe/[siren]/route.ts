import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { societe, RegistreIndisponible } from "@/infrastructure/inpi/registre";
import { route } from "@/lib/reponses";

/**
 * Fiche d'une société au registre national.
 *
 * Réservée aux comptes connectés : le registre est public, mais l'interroger
 * depuis nos identifiants sans authentification en ferait un relais gratuit.
 */
export const GET = route(
  async (_requete: Request, contexte: { params: Promise<{ siren: string }> }) => {
    await exigerUtilisateur();
    const { siren } = await contexte.params;

    try {
      const fiche = await societe(siren);
      if (!fiche) {
        return NextResponse.json({ error: "Société introuvable" }, { status: 404 });
      }
      return NextResponse.json({ societe: fiche });
    } catch (e) {
      if (e instanceof RegistreIndisponible) {
        return NextResponse.json({ error: e.message }, { status: e.statut });
      }
      throw e;
    }
  }
);
