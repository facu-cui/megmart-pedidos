-- Megmart Pedidos · tablas en el mismo proyecto de Supabase que McDash.
-- Antes de correrlo: cambiá el email de la ÚLTIMA línea por el de la cuenta del depósito.
-- Después pegá TODO en Supabase → SQL Editor → New query → Run. Se corre una sola vez.
-- No toca nada de McDash: todas las tablas nuevas empiezan con "megmart_".

-- ───────── Quién puede usar Megmart ─────────
-- Solo las cuentas cuyo email esté en esta lista pueden ver o cambiar pedidos de Megmart.
create table public.megmart_miembros (
  email text primary key check (email = lower(email))
);
alter table public.megmart_miembros enable row level security;
-- (sin permisos: la lista se maneja solo desde el panel de Supabase)

create or replace function public.es_megmart() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.megmart_miembros where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke execute on function public.es_megmart() from public, anon;
grant execute on function public.es_megmart() to authenticated;

-- ───────── Pedidos ─────────
create table public.megmart_pedidos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null default '',
  creado      timestamptz not null default now(),
  creado_por  text not null default ''
);
create index megmart_pedidos_creado_idx on public.megmart_pedidos (creado desc);

-- ───────── Productos de cada pedido ─────────
-- n = unidades en cada etapa: {por sacar, sacadas, limpias/logo, listas}
-- pa / pb = combos con alfombras / bandeja ya sacadas pero sin la otra parte
-- bb / bc = unidades listas embaladas en bolsa / en caja
-- ver = número de versión, para que dos personas no se pisen cambios
create table public.megmart_items (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references public.megmart_pedidos (id) on delete cascade,
  orden            int  not null default 0,
  texto            text not null,
  cant             int  not null check (cant between 1 and 999),
  tipo             text not null check (tipo in ('alf', 'combo', 'ban', 'pro')),
  n                int[] not null check (array_length(n, 1) = 4),
  pa               int  not null default 0 check (pa >= 0),
  pb               int  not null default 0 check (pb >= 0),
  bb               int  not null default 0 check (bb >= 0),
  bc               int  not null default 0 check (bc >= 0),
  agregado         boolean not null default false,
  ver              int  not null default 0,
  actualizado      timestamptz not null default now(),
  actualizado_por  text not null default ''
);
create index megmart_items_pedido_idx on public.megmart_items (pedido_id);

-- ───────── Machete de logos ─────────
create table public.megmart_machete (
  id          uuid primary key default gen_random_uuid(),
  modelo      text not null,
  detalle     text not null,
  actualizado timestamptz not null default now()
);

insert into public.megmart_machete (modelo, detalle) values
  ('BASALT', 'Solo conductor, logo Megmart'),
  ('S10', 'Full logo Chevrolet'),
  ('BOREAL', 'Solo conductor, logo Megmart'),
  ('CAPTIVA', 'Solo conductor, logo Chevrolet +'),
  ('LOGAN SANDERO STEP', 'Solo conductor, logo Megmart'),
  ('SAVEIRO', 'Logo Megmart, solo conductor'),
  ('SPING', 'Full logo Chevrolet'),
  ('STRADA', 'Logo Megmart, conductor'),
  ('CRONOS ARGO', 'Solo conductor, logo Megmart'),
  ('JOLION 2025', 'Solo conductor, logo Megmart'),
  ('TORO DOBLE CAPA', 'Logo Megmart, solo conductor (costado a la derecha)'),
  ('TRACKER', 'Full logo Chevrolet'),
  ('AMAROK DISEÑO NUEVO', 'Solo conductor, logo Megmart'),
  ('FORD TERRITORY', 'Solo conductor, logo Ford (fijarse en WhatsApp)');

-- ───────── Permisos: solo cuentas de la lista de Megmart ─────────
alter table public.megmart_pedidos enable row level security;
alter table public.megmart_items   enable row level security;
alter table public.megmart_machete enable row level security;

create policy "megmart usa pedidos" on public.megmart_pedidos
  for all to authenticated using (public.es_megmart()) with check (public.es_megmart());
create policy "megmart usa items" on public.megmart_items
  for all to authenticated using (public.es_megmart()) with check (public.es_megmart());
create policy "megmart usa machete" on public.megmart_machete
  for all to authenticated using (public.es_megmart()) with check (public.es_megmart());

-- ───────── Crear un pedido con todos sus productos de una vez ─────────
-- (si algo falla no queda un pedido a medias)
create or replace function public.megmart_crear_pedido(
  p_nombre text, p_por text, p_items jsonb, p_creado timestamptz default now()
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  pid uuid;
begin
  insert into megmart_pedidos (nombre, creado, creado_por)
  values (coalesce(p_nombre, ''), coalesce(p_creado, now()), coalesce(p_por, ''))
  returning id into pid;

  insert into megmart_items (pedido_id, orden, texto, cant, tipo, n, pa, pb, bb, bc, agregado, actualizado_por)
  select pid,
         coalesce((e ->> 'orden')::int, 0),
         e ->> 'texto',
         (e ->> 'cant')::int,
         e ->> 'tipo',
         array(select jsonb_array_elements_text(e -> 'n')::int),
         coalesce((e ->> 'pa')::int, 0),
         coalesce((e ->> 'pb')::int, 0),
         coalesce((e ->> 'bb')::int, 0),
         coalesce((e ->> 'bc')::int, 0),
         coalesce((e ->> 'agregado')::boolean, false),
         coalesce(p_por, '')
  from jsonb_array_elements(p_items) as e;

  return pid;
end;
$$;
revoke execute on function public.megmart_crear_pedido(text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.megmart_crear_pedido(text, text, jsonb, timestamptz) to authenticated;

-- ───────── Que los celulares se actualicen solos cuando otro marca algo ─────────
alter table public.megmart_items replica identity full;
alter publication supabase_realtime add table public.megmart_pedidos, public.megmart_items, public.megmart_machete;

-- ───────── Cuenta del depósito ─────────
-- CAMBIÁ este email por el de la cuenta que creaste para Megmart (en minúsculas).
-- Para sumar otra cuenta más adelante, corré solo esta línea con el otro email.
insert into public.megmart_miembros (email) values ('deposito.megmart@ejemplo.com');
