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

INSERT INTO messages (formalite_id, sender_id, content, kind, read, created_at)
SELECT
  a.formalite_id,
  a.actor_id,
  btrim(a.comment),
  'correction_request',
  FALSE,
  a.created_at
FROM audit_log a
WHERE a.formalite_id IS NOT NULL
  AND a.actor_id IS NOT NULL
  AND a.action IN ('etat_corrections_demandees', 'etat_rejete')
  AND a.comment IS NOT NULL
  AND btrim(a.comment) <> ''
  -- Ni deux fois le même motif, ni celui qu'une exécution précédente a déjà posé.
  AND NOT EXISTS (
    SELECT 1
    FROM messages m
    WHERE m.formalite_id = a.formalite_id
      AND m.kind = 'correction_request'
      AND m.content = btrim(a.comment)
  );
