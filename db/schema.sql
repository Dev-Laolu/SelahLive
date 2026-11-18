-- Neon (Postgres) master library. Server-side access only.
CREATE TABLE IF NOT EXISTS translations (
  id serial PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  language text DEFAULT 'English',
  license text NOT NULL,
  is_public_domain boolean DEFAULT false,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  verse_count int NOT NULL DEFAULT 0,
  pack_url text,
  pack_size int,
  pack_sha256 text,
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS books (
  id serial PRIMARY KEY,
  translation_id int REFERENCES translations ON DELETE CASCADE,
  number int NOT NULL,
  name text NOT NULL,
  abbreviation text
);

CREATE TABLE IF NOT EXISTS verses (
  id bigserial PRIMARY KEY,
  translation_id int REFERENCES translations ON DELETE CASCADE,
  book_number int NOT NULL,
  chapter int NOT NULL,
  verse int NOT NULL,
  text text NOT NULL
);

CREATE INDEX IF NOT EXISTS verses_ref_idx ON verses (translation_id, book_number, chapter, verse);
CREATE INDEX IF NOT EXISTS verses_text_idx ON verses USING gin (to_tsvector('simple', text));

CREATE TABLE IF NOT EXISTS song_packs (
  id serial PRIMARY KEY,
  name text NOT NULL,
  language text DEFAULT 'English',
  license text DEFAULT 'Public domain',
  version int NOT NULL DEFAULT 1,
  song_count int NOT NULL CHECK (song_count >= 20),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'unpublished')),
  pack_url text,
  pack_size int,
  pack_sha256 text,
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS songs (
  id serial PRIMARY KEY,
  pack_id int REFERENCES song_packs ON DELETE CASCADE,
  title text NOT NULL,
  author text,
  language text,
  ccli_number text,
  sections jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS songs_title_idx ON songs USING gin (to_tsvector('simple', title));

CREATE TABLE IF NOT EXISTS releases (
  id serial PRIMARY KEY,
  type text CHECK (type IN ('bible', 'songpack')),
  ref_id text NOT NULL,
  name text NOT NULL,
  version text NOT NULL,
  notes text,
  notification_text text,
  notify boolean DEFAULT true,
  active boolean DEFAULT true,
  published_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  admin_uid text NOT NULL,
  action text NOT NULL,
  target text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);
