import { prisma } from "../client";
import { exigerDossierModifiable } from "./dossiers";
import { premiereEtapeIncomplete, type Declaration } from "@/domain/auto-entrepreneur/declaration";
import { proposerAuxAvocats } from "./avocat";
import { relirePaiement } from "@/infrastructure/paiement/stripe";
import { journal } from "@/lib/journal";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Déclaration d'auto-entreprise.
 *
 * Elle est stockée comme une formalité, du type « auto-entrepreneur » : elle
 * hérite ainsi des règles d'accès, de la messagerie et du dépôt de pièces, sans
 * qu'on ait à les redéfinir.
 */

/** La déclaration telle qu'elle est stockée. Exportée : la route des pièces en a besoin. */
export function lireDeclaration(dataJson: string | null): Declaration {
  return lire(dataJson);
}

function lire(dataJson: string | null): Declaration {
  if (!dataJson) return {};
  try {
    const analyse: unknown = JSON.parse(dataJson);
    return analyse && typeof analyse === "object" ? (analyse as Declaration) : {};
  } catch {
    return {};
  }
}

export async function commencerDeclaration(utilisateur: UtilisateurConnecte) {
  const equipe = await prisma.team_members.findFirst({
    where: { user_id: utilisateur.id },
    select: { team_id: true },
  });

  const dossier = await prisma.formalites.create({
    data: {
      user_id: utilisateur.id,
      team_id: equipe?.team_id ?? null,
      type: "auto-entrepreneur",
      forme: "AE",
      societe: "",
      status: "en_cours",
      phase: 1,
      data_json: "{}",
    },
  });

  return dossier.id;
}

export async function ouvrirDeclaration(utilisateur: UtilisateurConnecte, dossierId: number) {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);
  return { dossier, declaration: lire(dossier.data_json) };
}

export async function enregistrerDeclaration(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  modifications: Partial<Declaration>
) {
  const { dossier, declaration } = await ouvrirDeclaration(utilisateur, dossierId);
  const fusionnee = { ...declaration, ...modifications };

  // Le nom affiché dans les listes est celui de la personne : une auto-entreprise
  // n'a pas de dénomination distincte.
  const nom = [fusionnee.prenoms, fusionnee.nomUsage || fusionnee.nomNaissance]
    .filter(Boolean)
    .join(" ")
    .trim();

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify(fusionnee),
      societe: nom || dossier.societe,
      phase: premiereEtapeIncomplete(fusionnee) ?? 7,
      updated_at: new Date(),
    },
  });

  return fusionnee;
}

/**
 * Ouvre le règlement de la création, et retient sa référence.
 *
 * La référence est posée avant de renvoyer chez Stripe : au retour, c'est elle qui
 * relie la session au dossier. Sans elle, un encaissement arriverait sans savoir
 * quoi confirmer.
 */
export async function ouvrirLeReglement(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  reference: string
) {
  const { declaration } = await ouvrirDeclaration(utilisateur, dossierId);
  await enregistrerDeclaration(utilisateur, dossierId, {
    ...declaration,
    paiementRef: reference,
  });
}

/**
 * Confirme le règlement, et remet le dossier aux avocats.
 *
 * Le paiement est le seul moment où le dossier change de mains : tant qu'il n'est pas
 * réglé, il appartient au client et n'encombre la file de personne. Une fois encaissé,
 * il est proposé à tous les avocats, et le premier qui l'accepte le prend.
 *
 * L'appel est idempotent : Stripe réémet ses avis, et un dossier déjà transmis ne doit
 * pas repartir une seconde fois dans la file.
 */
export async function confirmerLeReglement(reference: string, dossierId: number | null) {
  const dossier = await prisma.formalites.findFirst({
    where: dossierId ? { id: dossierId } : { data_json: { contains: reference } },
  });

  if (!dossier) {
    journal.warn({ session: reference }, "Encaissement sans dossier");
    return { dossierId: null, paye: false };
  }

  const declaration = lire(dossier.data_json);
  if (declaration.paye) return { dossierId: dossier.id, paye: true };

  await prisma.formalites.update({
    where: { id: dossier.id },
    data: {
      data_json: JSON.stringify({ ...declaration, paiementRef: reference, paye: true }),
      status: "en_attente_validation",
      phase: 5,
      updated_at: new Date(),
    },
  });

  await prisma.audit_log.create({
    data: {
      formalite_id: dossier.id,
      actor_id: dossier.user_id,
      actor_role: "user",
      action: "auto_entreprise_payee",
      after_value: reference,
    },
  });

  const { proposes } = await proposerAuxAvocats(dossier.id);
  return { dossierId: dossier.id, paye: true, proposes };
}

/**
 * Confirme le règlement au retour du client.
 *
 * Le paiement est relu auprès de Stripe plutôt que cru sur parole : le paramètre
 * vient de l'adresse, et une adresse se recopie. C'est aussi ce qui rend la
 * confirmation indépendante du webhook, qui peut arriver en retard - ou jamais, si le
 * relais n'est pas en marche. Les deux chemins mènent à la même écriture, qui ne fait
 * rien la seconde fois.
 *
 * Le dossier doit être le sien : sans cette vérification, recopier une adresse de
 * retour confirmerait le paiement de quelqu'un d'autre.
 */
export async function confirmerAuRetour(
  utilisateur: UtilisateurConnecte,
  dossierId: number,
  session: string
): Promise<{ paye: boolean }> {
  const dossier = await exigerDossierModifiable(utilisateur, dossierId);

  const encaissement = await relirePaiement(session);
  if (encaissement.dossierId !== null && encaissement.dossierId !== dossier.id) {
    journal.warn({ session }, "Retour de paiement pour un autre dossier, ignoré");
    return { paye: false };
  }

  const resultat = await confirmerLeReglement(session, dossier.id);
  return { paye: resultat.paye };
}
