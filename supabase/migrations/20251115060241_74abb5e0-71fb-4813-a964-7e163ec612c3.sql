-- ===============================
-- 1. BLOCKS TABLE
-- ===============================
CREATE TABLE public.blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_name  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
) TABLESPACE pg_default;


-- ===============================
-- 2. LOT POLYGONS TABLE
-- ===============================
CREATE TABLE public.lot_polygons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinates   jsonb NOT NULL,
  centroid_lat  real NOT NULL,
  centroid_lng  real NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
) TABLESPACE pg_default;


-- ===============================
-- 3. LOTS TABLE
-- ===============================
CREATE TABLE public.lots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number   text NOT NULL,
  polygon_id   uuid NOT NULL,
  block_id     uuid NULL,
  is_available boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lots_lot_number_block_id_key UNIQUE (lot_number, block_id),

  CONSTRAINT lots_block_id_fkey
    FOREIGN KEY (block_id)
    REFERENCES public.blocks (id)
    ON DELETE RESTRICT,

  CONSTRAINT lots_polygon_id_fkey
    FOREIGN KEY (polygon_id)
    REFERENCES public.lot_polygons (id)
    ON DELETE RESTRICT
) TABLESPACE pg_default;


-- ===============================
-- 4. USER PROFILES TABLE
-- ===============================
CREATE TABLE public.user_profiles (
  id           uuid PRIMARY KEY,
  first_name   text NOT NULL,
  last_name    text NOT NULL,
  phone_number text NULL,
  email        text NULL,

  CONSTRAINT user_profiles_id_fkey
    FOREIGN KEY (id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE
) TABLESPACE pg_default;


-- ===============================
-- 5. USER ROLES TABLE
-- ===============================
CREATE TABLE public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  role       public.app_role NOT NULL,
  created_at timestamptz DEFAULT now(),

  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role),

  CONSTRAINT user_roles_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users (id)
    ON DELETE CASCADE
) TABLESPACE pg_default;
