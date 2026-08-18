-- Keep extensions outside the exposed API schema.
alter extension btree_gist set schema extensions;

-- Cover the composite department foreign key used by assignment joins/deletes.
create index membership_assignments_department_fk_idx
  on public.membership_assignments (organization_id, season_id, department_id);
