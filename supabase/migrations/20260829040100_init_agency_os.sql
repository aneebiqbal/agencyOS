create schema if not exists app;

create type app.user_role as enum ('owner', 'finance', 'manager', 'employee');
create type app.lead_source as enum ('referral', 'inbound-web', 'outbound', 'marketplace', 'other');
create type app.lead_stage as enum ('new', 'qualified', 'proposal', 'won', 'lost');
create type app.deal_pricing_model as enum ('hourly', 'fixed', 'retainer');
create type app.deal_stage as enum ('open', 'won', 'lost');
create type app.project_status as enum ('draft', 'active', 'completed', 'archived');
create type app.expense_category as enum ('rent', 'software', 'travel', 'other');
create type app.expense_status as enum ('submitted', 'approved', 'reimbursed');
create type app.invoice_status as enum ('draft', 'ready_for_review', 'approved', 'sent', 'paid', 'send_failed');

create or replace function app.current_user_id() returns text language sql stable as $$
  select coalesce(current_setting('app.current_user_id', true), '');
$$;

create or replace function app.current_user_role() returns text language sql stable as $$
  select coalesce(current_setting('app.current_user_role', true), '');
$$;

create or replace function app.current_org_id() returns text language sql stable as $$
  select coalesce(current_setting('app.current_org_id', true), '');
$$;

create table app.organizations (
  id text primary key,
  name text not null,
  created_at_utc timestamptz not null default now(),
  deleted_at_utc timestamptz
);

create table app.employees (
  org_id text not null references app.organizations(id),
  user_id text not null,
  role app.user_role not null,
  manager_user_id text,
  payroll_provider_ref text,
  created_at_utc timestamptz not null default now(),
  deleted_at_utc timestamptz,
  primary key (org_id, user_id),
  foreign key (org_id, manager_user_id) references app.employees(org_id, user_id),
  check (manager_user_id is null or manager_user_id <> user_id)
);

create table app.leads (
  org_id text not null references app.organizations(id),
  id text not null,
  source app.lead_source not null,
  stage app.lead_stage not null,
  value_estimate_cents bigint not null check (value_estimate_cents >= 0 and value_estimate_cents <= 100000000),
  owner_user_id text not null,
  created_at_utc timestamptz not null,
  updated_at_utc timestamptz not null,
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  foreign key (org_id, owner_user_id) references app.employees(org_id, user_id)
);

create table app.projects (
  org_id text not null references app.organizations(id),
  id text not null,
  client_name text not null,
  budget_cents bigint not null check (budget_cents >= 0 and budget_cents <= 500000000),
  billing_model app.deal_pricing_model not null,
  status app.project_status not null,
  created_by_user_id text not null,
  manager_user_id text not null,
  version integer not null default 1 check (version > 0),
  created_at_utc timestamptz not null,
  updated_at_utc timestamptz not null,
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  foreign key (org_id, created_by_user_id) references app.employees(org_id, user_id),
  foreign key (org_id, manager_user_id) references app.employees(org_id, user_id)
);

create table app.deals (
  org_id text not null references app.organizations(id),
  id text not null,
  lead_id text not null,
  pricing_model app.deal_pricing_model not null,
  value_cents bigint not null check (value_cents >= 0 and value_cents <= 500000000),
  stage app.deal_stage not null,
  close_date_utc timestamptz,
  won_by_user_id text,
  project_id text,
  version integer not null default 1 check (version > 0),
  created_at_utc timestamptz not null,
  updated_at_utc timestamptz not null,
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  foreign key (org_id, lead_id) references app.leads(org_id, id),
  foreign key (org_id, won_by_user_id) references app.employees(org_id, user_id),
  foreign key (org_id, project_id) references app.projects(org_id, id)
);

create table app.project_members (
  org_id text not null references app.organizations(id),
  project_id text not null,
  user_id text not null,
  created_at_utc timestamptz not null default now(),
  deleted_at_utc timestamptz,
  primary key (org_id, project_id, user_id),
  foreign key (org_id, project_id) references app.projects(org_id, id),
  foreign key (org_id, user_id) references app.employees(org_id, user_id)
);

