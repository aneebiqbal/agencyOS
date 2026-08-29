-- TEST-ONLY seed data. Do not run in production.

insert into app.organizations (id, name, deleted_at_utc)
values ('org-core-1', 'AGENCY CORE ORG', null)
on conflict (id) do nothing;

insert into app.employees (org_id, user_id, role, email, full_name, deleted_at_utc)
values
  ('org-core-1', 'owner-1', 'owner', 'owner@agency.local', 'Owner Account', null),
  ('org-core-1', 'hr-1', 'hr', 'hr@agency.local', 'HR Account', null),
  ('org-core-1', 'cto-1', 'cto', 'cto@agency.local', 'CTO Account', null)
on conflict (org_id, user_id) do nothing;

insert into app.staff_members (org_id, staff_id, full_name, external_code, deleted_at_utc)
values
  ('org-core-1', 'staff-1', 'Jordan Lee', 'EMP-001', null),
  ('org-core-1', 'staff-2', 'Avery Stone', 'EMP-002', null),
  ('org-core-1', 'staff-3', 'Morgan Diaz', 'EMP-003', null)
on conflict (org_id, staff_id) do nothing;

insert into app.confidentiality_notice_versions (version, notice_text, deleted_at_utc)
values ('v1', 'PLACEHOLDER CONFIDENTIALITY NOTICE - REQUIRES LEGAL REVIEW', null)
on conflict (version) do nothing;

insert into app.confidentiality_acknowledgements (org_id, id, user_id, notice_version, acknowledged_at_utc, deleted_at_utc)
values
  ('org-core-1', 'ack-owner-1', 'owner-1', 'v1', now(), null),
  ('org-core-1', 'ack-hr-1', 'hr-1', 'v1', now(), null),
  ('org-core-1', 'ack-cto-1', 'cto-1', 'v1', now(), null)
on conflict (org_id, id) do nothing;
