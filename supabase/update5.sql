-- شغّل مرة واحدة: عمود لإخفاء مستخدم من قائمة المستخدمين
alter table profiles add column if not exists hidden boolean not null default false;

-- إخفاء مستخدم
update profiles set hidden = true where id = (select id from auth.users where email = 'user@example.com');
-- إظهاره تاني
-- update profiles set hidden = false where id = (select id from auth.users where email = 'user@example.com');