create table app.invoices (
  org_id text not null references app.organizations(id),
  id text not null,
  project_id text not null,
  client_name text not null,
  currency text not null default 'USD' check (currency = 'USD'),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  status app.invoice_status not null,
  due_date_utc timestamptz not null,
  issued_at_utc timestamptz not null,
  created_by_user_id text not null,
  send_attempts integer not null default 0 check (send_attempts >= 0),
  last_send_error text,
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  foreign key (org_id, project_id) references app.projects(org_id, id),
  foreign key (org_id, created_by_user_id) references app.employees(org_id, user_id)
);

create table app.time_entries (
  org_id text not null references app.organizations(id),
  id text not null,
  employee_user_id text not null,
  project_id text not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  billable boolean not null,
  description text not null,
  work_date_utc timestamptz not null,
  billed_invoice_id text,
  created_at_utc timestamptz not null,
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  foreign key (org_id, employee_user_id) references app.employees(org_id, user_id),
  foreign key (org_id, project_id) references app.projects(org_id, id),
  foreign key (org_id, billed_invoice_id) references app.invoices(org_id, id)
);

create table app.expenses (
  org_id text not null references app.organizations(id),
  id text not null,
  employee_user_id text not null,
  category app.expense_category not null,
  amount_cents bigint not null check (amount_cents >= 0 and amount_cents <= 5000000),
  approver_user_id text not null,
  receipt_url text not null,
  status app.expense_status not null,
  incurred_at_utc timestamptz not null,
  created_at_utc timestamptz not null,
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  foreign key (org_id, employee_user_id) references app.employees(org_id, user_id),
  foreign key (org_id, approver_user_id) references app.employees(org_id, user_id)
);

