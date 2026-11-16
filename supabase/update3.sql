-- شغّل الملف ده مرة واحدة في SQL Editor (بعد update2.sql)
create table if not exists companies(
  id uuid primary key default gen_random_uuid(), name text not null, phone text, address text, note text,
  created_by uuid default auth.uid(), created_at timestamptz default now());
alter table projects add column if not exists company_id uuid references companies on delete set null;

alter table entries drop constraint if exists entries_type_check;
alter table entries add constraint entries_type_check check (type in
 ('extract','material_in','material_out','labor','expense','income','cheque_in','cheque_out','transport'));

-- ملفات للقراءة فقط: مستخلصات خارجية + فواتير مشتريات (لا يوجد تعديل، الحذف للأدمن فقط)
create table if not exists files(
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('external_extract','bill')),
  project_id uuid references projects on delete cascade, company_id uuid references companies on delete cascade,
  title text not null, amount numeric, doc_date date default current_date,
  file_path text not null, file_name text,
  uploaded_by uuid default auth.uid(), created_at timestamptz default now());

-- طلبات الموافقة
create table if not exists requests(
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('entry','delete_entry')),
  project_id uuid references projects on delete cascade, payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid default auth.uid() references profiles(id) on delete set null,
  reason text, decided_by uuid, decided_at timestamptz, created_at timestamptz default now());

alter table companies enable row level security;
alter table files enable row level security;
alter table requests enable row level security;
create policy c_sel on companies for select using (has_perm('view'));
create policy c_ins on companies for insert with check (has_perm('create_project'));
create policy c_upd on companies for update using (is_admin());
create policy c_del on companies for delete using (is_admin());
create policy f_sel on files for select using (has_perm('view'));
create policy f_ins on files for insert with check (has_perm('add'));
create policy f_del on files for delete using (is_admin());
create policy r_sel on requests for select using (requested_by = auth.uid() or is_admin());
create policy r_ins on requests for insert with check (has_perm('add') and requested_by = auth.uid());

-- الإضافة المباشرة للسجلات: الأدمن أو من عنده صلاحية direct. الحذف: الأدمن فقط
drop policy if exists e_ins on entries;
create policy e_ins on entries for insert with check (has_perm('direct'));
drop policy if exists e_del on entries;
create policy e_del on entries for delete using (is_admin());

create or replace function approve_request(rid uuid) returns void language plpgsql security definer
set search_path = public as $$
declare r requests; p jsonb;
begin
  if not is_admin() then raise exception 'غير مسموح'; end if;
  select * into r from requests where id = rid and status = 'pending';
  if not found then raise exception 'الطلب غير موجود أو تم البت فيه'; end if;
  p := r.payload;
  if r.kind = 'entry' then
    insert into entries(project_id,type,title,qty,unit,amount,note,image_path,details,created_by)
    values(r.project_id,p->>'type',p->>'title',nullif(p->>'qty','')::numeric,p->>'unit',
      coalesce(nullif(p->>'amount','')::numeric,0),p->>'note',p->>'image_path',nullif(p->'details','null'::jsonb),r.requested_by);
  else
    delete from entries where id = (p->>'entry_id')::uuid;
  end if;
  update requests set status='approved', decided_by=auth.uid(), decided_at=now() where id = rid;
end $$;

create or replace function reject_request(rid uuid, why text) returns void language plpgsql security definer
set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مسموح'; end if;
  update requests set status='rejected', reason=why, decided_by=auth.uid(), decided_at=now() where id = rid and status='pending';
end $$;
