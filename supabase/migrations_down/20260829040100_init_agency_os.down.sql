revoke usage on schema app from agency_app_role;
drop role if exists agency_app_role;

drop table if exists app.sensitive_view_events;
drop table if exists app.confidentiality_acknowledgements;
drop table if exists app.confidentiality_notice_versions;
drop table if exists app.user_profiles;
drop table if exists app.revoked_sessions;
drop table if exists app.idempotency_keys;
drop table if exists app.audit_log_entries;
drop table if exists app.performance_snapshots;
drop table if exists app.payroll_runs;
drop table if exists app.invoice_line_items;
drop table if exists app.expenses;
drop table if exists app.time_entries;
drop table if exists app.invoices;
drop table if exists app.project_members;
drop table if exists app.deals;
drop table if exists app.projects;
drop table if exists app.leads;
drop table if exists app.import_batch_rows;
drop table if exists app.import_batches;
drop table if exists app.staff_compensation;
drop table if exists app.staff_members;
drop table if exists app.employees;
drop table if exists app.organizations;

drop function if exists app.current_org_id();
drop function if exists app.current_user_role();
drop function if exists app.current_user_id();

drop type if exists app.import_row_status;
drop type if exists app.invoice_status;
drop type if exists app.expense_status;
drop type if exists app.expense_category;
drop type if exists app.project_status;
drop type if exists app.deal_stage;
drop type if exists app.deal_pricing_model;
drop type if exists app.lead_stage;
drop type if exists app.lead_source;
drop type if exists app.user_role;

drop schema if exists app;
