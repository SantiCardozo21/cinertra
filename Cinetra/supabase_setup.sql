-- ============================================================
-- CINETRA — Script SQL para Supabase
-- Ejecutá esto en Supabase → SQL Editor → New Query
-- ============================================================

-- TABLA: peliculas
CREATE TABLE peliculas (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  titulo            TEXT NOT NULL,
  anio              TEXT,
  genero            TEXT,
  duracion          TEXT,
  plataforma        TEXT,
  sinopsis          TEXT,
  poster_url        TEXT,
  link_reproduccion TEXT NOT NULL
);

-- TABLA: series
CREATE TABLE series (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  titulo          TEXT NOT NULL,
  anio            TEXT,
  genero          TEXT,
  plataforma      TEXT,
  sinopsis        TEXT,
  poster_url      TEXT,
  temporadas      INT DEFAULT 1,
  ultimo_episodio INT DEFAULT 1,
  episodios       JSONB DEFAULT '{}'::jsonb
  -- episodios guarda: { "1": [{ep:1, titulo:"...", link:"..."}, ...], "2": [...] }
);

-- TABLA: anime (misma estructura que series)
CREATE TABLE anime (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  titulo          TEXT NOT NULL,
  anio            TEXT,
  genero          TEXT,
  plataforma      TEXT,
  sinopsis        TEXT,
  poster_url      TEXT,
  temporadas      INT DEFAULT 1,
  ultimo_episodio INT DEFAULT 1,
  episodios       JSONB DEFAULT '{}'::jsonb
);

-- TABLA: canales
CREATE TABLE canales (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  nombre      TEXT NOT NULL,
  siglas      TEXT,
  categoria   TEXT DEFAULT 'entretenimiento',
  color       TEXT DEFAULT '#555555',
  logo_url    TEXT,
  link_stream TEXT NOT NULL
);

-- TABLA: partidos (fútbol)
CREATE TABLE partidos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  equipo_local  TEXT NOT NULL,
  equipo_visit  TEXT NOT NULL,
  sigla_local   TEXT,
  sigla_visit   TEXT,
  color_local   TEXT DEFAULT '#1565C0',
  color_visit   TEXT DEFAULT '#c62828',
  fecha         TIMESTAMPTZ,
  en_vivo       BOOLEAN DEFAULT FALSE,
  goles_local   INT DEFAULT 0,
  goles_visit   INT DEFAULT 0,
  minuto        INT DEFAULT 0,
  proveedores   TEXT[] DEFAULT '{}',
  link_disney   TEXT,
  link_espn     TEXT,
  link_tnt      TEXT,
  link_fox      TEXT,
  link_tyc      TEXT,
  link_dsports  TEXT
);

-- ============================================================
-- PERMISOS (Row Level Security)
-- Permite lectura pública para que Cinetra muestre el contenido
-- Solo escritura desde el admin (que usa la clave anon con control por contraseña)
-- ============================================================

ALTER TABLE peliculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE series    ENABLE ROW LEVEL SECURITY;
ALTER TABLE anime     ENABLE ROW LEVEL SECURITY;
ALTER TABLE canales   ENABLE ROW LEVEL SECURITY;
ALTER TABLE partidos  ENABLE ROW LEVEL SECURITY;

-- Lectura pública (cualquier usuario puede ver el contenido)
CREATE POLICY "Lectura publica peliculas" ON peliculas FOR SELECT USING (true);
CREATE POLICY "Lectura publica series"    ON series    FOR SELECT USING (true);
CREATE POLICY "Lectura publica anime"     ON anime     FOR SELECT USING (true);
CREATE POLICY "Lectura publica canales"   ON canales   FOR SELECT USING (true);
CREATE POLICY "Lectura publica partidos"  ON partidos  FOR SELECT USING (true);

-- Escritura con clave anon (el admin usa esta clave, está protegido por contraseña en la app)
CREATE POLICY "Escritura anon peliculas" ON peliculas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Escritura anon series"    ON series    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Escritura anon anime"     ON anime     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Escritura anon canales"   ON canales   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Escritura anon partidos"  ON partidos  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- DATOS DE EJEMPLO (opcional, podés borrar esto)
-- ============================================================

INSERT INTO canales (nombre, siglas, categoria, color, link_stream) VALUES
  ('A24',      'A24',  'noticias',        '#c62828', 'https://pelisjuanita.com/tv/a24'),
  ('C5N',      'C5N',  'noticias',        '#e53935', 'https://pelisjuanita.com/tv/c5n'),
  ('TN',       'TN',   'noticias',        '#1b5e20', 'https://pelisjuanita.com/tv/tn'),
  ('América',  'AMÉ',  'entretenimiento', '#1565c0', 'https://pelisjuanita.com/tv/america'),
  ('El Trece', 'EL3',  'entretenimiento', '#283593', 'https://pelisjuanita.com/tv/trece'),
  ('Telefe',   'TEL',  'entretenimiento', '#4527a0', 'https://pelisjuanita.com/tv/telefe'),
  ('ESPN',     'ESPN', 'deportes',        '#cc0000', 'https://pelisjuanita.com/tv/espn'),
  ('TyC Sports','TYC', 'deportes',        '#1a6e1a', 'https://pelisjuanita.com/tv/tyc'),
  ('CNN ES',   'CNN',  'internacionales', '#b71c1c', 'https://pelisjuanita.com/tv/cnn');
