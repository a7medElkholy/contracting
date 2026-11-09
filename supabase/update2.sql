-- شغّل الملف ده في SQL Editor (بعد schema.sql)
alter table entries drop constraint if exists entries_type_check;
alter table entries add constraint entries_type_check check (type in
 ('extract','material_in','material_out','labor','expense','income','cheque_in','cheque_out'));
alter table entries add column if not exists image_path text;
alter table entries add column if not exists details jsonb;
alter table projects add column if not exists work_type text;

create table if not exists quotes(
  id uuid primary key default gen_random_uuid(), number serial,
  customer text not null, phone text, address text, vat_no text, due_date date,
  items jsonb not null default '[]', discount numeric default 0, addition numeric default 0, vat numeric default 0,
  created_by uuid default auth.uid(), created_at timestamptz default now());
alter table quotes enable row level security;
create policy q_sel on quotes for select using (has_perm('view'));
create policy q_ins on quotes for insert with check (has_perm('add'));
create policy q_del on quotes for delete using (has_perm('delete'));

insert into storage.buckets(id,name,public) values('attachments','attachments',false) on conflict do nothing;
create policy a_sel on storage.objects for select using (bucket_id='attachments' and has_perm('view'));
create policy a_ins on storage.objects for insert with check (bucket_id='attachments' and has_perm('add'));
create policy a_del on storage.objects for delete using (bucket_id='attachments' and has_perm('delete'));

create or replace function admin_delete_user(uid uuid) returns void language plpgsql security definer
set search_path = public, auth as $$ begin
  if not is_admin() then raise exception 'غير مسموح'; end if;
  if uid = auth.uid() then raise exception 'لا يمكنك حذف نفسك'; end if;
  delete from auth.users where id = uid; end $$;
create or replace function admin_set_password(uid uuid, pw text) returns void language plpgsql security definer
set search_path = public, auth, extensions as $$ begin
  if not is_admin() then raise exception 'غير مسموح'; end if;
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now() where id = uid; end $$;
