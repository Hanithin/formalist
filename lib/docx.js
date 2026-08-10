/**
 * docx.js - point d'entrée conservé pour le serveur d'origine.
 *
 * Le module a été déplacé dans web/src/infrastructure/documents/docx.cjs : Next
 * ne sait pas charger un fichier hors de son projet. On réexporte plutôt que de
 * copier, pour qu'il n'en existe qu'une seule version.
 *
 * Ce fichier disparaît avec le serveur d'origine.
 */
module.exports = require("../web/src/infrastructure/documents/docx.cjs");
