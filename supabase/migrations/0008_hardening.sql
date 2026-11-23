-- Fase 6: endurecimento. Auditoria das configurações e consulta paginada do log.
create trigger audit_settings after insert or update or delete on settings for each row execute function audit_trigger();

-- Escrita de configurações só com valor numérico positivo para o prazo de resposta do motorista
alter table settings add constraint settings_timeout_valid
  check (key <> 'driver_response_timeout_minutes' or (jsonb_typeof(value) = 'number' and (value #>> '{}')::int between 1 and 240));
