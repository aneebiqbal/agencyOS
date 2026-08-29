create table if not exists app.staff_compensation (
  org_id text not null references app.organizations(id),
  staff_id text not null,
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'contractor')),
  annual_salary_cents bigint,
  hourly_rate_cents bigint,
  currency text not null default 'PKR' check (currency in ('USD', 'PKR')),
  updated_at_utc timestamptz not null default now(),
  deleted_at_utc timestamptz,
  primary key (org_id, staff_id),
  foreign key (org_id, staff_id) references app.staff_members(org_id, staff_id),
  check (annual_salary_cents is not null or hourly_rate_cents is not null)
);

grant select, insert, update on app.staff_compensation to agency_app_role;
revoke delete on app.staff_compensation from agency_app_role;

alter table app.staff_compensation enable row level security;
alter table app.staff_compensation force row level security;

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'app'
       and tablename = 'staff_compensation'
       and policyname = 'org_scoped_staff_comp'
  ) then
    create policy org_scoped_staff_comp
      on app.staff_compensation
      using (org_id = app.current_org_id())
      with check (org_id = app.current_org_id());
  end if;
end
$$;
