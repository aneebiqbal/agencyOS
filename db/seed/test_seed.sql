-- TEST-ONLY seed data. Do not run in production.

insert into app.organizations (id, name, deleted_at_utc)
values
  ('org-test-1', 'TEST ORG ONE', null),
  ('org-test-2', 'TEST ORG TWO', null)
on conflict (id) do nothing;

insert into app.employees (org_id, user_id, role, manager_user_id, payroll_provider_ref, deleted_at_utc)
values
  ('org-test-1', 'owner-1', 'owner', null, 'prov-owner-1', null),
  ('org-test-1', 'finance-1', 'finance', 'owner-1', 'prov-finance-1', null),
  ('org-test-1', 'manager-1', 'manager', 'owner-1', 'prov-manager-1', null),
  ('org-test-1', 'employee-1', 'employee', 'manager-1', 'prov-employee-1', null),
  ('org-test-1', 'employee-2', 'employee', 'manager-1', 'prov-employee-2', null),
  ('org-test-2', 'employee-3', 'employee', null, 'prov-employee-3', null)
on conflict (org_id, user_id) do nothing;

insert into app.leads (org_id, id, source, stage, value_estimate_cents, owner_user_id, created_at_utc, updated_at_utc, deleted_at_utc)
values ('org-test-1', 'lead-test-1', 'inbound-web', 'proposal', 150000, 'owner-1', now(), now(), null)
on conflict (org_id, id) do nothing;

insert into app.deals (org_id, id, lead_id, pricing_model, value_cents, stage, close_date_utc, won_by_user_id, project_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
values ('org-test-1', 'deal-test-1', 'lead-test-1', 'hourly', 500000, 'open', null, null, null, 1, now(), now(), null)
on conflict (org_id, id) do nothing;

insert into app.projects (org_id, id, client_name, budget_cents, billing_model, status, created_by_user_id, manager_user_id, version, created_at_utc, updated_at_utc, deleted_at_utc)
values
  ('org-test-1', 'project-test-1', 'TEST CLIENT', 300000, 'hourly', 'active', 'owner-1', 'manager-1', 1, now(), now(), null),
  ('org-test-2', 'project-test-2', 'OTHER ORG PROJECT', 100000, 'hourly', 'active', 'employee-3', 'employee-3', 1, now(), now(), null)
on conflict (org_id, id) do nothing;

insert into app.project_members (org_id, project_id, user_id, created_at_utc, deleted_at_utc)
values
  ('org-test-1', 'project-test-1', 'manager-1', now(), null),
  ('org-test-1', 'project-test-1', 'employee-1', now(), null),
  ('org-test-2', 'project-test-2', 'employee-3', now(), null)
on conflict (org_id, project_id, user_id) do nothing;

insert into app.payroll_runs (org_id, id, period_start_utc, period_end_utc, provider_ref_id, status, total_cost_cents, deleted_at_utc)
values ('org-test-1', 'payroll-summary-test-1', '2026-08-01T00:00:00.000Z', '2026-08-15T23:59:59.999Z', 'provider-run-123', 'completed', 120000, null)
on conflict (org_id, id) do nothing;

insert into app.performance_snapshots (org_id, id, employee_user_id, period_start_utc, period_end_utc, utilization_percent, on_time_delivery_percent, attributable_revenue_cents, created_at_utc, deleted_at_utc)
values ('org-test-1', 'performance-test-1', 'employee-1', '2026-08-01T00:00:00.000Z', '2026-08-15T23:59:59.999Z', 72, 90, 220000, now(), null)
on conflict (org_id, id) do nothing;
