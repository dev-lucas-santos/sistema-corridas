-- Fase 3: bucket privado para comprovantes de pagamento (caminho: <id do fechamento>/<arquivo>)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy receipts_admin_all on storage.objects for all
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());

create policy receipts_driver_read on storage.objects for select
  using (bucket_id = 'receipts' and exists (
    select 1 from public.payment_closings c
    where c.id::text = (storage.foldername(name))[1] and c.driver_id = public.my_driver_id()));
