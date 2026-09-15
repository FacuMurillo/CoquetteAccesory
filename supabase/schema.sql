-- Ejecutar UNA VEZ en el SQL Editor de un proyecto nuevo de Supabase.
begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_users enable row level security;
-- Sin políticas de escritura ni lectura para clientes. Solo SQL Editor puede asignar administradores.
revoke all on public.admin_users from anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admin_users where user_id = (select auth.uid())); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.products (
  id integer generated always as identity primary key,
  nombre text not null check (length(trim(nombre)) between 1 and 100),
  categoria text not null check (categoria in ('Collares', 'Aros', 'Anillos', 'Pulseras')),
  descripcion text not null default '' check (length(descripcion) <= 2000),
  precio numeric(10,2) not null check (precio > 0 and precio <= 99999999),
  stock integer not null default 0 check (stock between 0 and 99999),
  imagen text not null default 'assets/placeholder.svg' check (length(imagen) <= 2048 and (imagen like 'https://%' or imagen like 'assets/%')),
  activo boolean not null default false,
  destacado boolean not null default false,
  nuevo boolean not null default false,
  badge text not null default '' check (badge in ('', 'Nuevo', 'Más vendido')),
  updated_at timestamptz not null default clock_timestamp()
);

create function public.touch_product() returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = clock_timestamp(); return new; end; $$;
create trigger products_updated before update on public.products for each row execute function public.touch_product();
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update on public.products to authenticated;
grant usage, select on sequence public.products_id_seq to authenticated;
create policy "Public reads active products" on public.products for select to anon, authenticated using (activo = true);
create policy "Admins read all products" on public.products for select to authenticated using ((select public.is_admin()));
create policy "Admins create products" on public.products for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update products" on public.products for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
-- No hay borrado permanente desde el panel: se ocultan productos con activo=false.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);
create policy "Admins upload product photos" on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = 'products' and (select public.is_admin()));
-- El bucket es público: las fotos son material del catálogo, incluso de artículos ocultos.
-- Las fotos usan nombres únicos. No se permite sobrescribir ni borrar desde el navegador.
commit;

-- Después de crear la cuenta en Authentication > Users, ejecutar por separado:
-- insert into public.admin_users(user_id) values ('UUID-DE-LA-CUENTA');