create table app.invoice_line_items (
  org_id text not null references app.organizations(id),
  id text not null,
  invoice_id text not null,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_amount_cents bigint not null check (unit_amount_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  foreign key (org_id, invoice_id) references app.invoices(org_id, id)
);

create table app.payroll_runs (
  org_id text not null references app.organizations(id),
  id text not null,
  period_start_utc timestamptz not null,
  period_end_utc timestamptz not null,
  provider_ref_id text not null,
  status text not null check (status in ('pending', 'completed', 'failed')),
  total_cost_cents bigint not null check (total_cost_cents >= 0),
  created_at_utc timestamptz not null default now(),
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  check (period_start_utc <= period_end_utc)
);

create table app.performance_snapshots (
  org_id text not null references app.organizations(id),
  id text not null,
  employee_user_id text not null,
  period_start_utc timestamptz not null,
  period_end_utc timestamptz not null,
  utilization_percent numeric(5,2) not null check (utilization_percent >= 0 and utilization_percent <= 100),
  on_time_delivery_percent numeric(5,2) not null check (on_time_delivery_percent >= 0 and on_time_delivery_percent <= 100),
  attributable_revenue_cents bigint not null check (attributable_revenue_cents >= 0),
  created_at_utc timestamptz not null,
  deleted_at_utc timestamptz,
  primary key (org_id, id),
  foreign key (org_id, employee_user_id) references app.employees(org_id, user_id),
  check (period_start_utc <= period_end_utc)
);

create table app.audit_log_entries (
  org_id text not null references app.organizations(id),
  id text not null,
  actor_user_id text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  before_json jsonb,
  after_json jsonb,
  timestamp_utc timestamptz not null,
  deleted_at_utc timestamptz,
  primary key (org_id, id)
);

create table app.idempotency_keys (
  org_id text not null references app.organizations(id),
  endpoint text not null,
  idempotency_key text not null,
  actor_user_id text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at_utc timestamptz not null default now(),
  deleted_at_utc timestamptz,
  primary key (org_id, endpoint, idempotency_key)
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agency_app_role') then
    create role agency_app_role nologin;
  end if;
end
$$;
grant usage on schema app to agency_app_role;
grant select, insert, update on all tables in schema app to agency_app_role;
revoke delete on all tables in schema app from agency_app_role;
grant agency_app_role to current_user;

alter table app.audit_log_entries enable row level security;
alter table app.audit_log_entries force row level security;
alter table app.leads enable row level security;
alter table app.leads force row level security;
alter table app.deals enable row level security;
alter table app.deals force row level security;
alter table app.projects enable row level security;
alter table app.projects force row level security;
alter table app.project_members enable row level security;
alter table app.project_members force row level security;
alter table app.time_entries enable row level security;
alter table app.time_entries force row level security;
alter table app.expenses enable row level security;
alter table app.expenses force row level security;
alter table app.invoices enable row level security;
alter table app.invoices force row level security;
alter table app.invoice_line_items enable row level security;
alter table app.invoice_line_items force row level security;
alter table app.payroll_runs enable row level security;
alter table app.payroll_runs force row level security;
alter table app.performance_snapshots enable row level security;
alter table app.performance_snapshots force row level security;
alter table app.employees enable row level security;
alter table app.employees force row level security;
alter table app.idempotency_keys enable row level security;
alter table app.idempotency_keys force row level security;

create policy employees_org_scope on app.employees
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

create policy leads_access on app.leads
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

create policy deals_access on app.deals
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

create policy projects_select_access on app.projects
  for select using (
    org_id = app.current_org_id()
    and (
      app.current_user_role() in ('owner', 'finance')
      or manager_user_id = app.current_user_id()
      or exists (
        select 1 from app.project_members pm
        where pm.org_id = projects.org_id
          and pm.project_id = projects.id
          and pm.user_id = app.current_user_id()
          and pm.deleted_at_utc is null
      )
    )
  );

create policy projects_mutation_access on app.projects
  for all using (
    org_id = app.current_org_id()
    and (
      app.current_user_role() in ('owner', 'finance')
      or manager_user_id = app.current_user_id()
      or exists (
        select 1 from app.project_members pm
        where pm.org_id = projects.org_id
          and pm.project_id = projects.id
          and pm.user_id = app.current_user_id()
          and pm.deleted_at_utc is null
      )
    )
  )
  with check (org_id = app.current_org_id());

create policy project_members_access on app.project_members
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

create policy time_entries_access on app.time_entries
  using (
    org_id = app.current_org_id()
    and (
      app.current_user_role() in ('owner', 'finance', 'manager')
      or employee_user_id = app.current_user_id()
    )
  )
  with check (
    org_id = app.current_org_id()
    and (
      app.current_user_role() in ('owner', 'finance', 'manager')
      or employee_user_id = app.current_user_id()
    )
  );

create policy expenses_access on app.expenses
  using (
    org_id = app.current_org_id()
    and (
      app.current_user_role() in ('owner', 'finance', 'manager')
      or employee_user_id = app.current_user_id()
    )
  )
  with check (
    org_id = app.current_org_id()
    and (
      app.current_user_role() in ('owner', 'finance', 'manager')
      or employee_user_id = app.current_user_id()
    )
  );

create policy invoices_access on app.invoices
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

create policy invoice_line_items_access on app.invoice_line_items
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

create policy payroll_runs_finance_only on app.payroll_runs
  using (org_id = app.current_org_id() and app.current_user_role() in ('owner', 'finance'))
  with check (org_id = app.current_org_id() and app.current_user_role() in ('owner', 'finance'));

create policy performance_access on app.performance_snapshots
  using (
    org_id = app.current_org_id() and (
      app.current_user_role() in ('owner', 'finance')
      or employee_user_id = app.current_user_id()
      or exists (
        select 1 from app.employees e
        where e.org_id = performance_snapshots.org_id
          and e.user_id = performance_snapshots.employee_user_id
          and e.manager_user_id = app.current_user_id()
      )
    )
  )
  with check (org_id = app.current_org_id());

create policy audit_logs_finance_owner on app.audit_log_entries
  for select using (org_id = app.current_org_id() and app.current_user_role() in ('owner', 'finance'));

create policy audit_logs_insert on app.audit_log_entries
  for insert with check (org_id = app.current_org_id());

create policy idempotency_access on app.idempotency_keys
  using (org_id = app.current_org_id() and actor_user_id = app.current_user_id())
  with check (org_id = app.current_org_id() and actor_user_id = app.current_user_id());

revoke update, delete on app.audit_log_entries from public;
revoke update, delete on app.audit_log_entries from agency_app_role;
