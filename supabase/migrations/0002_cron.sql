-- Geração diária das corridas recorrentes (03:00 Brasília = 06:00 UTC).
-- Requer a extensão pg_cron (Supabase: Database > Extensions > pg_cron).
create extension if not exists pg_cron;
select cron.schedule('generate-recurring-rides', '0 6 * * *', $$select generate_recurring_rides(7)$$);
