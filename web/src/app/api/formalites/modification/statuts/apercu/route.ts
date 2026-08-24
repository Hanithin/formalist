import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirModification } from "@/infrastructure/db/depots/modifications";
import { actesDe, telechargerActe } from "@/infrastructure/inpi/actes";
import { RegistreIndisponible } from "@/infrastructure/inpi/registre";
import { route } from "@/lib/reponses";

/**
 * L'acte du registre, montré avant d'être retenu.
 *
 * On demandait au client d'affirmer que les statuts trouvés étaient bien les siens
 * sur la foi d'un intitulé et d'une date - « Statuts constitutifs, dépôt du 12 mars
 * 2021 ». C'est peu pour engager la suite du parcours : ce fichier sert de base à la
 * retouche article par article, puis part au greffe. Une société qui a déposé deux
 * jeux d'actes le même mois, un dépôt mal typé au registre, et l'on retouche le mauvais
 * document sans jamais l'ouvrir.
 *
 * L'aperçu ne conserve rien : il relaie le PDF, le dossier ne le reçoit qu'à la
 * confirmation. Deux raisons - le client peut regarder puis déposer sa propre version,
 * et un dossier ne doit pas se remplir de ce qu'on n'a fait que consulter.
 *
 * L'identifiant est revérifié auprès du registre plutôt que cru sur parole : sans
 * cela, cette route relaierait n'importe quel acte de l'INPI à qui devine une URL.
 */
export const GET = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const parametres = new URL(requete.url).searchParams;
  const dossierId = Number(parametres.get("dossier"));
  const acte = (parametres.get("acte") ?? "").trim();

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }

  const { modification } = await ouvrirModification(utilisateur, dossierId);
  const siren = (modification.societe.siren ?? "").replace(/\s/g, "");
  if (!siren) {
    return NextResponse.json({ error: "Le SIREN de la société n'est pas renseigné" }, { status: 400 });
  }

  try {
    const actes = await actesDe(siren);
    const choisi = actes.find((a) => a.id === acte);
    if (!choisi) {
      return NextResponse.json(
        { error: "Cet acte n'est pas au dossier de la société" },
        { status: 400 }
      );
    }

    const pdf = await telechargerActe(choisi.id);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        /* Affiché dans la fenêtre, non téléchargé : c'est une vérification. */
        "Content-Disposition": 'inline; filename="statuts.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof RegistreIndisponible) {
      return NextResponse.json({ error: e.message }, { status: e.statut });
    }
    throw e;
  }
});
