alter type app.lead_source add value if not exists 'linkedin';
alter type app.lead_source add value if not exists 'upwork';
alter type app.lead_source add value if not exists 'gmail';

alter type app.expense_category add value if not exists 'upwork';
alter type app.expense_category add value if not exists 'ai_tools';
alter type app.expense_category add value if not exists 'subscriptions';

alter table app.staff_compensation drop constraint if exists staff_compensation_currency_check;
alter table app.staff_compensation add constraint staff_compensation_currency_check check (currency in ('USD', 'PKR'));
