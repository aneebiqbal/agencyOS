-- Enum values are append-only in Postgres; no safe automatic down migration.
alter table app.staff_compensation drop constraint if exists staff_compensation_currency_check;
alter table app.staff_compensation add constraint staff_compensation_currency_check check (currency = 'USD');
