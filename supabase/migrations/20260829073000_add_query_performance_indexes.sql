create index if not exists employees_user_active_idx
  on app.employees (user_id, deleted_at_utc, created_at_utc);

create index if not exists staff_members_org_active_name_idx
  on app.staff_members (org_id, deleted_at_utc, full_name);

create index if not exists leads_org_active_created_idx
  on app.leads (org_id, deleted_at_utc, created_at_utc desc);

create index if not exists deals_org_active_created_idx
  on app.deals (org_id, deleted_at_utc, created_at_utc desc);

create index if not exists projects_org_active_created_idx
  on app.projects (org_id, deleted_at_utc, created_at_utc desc);

create index if not exists project_members_org_project_active_idx
  on app.project_members (org_id, project_id, deleted_at_utc, user_id);

create index if not exists time_entries_org_active_work_idx
  on app.time_entries (org_id, deleted_at_utc, work_date_utc desc, created_at_utc desc);

create index if not exists expenses_org_active_incurred_idx
  on app.expenses (org_id, deleted_at_utc, incurred_at_utc desc, created_at_utc desc);

create index if not exists invoices_org_active_issued_idx
  on app.invoices (org_id, deleted_at_utc, issued_at_utc desc);

create index if not exists payroll_runs_org_active_period_idx
  on app.payroll_runs (org_id, deleted_at_utc, period_start_utc desc);

create index if not exists performance_org_active_period_idx
  on app.performance_snapshots (org_id, deleted_at_utc, period_start_utc desc);

create index if not exists audit_org_active_time_idx
  on app.audit_log_entries (org_id, deleted_at_utc, timestamp_utc desc);
