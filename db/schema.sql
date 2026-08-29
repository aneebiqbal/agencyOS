-- Schema reference. Source of truth: supabase/migrations/20260829040100_init_agency_os.sql
-- This file intentionally mirrors core table shapes used by the app.

create schema if not exists app;

create type app.user_role as enum ('owner', 'hr', 'cto');
create type app.lead_source as enum ('linkedin', 'upwork', 'gmail', 'referral', 'inbound-web', 'outbound', 'marketplace', 'other');
create type app.lead_stage as enum ('new', 'qualified', 'proposal', 'won', 'lost');
create type app.deal_pricing_model as enum ('hourly', 'fixed', 'retainer');
create type app.deal_stage as enum ('open', 'won', 'lost');
create type app.project_status as enum ('draft', 'active', 'completed', 'archived');
create type app.expense_category as enum ('rent', 'software', 'travel', 'upwork', 'ai_tools', 'subscriptions', 'other');
create type app.expense_status as enum ('submitted', 'approved', 'reimbursed');
create type app.invoice_status as enum ('draft', 'ready_for_review', 'approved', 'sent', 'paid', 'send_failed');
create type app.import_row_status as enum ('clean', 'flagged', 'skipped', 'imported', 'voided');

create table app.organizations (id text primary key, name text not null, created_at_utc timestamptz not null default now(), deleted_at_utc timestamptz);
create table app.employees (
  org_id text not null references app.organizations(id), user_id text not null, role app.user_role not null, email text not null, full_name text not null,
  created_at_utc timestamptz not null default now(), deleted_at_utc timestamptz, primary key (org_id, user_id), unique (org_id, role)
);
create table app.staff_members (
  org_id text not null references app.organizations(id), staff_id text not null, full_name text not null, external_code text,
  created_at_utc timestamptz not null default now(), deleted_at_utc timestamptz, primary key (org_id, staff_id)
);
create table app.staff_compensation (
  org_id text not null references app.organizations(id), staff_id text not null,
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'contractor')),
  annual_salary_cents bigint, hourly_rate_cents bigint, currency text not null default 'PKR' check (currency in ('USD', 'PKR')),
  updated_at_utc timestamptz not null default now(), deleted_at_utc timestamptz,
  primary key (org_id, staff_id), foreign key (org_id, staff_id) references app.staff_members(org_id, staff_id),
  check (annual_salary_cents is not null or hourly_rate_cents is not null)
);
create table app.import_batches (
  org_id text not null references app.organizations(id), id text not null, importer_user_id text not null,
  source_filename text not null, file_hash_sha256 text not null, force_reimport boolean not null default false,
  total_rows integer not null check (total_rows >= 0), clean_rows integer not null check (clean_rows >= 0),
  flagged_rows integer not null check (flagged_rows >= 0), skipped_rows integer not null check (skipped_rows >= 0),
  imported_rows integer not null check (imported_rows >= 0), status text not null check (status in ('confirmed', 'voided')),
  created_at_utc timestamptz not null default now(), voided_at_utc timestamptz, void_reason text, deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, importer_user_id) references app.employees(org_id, user_id)
);
create table app.import_batch_rows (
  org_id text not null references app.organizations(id), id text not null, batch_id text not null, row_number integer not null check (row_number > 0),
  status app.import_row_status not null, row_kind text not null check (row_kind in ('time_entry', 'expense')), raw_json jsonb not null,
  normalized_json jsonb, flags_json jsonb, created_time_entry_id text, created_expense_id text, created_at_utc timestamptz not null default now(), deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, batch_id) references app.import_batches(org_id, id)
);
create table app.leads (
  org_id text not null references app.organizations(id), id text not null, source app.lead_source not null, stage app.lead_stage not null,
  value_estimate_cents bigint not null check (value_estimate_cents >= 0 and value_estimate_cents <= 100000000), owner_user_id text not null,
  created_at_utc timestamptz not null, updated_at_utc timestamptz not null, deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, owner_user_id) references app.employees(org_id, user_id)
);
create table app.projects (
  org_id text not null references app.organizations(id), id text not null, client_name text not null,
  budget_cents bigint not null check (budget_cents >= 0 and budget_cents <= 500000000), billing_model app.deal_pricing_model not null,
  status app.project_status not null, created_by_user_id text not null, manager_user_id text not null,
  version integer not null default 1 check (version > 0), created_at_utc timestamptz not null, updated_at_utc timestamptz not null, deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, created_by_user_id) references app.employees(org_id, user_id),
  foreign key (org_id, manager_user_id) references app.employees(org_id, user_id)
);
create table app.deals (
  org_id text not null references app.organizations(id), id text not null, lead_id text not null, pricing_model app.deal_pricing_model not null,
  value_cents bigint not null check (value_cents >= 0 and value_cents <= 500000000), stage app.deal_stage not null,
  close_date_utc timestamptz, won_by_user_id text, project_id text, version integer not null default 1 check (version > 0),
  created_at_utc timestamptz not null, updated_at_utc timestamptz not null, deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, lead_id) references app.leads(org_id, id),
  foreign key (org_id, won_by_user_id) references app.employees(org_id, user_id), foreign key (org_id, project_id) references app.projects(org_id, id)
);
create table app.project_members (
  org_id text not null references app.organizations(id), project_id text not null, user_id text not null,
  created_at_utc timestamptz not null default now(), deleted_at_utc timestamptz,
  primary key (org_id, project_id, user_id), foreign key (org_id, project_id) references app.projects(org_id, id),
  foreign key (org_id, user_id) references app.employees(org_id, user_id)
);
create table app.invoices (
  org_id text not null references app.organizations(id), id text not null, project_id text not null, client_name text not null,
  currency text not null default 'USD' check (currency = 'USD'), subtotal_cents bigint not null check (subtotal_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0), total_cents bigint not null check (total_cents >= 0), status app.invoice_status not null,
  due_date_utc timestamptz not null, issued_at_utc timestamptz not null, created_by_user_id text not null,
  send_attempts integer not null default 0 check (send_attempts >= 0), last_send_error text, deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, project_id) references app.projects(org_id, id),
  foreign key (org_id, created_by_user_id) references app.employees(org_id, user_id)
);
create table app.time_entries (
  org_id text not null references app.organizations(id), id text not null, employee_user_id text not null, project_id text not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24), billable boolean not null, description text not null,
  work_date_utc timestamptz not null, billed_invoice_id text, import_batch_id text, voided_at_utc timestamptz, void_reason text,
  created_at_utc timestamptz not null, deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, employee_user_id) references app.staff_members(org_id, staff_id),
  foreign key (org_id, project_id) references app.projects(org_id, id), foreign key (org_id, billed_invoice_id) references app.invoices(org_id, id),
  foreign key (org_id, import_batch_id) references app.import_batches(org_id, id)
);
create table app.expenses (
  org_id text not null references app.organizations(id), id text not null, employee_user_id text not null, category app.expense_category not null,
  amount_cents bigint not null check (amount_cents >= 0 and amount_cents <= 5000000), approver_user_id text not null, receipt_url text not null,
  status app.expense_status not null, incurred_at_utc timestamptz not null, import_batch_id text, voided_at_utc timestamptz, void_reason text,
  created_at_utc timestamptz not null, deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, employee_user_id) references app.staff_members(org_id, staff_id),
  foreign key (org_id, approver_user_id) references app.employees(org_id, user_id), foreign key (org_id, import_batch_id) references app.import_batches(org_id, id)
);
create table app.payroll_runs (
  org_id text not null references app.organizations(id), id text not null, period_start_utc timestamptz not null, period_end_utc timestamptz not null,
  provider_ref_id text not null, status text not null check (status in ('pending', 'completed', 'failed')),
  total_cost_cents bigint not null check (total_cost_cents >= 0), created_at_utc timestamptz not null default now(), deleted_at_utc timestamptz,
  primary key (org_id, id), check (period_start_utc <= period_end_utc)
);
create table app.performance_snapshots (
  org_id text not null references app.organizations(id), id text not null, employee_user_id text not null,
  period_start_utc timestamptz not null, period_end_utc timestamptz not null,
  utilization_percent numeric(5,2) not null check (utilization_percent >= 0 and utilization_percent <= 100),
  on_time_delivery_percent numeric(5,2) not null check (on_time_delivery_percent >= 0 and on_time_delivery_percent <= 100),
  attributable_revenue_cents bigint not null check (attributable_revenue_cents >= 0), created_at_utc timestamptz not null, deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, employee_user_id) references app.staff_members(org_id, staff_id), check (period_start_utc <= period_end_utc)
);
create table app.audit_log_entries (
  org_id text not null references app.organizations(id), id text not null, actor_user_id text not null, action text not null, entity text not null, entity_id text not null,
  before_json jsonb, after_json jsonb, timestamp_utc timestamptz not null, deleted_at_utc timestamptz, primary key (org_id, id)
);
create table app.idempotency_keys (
  org_id text not null references app.organizations(id), endpoint text not null, idempotency_key text not null, actor_user_id text not null,
  response_status integer not null, response_body jsonb not null, created_at_utc timestamptz not null default now(), deleted_at_utc timestamptz,
  primary key (org_id, endpoint, idempotency_key)
);
create table app.revoked_sessions (
  org_id text not null references app.organizations(id), session_jti text not null, user_id text not null,
  revoked_at_utc timestamptz not null default now(), expires_at_utc timestamptz not null, deleted_at_utc timestamptz,
  primary key (org_id, session_jti)
);
create table app.user_profiles (
  org_id text not null references app.organizations(id), user_id text not null, display_name text,
  created_at_utc timestamptz not null default now(), updated_at_utc timestamptz not null default now(), deleted_at_utc timestamptz,
  primary key (org_id, user_id), foreign key (org_id, user_id) references app.employees(org_id, user_id)
);
create table app.confidentiality_notice_versions (version text primary key, notice_text text not null, published_at_utc timestamptz not null default now(), deleted_at_utc timestamptz);
create table app.confidentiality_acknowledgements (
  org_id text not null references app.organizations(id), id text not null, user_id text not null,
  notice_version text not null references app.confidentiality_notice_versions(version), acknowledged_at_utc timestamptz not null default now(), deleted_at_utc timestamptz,
  primary key (org_id, id), foreign key (org_id, user_id) references app.employees(org_id, user_id)
);
create table app.sensitive_view_events (
  org_id text not null references app.organizations(id), id text not null, viewer_user_id text not null, view_key text not null, subject_id text,
  viewed_at_utc timestamptz not null default now(), deleted_at_utc timestamptz, primary key (org_id, id),
  foreign key (org_id, viewer_user_id) references app.employees(org_id, user_id)
);
