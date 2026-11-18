-- شغّل الملف ده مرة واحدة في SQL Editor (بعد update3.sql)
create or replace function touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

alter table entries add column if not exists updated_at timestamptz;
create trigger t_entries before update on entries for each row execute function touch();
create policy e_upd on entries for update using (has_perm('direct'));
drop policy if exists pr_upd on projects; create policy pr_upd on projects for update using (has_perm('direct'));
drop policy if exists c_upd on companies; create policy c_upd on companies for update using (has_perm('direct'));

-- فواتير الخامات + أذون الاستلام (نفس جدول عروض الأسعار)
alter table quotes add column if not exists kind text not null default 'quote' check (kind in ('quote','invoice','receipt'));
alter table quotes add column if not exists paid numeric default 0;
alter table quotes add column if not exists note text;
alter table quotes add column if not exists updated_at timestamptz;
create trigger t_quotes before update on quotes for each row execute function touch();
create policy q_upd on quotes for update using (has_perm('direct'));

-- مستحقات الشركات والدفعات
create table if not exists company_dues(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  title text not null, amount numeric not null default 0, due_date date not null default current_date,
  note text, image_path text, created_by uuid default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz);
create table if not exists due_payments(
  id uuid primary key default gen_random_uuid(),
  due_id uuid not null references company_dues on delete cascade,
  amount numeric not null, method text not null default 'cash' check (method in ('cash','cheque')),
  pay_date date not null default current_date, note text, image_path text,
  created_by uuid default auth.uid(), created_at timestamptz default now(), updated_at timestamptz);
create trigger t_dues before update on company_dues for each row execute function touch();
create trigger t_pays before update on due_payments for each row execute function touch();
alter table company_dues enable row level security;
alter table due_payments enable row level security;
create policy d_sel on company_dues for select using (has_perm('view'));
create policy d_ins on company_dues for insert with check (has_perm('direct'));
create policy d_upd on company_dues for update using (has_perm('direct'));
create policy d_del on company_dues for delete using (is_admin());
create policy dp_sel on due_payments for select using (has_perm('view'));
create policy dp_ins on due_payments for insert with check (has_perm('direct'));
create policy dp_upd on due_payments for update using (has_perm('direct'));
create policy dp_del on due_payments for delete using (is_admin());

-- طلبات التعديل
alter table requests drop constraint if exists requests_kind_check;
alter table requests add constraint requests_kind_check check (kind in ('entry','delete_entry','edit_entry'));
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
  elsif r.kind = 'edit_entry' then
    update entries set type=p->>'type', title=p->>'title', qty=nullif(p->>'qty','')::numeric, unit=p->>'unit',
      amount=coalesce(nullif(p->>'amount','')::numeric,0), note=p->>'note', image_path=coalesce(p->>'image_path',image_path),
      details=nullif(p->'details','null'::jsonb) where id=(p->>'entry_id')::uuid;
  else
    delete from entries where id = (p->>'entry_id')::uuid;
  end if;
  update requests set status='approved', decided_by=auth.uid(), decided_at=now() where id = rid;
end $$;
