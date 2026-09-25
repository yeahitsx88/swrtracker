-- Preserve legacy area/subarea rows and ticket references while giving every
-- historical location an evidence-backed AOR node. No legacy column is dropped.
-- AOR node IDs deliberately equal their source area/subarea IDs, making reruns
-- deterministic without a guessed name match.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM areas a JOIN projects p ON p.id=a.project_id
    WHERE a.tenant_id<>p.tenant_id
      OR btrim(a.name)='' OR length(btrim(a.name))>120
      OR a.code !~ '^[A-Z0-9_-]{1,16}$'
  ) THEN RAISE EXCEPTION 'legacy area has invalid tenant, name, or AOR code'; END IF;

  IF EXISTS (
    SELECT 1 FROM subareas s JOIN areas a ON a.id=s.area_id
    WHERE s.project_id<>a.project_id OR s.tenant_id<>a.tenant_id
      OR btrim(s.name)='' OR length(btrim(s.name))>120
  ) THEN RAISE EXCEPTION 'legacy subarea has invalid project, tenant, or name'; END IF;

  IF EXISTS (SELECT 1 FROM areas a JOIN subareas s ON s.id=a.id) THEN
    RAISE EXCEPTION 'legacy area and subarea UUID collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM area_memberships am
    JOIN areas a ON a.id=am.area_id
    JOIN users u ON u.id=am.user_id
    WHERE am.project_id<>a.project_id OR u.tenant_id<>a.tenant_id
      OR NOT EXISTS (SELECT 1 FROM project_memberships pm
        WHERE pm.project_id=am.project_id AND pm.user_id=am.user_id)
  ) THEN RAISE EXCEPTION 'legacy area membership has mismatched scope'; END IF;

  IF EXISTS (
    SELECT 1 FROM tickets t
    LEFT JOIN areas a ON a.id=t.area_id
    LEFT JOIN subareas s ON s.id=t.subarea_id
    WHERE (t.area_id IS NOT NULL OR t.subarea_id IS NOT NULL)
      AND (t.area_id IS NULL OR t.subarea_id IS NULL
        OR a.id IS NULL OR s.id IS NULL
        OR a.project_id<>t.project_id OR a.tenant_id<>t.tenant_id
        OR s.project_id<>t.project_id OR s.tenant_id<>t.tenant_id
        OR s.area_id<>a.id
        OR (t.aor_node_id IS NOT NULL AND t.aor_node_id<>s.id))
  ) THEN RAISE EXCEPTION 'legacy ticket location cannot be mapped uniquely'; END IF;

  IF EXISTS (
    SELECT project_id,code FROM (
      SELECT a.project_id,a.code FROM areas a
      UNION ALL
      SELECT s.project_id,
        'LS'||left(replace(s.id::text,'-',''),14) AS code FROM subareas s
    ) codes GROUP BY project_id,code HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'legacy AOR code collision'; END IF;

  IF EXISTS (
    SELECT 1 FROM aor_levels l
    JOIN areas a ON a.project_id=l.project_id AND a.tenant_id=l.tenant_id
    WHERE l.depth=0 AND lower(btrim(l.label))<>'area'
  ) THEN RAISE EXCEPTION 'existing AOR depth 0 label is not Area'; END IF;
  IF EXISTS (
    SELECT 1 FROM aor_levels l
    JOIN subareas s ON s.project_id=l.project_id AND s.tenant_id=l.tenant_id
    WHERE l.depth=1 AND lower(btrim(l.label))<>'subarea'
  ) THEN RAISE EXCEPTION 'existing AOR depth 1 label is not Subarea'; END IF;

  IF EXISTS (
    SELECT 1 FROM areas a JOIN aor_nodes n ON n.id=a.id
    JOIN aor_levels l ON l.id=n.level_id
    WHERE n.project_id<>a.project_id OR n.tenant_id<>a.tenant_id
      OR n.parent_id IS NOT NULL OR l.depth<>0
      OR n.name<>a.name OR n.code<>a.code OR n.retired_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'existing AOR node conflicts with legacy area ID'; END IF;
  IF EXISTS (
    SELECT 1 FROM subareas s JOIN aor_nodes n ON n.id=s.id
    JOIN aor_levels l ON l.id=n.level_id
    WHERE n.project_id<>s.project_id OR n.tenant_id<>s.tenant_id
      OR n.parent_id<>s.area_id OR l.depth<>1
      OR n.name<>s.name
      OR n.code<>'LS'||left(replace(s.id::text,'-',''),14)
      OR n.retired_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'existing AOR node conflicts with legacy subarea ID'; END IF;
  IF EXISTS (
    SELECT 1 FROM areas a JOIN aor_nodes n
      ON n.project_id=a.project_id AND n.code=a.code AND n.id<>a.id
  ) OR EXISTS (
    SELECT 1 FROM subareas s JOIN aor_nodes n
      ON n.project_id=s.project_id
      AND n.code='LS'||left(replace(s.id::text,'-',''),14)
      AND n.id<>s.id
  ) THEN RAISE EXCEPTION 'existing AOR code belongs to another node'; END IF;
END $$;

INSERT INTO aor_levels(id,project_id,tenant_id,depth,label)
SELECT gen_random_uuid(),a.project_id,a.tenant_id,0,'Area'
FROM areas a GROUP BY a.project_id,a.tenant_id
ON CONFLICT (project_id,depth) DO NOTHING;

INSERT INTO aor_levels(id,project_id,tenant_id,depth,label)
SELECT gen_random_uuid(),s.project_id,s.tenant_id,1,'Subarea'
FROM subareas s GROUP BY s.project_id,s.tenant_id
ON CONFLICT (project_id,depth) DO NOTHING;

INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,parent_id,
  name,code,created_at)
SELECT a.id,a.project_id,a.tenant_id,l.id,NULL,a.name,a.code,a.created_at
FROM areas a JOIN aor_levels l ON l.project_id=a.project_id
  AND l.tenant_id=a.tenant_id AND l.depth=0
ON CONFLICT (id) DO NOTHING;

INSERT INTO aor_nodes(id,project_id,tenant_id,level_id,parent_id,
  name,code,created_at)
SELECT s.id,s.project_id,s.tenant_id,l.id,s.area_id,s.name,
  'LS'||left(replace(s.id::text,'-',''),14),s.created_at
FROM subareas s JOIN aor_levels l ON l.project_id=s.project_id
  AND l.tenant_id=s.tenant_id AND l.depth=1
ON CONFLICT (id) DO NOTHING;

-- Historical ticket origin IDs remain populated; new tickets must use AOR only.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_location_source_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_location_source_check CHECK (
  (status='DRAFT' AND area_id IS NULL AND subarea_id IS NULL)
  OR (aor_node_id IS NOT NULL
    AND ((area_id IS NULL AND subarea_id IS NULL)
      OR (area_id IS NOT NULL AND subarea_id IS NOT NULL)))
) NOT VALID;

UPDATE tickets SET aor_node_id=subarea_id
WHERE subarea_id IS NOT NULL AND aor_node_id IS NULL;

ALTER TABLE tickets VALIDATE CONSTRAINT tickets_location_source_check;

INSERT INTO aor_assignments(id,project_id,tenant_id,aor_node_id,
  user_id,deactivated_at,created_at)
SELECT gen_random_uuid(),am.project_id,a.tenant_id,a.id,am.user_id,
  u.deactivated_at,am.created_at
FROM area_memberships am JOIN areas a ON a.id=am.area_id
JOIN users u ON u.id=am.user_id AND u.tenant_id=a.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM aor_assignments aa
  WHERE aa.project_id=am.project_id AND aa.tenant_id=a.tenant_id
    AND aa.aor_node_id=a.id AND aa.user_id=am.user_id
);

COMMENT ON TABLE areas IS 'Historical location source; application writes use aor_nodes after migration 021';
COMMENT ON TABLE subareas IS 'Historical location source; application writes use aor_nodes after migration 021';
