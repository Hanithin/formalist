import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirModification } from "@/infrastructure/db/depots/modifications";
import { lireLeTexteDUnPdf, DocumentIllisible } from "@/infrastructure/documents/lecture-bilan";
import { lireUnAir, type AirLu } from "@/domain/modification/lecture-air";
import { natureDuDepot, retenuDAvance } from "@/domain/modification/nature-accord";
import { verifierDepot, DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";
import { journal } from "@/lib/journal";

/**
 * Lire des accords sans rien déposer.
 *
 * Le dépôt écrivait le fichier, lisait, et ajoutait la ligne au dossier d'un seul geste.
 * Se tromper de fichier dans le sélecteur - et cela arrive, ils portent des noms qui se
 * ressemblent - laissait un relevé bancaire dans la liste des accords, avec ses quatre
 * champs vides. Il fallait ensuite le retrouver et le retirer.
 *
 * Cette route ne fait que lire. Rien n'est écrit sur le disque, rien n'entre au dossier :
 * elle rend ce qu'elle a compris de chaque fichier, et l'écran le montre avant que quoi
 * que ce soit ne soit engagé. Ce qui est retenu repart ensuite par le dépôt, avec sa
 * lecture déjà faite.
 *
 * L'accès au dossier est vérifié quand même : lire des PDF coûte du temps machine, et
 * cette route ne doit pas servir de moulinette à qui n'a rien à faire ici.
 */

/** Au-delà, ce n'est plus un tour d'amorçage : voir ACCORDS_MAXIMUM au dépôt. */
const FICHIERS_MAXIMUM = 60;

export interface AccordAnalyse {
  nom: string;
  taille: number;
  nature: string;
  libelle: string;
  indices: string[];
  /** Coché d'avance, ou laissé à décider. */
  retenu: boolean;
  lu: AirLu;
}

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();

  const formulaire = await requete.formData();
  const dossierId = Number(formulaire.get("dossier"));
  const fichiers = formulaire.getAll("fichiers").filter((f): f is File => f instanceof File);

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }
  if (fichiers.length === 0) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }
  if (fichiers.length > FICHIERS_MAXIMUM) {
    return NextResponse.json(
      { error: "Pas plus de " + FICHIERS_MAXIMUM + " fichiers à la fois" },
      { status: 400 }
    );
  }

  await ouvrirModification(utilisateur, dossierId);

  const analyses: AccordAnalyse[] = [];

  for (const fichier of fichiers) {
    const contenu = Buffer.from(await fichier.arrayBuffer());

    /*
     * Un fichier refusé n'arrête pas les autres.
     *
     * Le dépôt rendait une erreur pour tout le lot dès le premier fichier de travers :
     * on déposait douze accords, le sixième était un .docx, et les onze autres
     * repartaient avec lui. Ici chaque ligne porte son propre sort.
     */
    let texte: string | null = null;
    try {
      verifierDepot(fichier.name, contenu, [".pdf"]);
      const lecture = await lireLeTexteDUnPdf(contenu);
      texte = lecture.texte;
    } catch (e) {
      if (e instanceof DepotRefuse) {
        analyses.push({
          nom: fichier.name,
          taille: fichier.size,
          nature: "hors_sujet",
          libelle: e.message,
          indices: [],
          retenu: false,
          lu: { investisseur: null, montant: null, valorisation: null, signeLe: null, manques: [] },
        });
        continue;
      }
      if (!(e instanceof DocumentIllisible)) throw e;
      journal.warn({ dossierId, fichier: fichier.name }, "Accord BSA AIR illisible à l'analyse");
    }

    const vu = natureDuDepot(texte);

    /* On ne dépouille que ce qui a du texte : chercher un montant dans le vide ne rend
       que des blancs, et quatre manques annoncés pour un document non lu induisent en
       erreur - la ligne dit déjà qu'elle n'a rien pu lire. */
    const lu: AirLu =
      texte && vu.nature !== "illisible"
        ? lireUnAir(texte)
        : { investisseur: null, montant: null, valorisation: null, signeLe: null, manques: [] };

    analyses.push({
      nom: fichier.name,
      taille: fichier.size,
      nature: vu.nature,
      libelle: vu.libelle,
      indices: vu.indices,
      retenu: retenuDAvance(vu.nature),
      lu,
    });
  }

  return NextResponse.json({ analyses });
});
