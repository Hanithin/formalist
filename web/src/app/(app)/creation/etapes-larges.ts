/**
 * Les étapes qui prennent toute la largeur.
 *
 * Trois tarifs côte à côte dans une colonne de sept cent trente pixels laissent cent
 * quatre-vingt-dix pixels par carte : « Démarrez votre entreprise en quelques clics »
 * s'y coupait sur quatre lignes, et le prix arrivait avant qu'on ait lu ce qu'il
 * achète. Le récapitulatif, lui, n'aide pas à choisir un forfait : il dit ce qu'on a
 * saisi, non ce qu'on achète.
 *
 * Ce module ne porte pas « use client » : la page, qui est rendue au serveur, pose la
 * classe de la grille et ne peut pas lire une valeur exportée d'un module client - elle
 * n'en recevrait qu'une référence.
 */
export const ETAPES_PLEINE_LARGEUR = ["offres"];
