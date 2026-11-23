-- Dados de exemplo. Rode DEPOIS de criar os 3 usuários em Authentication > Users (veja README):
--   admin@base.test, operador@base.test, motorista@base.test  (senha à sua escolha)
update profiles set role='admin', full_name='Admin da Base', active=true where email='admin@base.test';
update profiles set role='operator', full_name='Operadora Maria', active=true where email='operador@base.test';
update profiles set role='driver', full_name='João Motorista', active=true where email='motorista@base.test';

insert into clients (id, legal_name, cnpj, contact_name, email, phone, payment_terms) values
 ('11111111-1111-1111-1111-111111111111','Acme Engenharia Ltda','12.345.678/0001-90','Carla Souza','carla@acme.com.br','(11) 98888-1111','Faturamento mensal, 15 dias'),
 ('22222222-2222-2222-2222-222222222222','Beta Consultoria S.A.','98.765.432/0001-10','Rui Alves','rui@beta.com.br','(11) 97777-2222','Quinzenal, 7 dias'),
 ('33333333-3333-3333-3333-333333333333','Gama Advogados','11.222.333/0001-44','Dra. Helena','helena@gama.adv.br','(11) 96666-3333','À vista');

insert into drivers (id, profile_id, full_name, phone, email, cpf, cnh_number, cnh_expires_on, vehicle_plate, vehicle_model, availability) values
 ('aaaaaaaa-0000-0000-0000-000000000001',(select id from profiles where email='motorista@base.test'),'João Motorista','(11) 95555-0001','motorista@base.test','111.111.111-11','12345678900','2028-05-01','ABC1D23','Toyota Corolla','online'),
 ('aaaaaaaa-0000-0000-0000-000000000002',null,'Pedro Santos','(11) 95555-0002',null,'222.222.222-22','98765432100','2027-09-10','EFG4H56','Honda Civic','online'),
 ('aaaaaaaa-0000-0000-0000-000000000003',null,'Ana Lima','(11) 95555-0003',null,'333.333.333-33','55566677788','2029-01-20','JKL7M89','Hyundai HB20','offline');
insert into driver_payout_settings (driver_id, pix_key, payout_type, payout_percent_bp, payout_fixed_cents) values
 ('aaaaaaaa-0000-0000-0000-000000000001','11955550001','percent',7000,0),
 ('aaaaaaaa-0000-0000-0000-000000000002','pedro@pix.com','percent',7500,0),
 ('aaaaaaaa-0000-0000-0000-000000000003','33333333333','fixed',7000,6000);

insert into rides (client_id, driver_id, passenger_name, passenger_phone, origin, destination, scheduled_at, price_cents, driver_payout_cents, status, notes) values
 ('11111111-1111-1111-1111-111111111111',null,'Fernando Costa','(11) 99111-0001','Av. Paulista, 1000 - SP','Aeroporto de Congonhas',now()+interval '2 hours',8500,5950,'pending','Dois volumes de bagagem'),
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Luciana Prado','(11) 99111-0002','Rua Augusta, 200','Hotel Unique',now()+interval '4 hours',6000,4200,'scheduled',null),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000002','Marcos Teles','(11) 99111-0003','Aeroporto de Guarulhos','Av. Faria Lima, 3000',now()+interval '1 day',18000,13500,'confirmed','Voo LA3040'),
 ('33333333-3333-3333-3333-333333333333',null,'Dra. Helena Gama','(11) 99111-0004','Escritório Gama','Fórum João Mendes',now()+interval '1 day 3 hours',4500,3150,'pending',null),
 ('22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-000000000001','Paulo Ribeiro','(11) 99111-0005','Hotel Maksoud','Beta Consultoria - Vila Olímpia',now()-interval '1 day',5500,3850,'completed',null),
 ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000003','Sandra Dias','(11) 99111-0006','Acme - Matriz','Aeroporto de Viracopos',now()-interval '2 days',32000,6000,'cancelled',null);
update rides set cancelled_reason='Cliente cancelou' where status='cancelled';
update rides set finished_at = scheduled_at + interval '40 minutes' where status='completed';

insert into recurring_rules (client_id, driver_id, passenger_name, passenger_phone, origin, destination, weekdays, pickup_time, price_cents, driver_payout_cents, created_by)
values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Carlos Diretor','(11) 99111-0007','Casa do Carlos - Moema','Acme - Matriz','{1}','07:00',7000,4900,(select id from profiles where email='admin@base.test'));
select generate_recurring_rides(14);
