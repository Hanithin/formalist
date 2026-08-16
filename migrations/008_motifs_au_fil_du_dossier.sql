-- Les motifs de renvoi, remis au fil du dossier.
--
-- Le motif saisi par l'avocat - « Que doit reprendre le client ? » - ne partait que
-- dans le journal d'audit, que le client ne voit pas. L'avis lui disait pourtant « le
-- détail est dans votre messagerie », où rien n'était écrit : il apprenait qu'on lui
-- demandait quelque chose sans pouvoir savoir quoi.
--
-- Le code écrit désormais ce message au moment du renvoi. Reste les dossiers renvoyés
-- avant : leur fil est vide, et le bouton « Voir ce qui est demandé » mène à une page
-- blanche. On les rattrape depuis le journal, qui a tout gardé.
--
-- Les messages reprennent la date du geste, non celle de la migration : un motif de
-- mars ne doit pas remonter en tête du fil comme s'il venait d'arriver.
--
-- Et ils arrivent lus, sauf sur les dossiers encore en attente d'être repris. Non lus,
-- ils auraient pris le bandeau d'accueil de chaque client - « Maître X vous demande
-- une correction » pour un dossier immatriculé depuis six mois - et ce bandeau, qui ne
-- montre qu'une chose à la fois, aurait masqué le geste réellement attendu.
--
-- DISTINCT ON dédoublonne à l'intérieur même de l'insertion : NOT EXISTS ne voit que
-- l'état d'avant la requête, et deux renvois au motif identique passeraient tous deux.

INSERT INTO messages (formalite_id, sender_id, content, kind, read, created_at)
SELECT DISTINCT ON (a.formalite_id, btrim(a.comment))
  a.formalite_id,
  a.actor_id,
  btrim(a.comment),
  CASE WHEN a.action = 'etat_rejete' THEN 'rejection' ELSE 'correction_request' END,
  f.status NOT IN ('corrections_demandees', 'rejete'),
  a.created_at
FROM audit_log a
JOIN formalites f ON f.id = a.formalite_id
WHERE a.actor_id IS NOT NULL
  AND a.action IN ('etat_corrections_demandees', 'etat_rejete')
  AND a.comment IS NOT NULL
  AND btrim(a.comment) <> ''
  -- Ni celui qu'une exécution précédente a déjà posé, ni celui que le code a écrit.
  AND NOT EXISTS (
    SELECT 1
    FROM messages m
    WHERE m.formalite_id = a.formalite_id
      AND m.kind IN ('correction_request', 'rejection')
      AND m.content = btrim(a.comment)
  )
ORDER BY a.formalite_id, btrim(a.comment), a.created_at DESC;
