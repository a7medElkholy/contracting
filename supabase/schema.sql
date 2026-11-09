-- شغّل الملف ده في Supabase > SQL Editor
-- وبعدها: Authentication > Providers > Email > اقفل "Confirm email"
create table profiles(
  id uuid primary key references auth.users on delete cascade,
  full_name text, role text not null default 'user',
  perms text[] not null default '{}', created_at timestamptz default now());

create table projects(
  id uuid primary key default gen_random_uuid(),
  name text not null, client text, location text,
  contract_value numeric default 0,
  created_by uuid default auth.uid(), created_at timestamptz default now());

-- type: extract | material_in | material_out | labor | expense | income
create table entries(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  type text not null check (type in ('extract','material_in','material_out','labor','expense','income')),
  title text not null, qty numeric, unit text,
  amount numeric not null default 0, note text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now());
create index on entries(project_id, created_at desc);

create function is_admin() returns boolean language sql security definer stable set search_path = public as
$$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
create function has_perm(p text) returns boolean language sql security definer stable set search_path = public as
$$ select public.is_admin() or exists(select 1 from public.profiles where id=auth.uid() and p=any(perms)) $$;

-- أول مستخدم يسجل = أدمن تلقائي
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,full_name,role,perms) values(new.id,
    coalesce(new.raw_user_meta_data->>'full_name',new.email),
    case when (select count(*) from public.profiles)=0 then 'admin' else 'user' end,
    case when (select count(*) from public.profiles)=0 then '{}'::text[] else array['view']::text[] end);
  return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

alter table profiles enable row level security;
alter table projects enable row level security;
alter table entries enable row level security;

create policy p_sel on profiles for select using (id=auth.uid() or is_admin());
create policy p_upd on profiles for update using (is_admin());
create policy pr_sel on projects for select using (has_perm('view'));
create policy pr_ins on projects for insert with check (has_perm('create_project'));
create policy pr_upd on projects for update using (is_admin());
create policy pr_del on projects for delete using (is_admin());
create policy e_sel on entries for select using (has_perm('view'));
create policy e_ins on entries for insert with check (has_perm('add'));
create policy e_del on entries for delete using (has_perm('delete'));
-- لا يوجد تعديل على السجلات: كل حاجة بتتسجل بتاريخها ووقتها وتفضل ثابتة
