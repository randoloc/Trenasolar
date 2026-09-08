-- ============================================================
-- TreneSolar — Esquema de base de datos para Supabase
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- SERVICIOS ----------
create table if not exists services (
  id text primary key,          -- 'solar' | 'electricidad' | 'automatica'
  name text not null,
  sort_order int not null default 0
);

insert into services (id, name, sort_order) values
  ('solar', 'Energía Solar', 1),
  ('electricidad', 'Electricidad', 2),
  ('automatica', 'Automática', 3)
on conflict (id) do nothing;

-- ---------- CLIENTES ----------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  address text not null,
  notes text,
  referred_by uuid references clients(id),   -- si llegó por una tarjeta digital compartida
  created_at timestamptz not null default now()
);

-- ---------- CITAS ----------
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  service_id text not null references services(id),
  scheduled_date date not null,
  scheduled_time time not null,
  status text not null default 'pendiente'
    check (status in ('pendiente','confirmada','completada','cancelada')),
  job_notes text,
  created_at timestamptz not null default now(),
  unique (scheduled_date, scheduled_time)     -- evita doble reserva en el mismo horario
);

create index if not exists idx_appointments_date on appointments (scheduled_date);

-- ---------- BLOQUEOS DE AGENDA (vacaciones, días llenos, etc.) ----------
create table if not exists blocked_slots (
  id uuid primary key default gen_random_uuid(),
  blocked_date date not null,
  blocked_time time,                          -- null = bloquea el día completo
  reason text
);

-- ---------- RESEÑAS / ACEPTACIÓN DEL CLIENTE ----------
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete set null,
  client_name text not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  approved boolean not null default false,    -- el admin aprueba antes de mostrarla en el sitio
  created_at timestamptz not null default now()
);

-- ============================================================
-- VISTAS PÚBLICAS (solo lo mínimo necesario para el sitio, sin datos personales)
-- ============================================================

-- Horarios ocupados, para pintar el calendario — sin exponer datos del cliente
create or replace view public_booked_slots as
select scheduled_date, scheduled_time
from appointments
where status in ('pendiente','confirmada');

-- Reseñas visibles en el sitio (solo aprobadas)
create or replace view public_reviews as
select id, client_name, rating, comment, created_at
from reviews
where approved = true
order by created_at desc
limit 12;

-- Resumen de estadísticas para el panel admin
create or replace view stats_summary as
select
  (select count(*) from appointments where status = 'completada') as trabajos_completados,
  (select count(*) from appointments where status in ('pendiente','confirmada')) as citas_activas,
  (select round(avg(rating)::numeric, 2) from reviews where approved = true) as calificacion_promedio,
  (select count(*) from reviews where approved = true and rating >= 4) as clientes_satisfechos,
  (select count(*) from reviews where approved = true) as total_resenas,
  (select count(*) from clients where referred_by is not null) as clientes_por_referido;

-- ============================================================
-- SEGURIDAD (Row Level Security)
-- Público (anon) solo puede: crear su cita/cliente, dejar una reseña,
-- y leer disponibilidad + reseñas aprobadas.
-- Todo lo demás requiere sesión de administrador (Supabase Auth).
-- ============================================================

alter table services enable row level security;
alter table clients enable row level security;
alter table appointments enable row level security;
alter table blocked_slots enable row level security;
alter table reviews enable row level security;

-- servicios: lectura pública
create policy "servicios visibles para todos" on services
  for select using (true);

-- clientes: cualquiera puede registrarse al agendar; solo admin lee/edita
create policy "cualquiera puede crear un cliente" on clients
  for insert with check (true);
create policy "solo admin lee clientes" on clients
  for select using (auth.role() = 'authenticated');
create policy "solo admin edita clientes" on clients
  for update using (auth.role() = 'authenticated');
create policy "solo admin elimina clientes" on clients
  for delete using (auth.role() = 'authenticated');

-- citas: cualquiera puede crear una cita; solo admin lee el detalle completo
create policy "cualquiera puede crear una cita" on appointments
  for insert with check (true);
create policy "solo admin lee citas" on appointments
  for select using (auth.role() = 'authenticated');
create policy "solo admin edita citas" on appointments
  for update using (auth.role() = 'authenticated');
create policy "solo admin elimina citas" on appointments
  for delete using (auth.role() = 'authenticated');

-- bloqueos: lectura pública (para pintar el calendario), solo admin escribe
create policy "bloqueos visibles para todos" on blocked_slots
  for select using (true);
create policy "solo admin crea bloqueos" on blocked_slots
  for insert with check (auth.role() = 'authenticated');
create policy "solo admin elimina bloqueos" on blocked_slots
  for delete using (auth.role() = 'authenticated');

-- reseñas: cualquiera puede dejar una reseña; solo ve el detalle completo el admin
create policy "cualquiera puede dejar una reseña" on reviews
  for insert with check (true);
create policy "solo admin lee todas las reseñas" on reviews
  for select using (auth.role() = 'authenticated');
create policy "solo admin aprueba reseñas" on reviews
  for update using (auth.role() = 'authenticated');
create policy "solo admin elimina reseñas" on reviews
  for delete using (auth.role() = 'authenticated');

-- Las vistas heredan RLS de sus tablas base; public_booked_slots y public_reviews
-- solo exponen columnas no sensibles, así que se leen con la política de "select" pública
-- correspondiente (appointments exige auth para SELECT directo, pero la vista no
-- expone client_id ni datos del cliente — para que anon pueda leerla, se define como
-- security_invoker = false, usando el dueño de la vista):
alter view public_booked_slots set (security_invoker = off);
alter view public_reviews set (security_invoker = off);
grant select on public_booked_slots to anon;
grant select on public_reviews to anon;
grant select on stats_summary to authenticated;

-- ============================================================
-- Fin del esquema. Siguiente paso: crea tu usuario admin en
-- Supabase → Authentication → Users → Add user (email + contraseña)
-- y úsalo para entrar en admin.html
-- ============================================================
