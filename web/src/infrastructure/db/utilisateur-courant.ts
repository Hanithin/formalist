import { cookies } from "next/headers";
import { utilisateurDuJeton, type UtilisateurConnecte } from "./sessions";
import type { Role } from "@/domain/acces/regles";
import { NOM_COOKIE } from "@/lib/cookies";

export { NOM_COOKIE } from "@/lib/cookies";

/**
 * L'utilisateur de la requête en cours, ou null.
 *
 * Ne redirige pas et ne lève pas : certaines pages s'affichent différemment selon
 * qu'on est connecté ou non. Pour exiger une session, voir exigerUtilisateur.
 */
export async function utilisateurCourant(): Promise<UtilisateurConnecte | null> {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  if (!jeton) return null;
  return utilisateurDuJeton(jeton);
}

export class NonAuthentifie extends Error {
  readonly statut = 401;
  constructor() {
    super("Authentification requise");
    this.name = "NonAuthentifie";
  }
}

export class Interdit extends Error {
  readonly statut = 403;
  constructor(message = "Accès refusé") {
    super(message);
    this.name = "Interdit";
  }
}

/** Exige une session valide. Lève NonAuthentifie sinon. */
export async function exigerUtilisateur(): Promise<UtilisateurConnecte> {
  const utilisateur = await utilisateurCourant();
  if (!utilisateur) throw new NonAuthentifie();
  return utilisateur;
}

/** Exige une session valide portant l'un des rôles demandés. */
export async function exigerRole(...roles: Role[]): Promise<UtilisateurConnecte> {
  const utilisateur = await exigerUtilisateur();
  if (!roles.some((r) => utilisateur.roles.includes(r))) throw new Interdit();
  return utilisateur;
}
