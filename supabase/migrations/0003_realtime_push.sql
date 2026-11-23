-- Fase 2: tempo real nas atribuições/notificações e alerta de motorista sem resposta

alter publication supabase_realtime add table notifications;

-- Atribuições enviadas há mais de N minutos sem resposta do motorista (staff)
create or replace function overdue_assignments() returns table (
  assignment_id uuid, ride_id uuid, driver_name text, passenger_name text, scheduled_at timestamptz, sent_at timestamptz
)
language sql stable security invoker as $$
  select a.id, a.ride_id, d.full_name, r.passenger_name, r.scheduled_at, a.sent_at
  from ride_assignments a
  join drivers d on d.id = a.driver_id
  join rides r on r.id = a.ride_id
  where a.status = 'sent'
    and a.sent_at < now() - make_interval(mins => coalesce(
      (select (value #>> '{}')::int from settings where key = 'driver_response_timeout_minutes'), 10))
  order by a.sent_at
  limit 20
$$;
revoke execute on function overdue_assignments from public, anon;
grant execute on function overdue_assignments to authenticated;
