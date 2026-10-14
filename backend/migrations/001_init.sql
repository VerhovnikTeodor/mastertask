-- MasterTask: začetna shema
-- Zahteva PostgreSQL 13+ (gen_random_uuid je vgrajen).

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Uporabniki ---------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          varchar(254) NOT NULL,
  password_hash  varchar(100) NOT NULL,
  first_name     varchar(80)  NOT NULL CHECK (length(btrim(first_name)) > 0),
  last_name      varchar(80)  NOT NULL CHECK (length(btrim(last_name)) > 0),
  job_title      varchar(120),
  role           varchar(16)  NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  avatar_color   varchar(7)   NOT NULL DEFAULT '#3E63DD' CHECK (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active      boolean      NOT NULL DEFAULT true,
  preferences    jsonb        NOT NULL DEFAULT '{}'::jsonb,
  token_version  integer      NOT NULL DEFAULT 0,
  last_login_at  timestamptz,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE login_attempts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       varchar(254) NOT NULL,
  ip          varchar(64),
  succeeded   boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts (lower(email), created_at DESC);
CREATE INDEX login_attempts_ip_idx ON login_attempts (ip, created_at DESC);

-- Projekti -----------------------------------------------------------------
CREATE TABLE projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           varchar(6)   NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9]{1,5}$'),
  name          varchar(120) NOT NULL CHECK (length(btrim(name)) > 0),
  description   text         NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  status        varchar(16)  NOT NULL DEFAULT 'active'
                CHECK (status IN ('planning', 'active', 'on_hold', 'completed')),
  priority      varchar(10)  NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  color         varchar(7)   NOT NULL DEFAULT '#3E63DD' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  start_date    date,
  due_date      date,
  task_counter  integer      NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  archived_at   timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date)
);
CREATE UNIQUE INDEX projects_key_key ON projects (key);
CREATE INDEX projects_archived_idx ON projects (archived_at);
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE project_members (
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role        varchar(10) NOT NULL DEFAULT 'member'
              CHECK (role IN ('owner', 'manager', 'member', 'viewer')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (user_id);
-- Vsak projekt ima natanko enega lastnika.
CREATE UNIQUE INDEX project_members_single_owner ON project_members (project_id) WHERE role = 'owner';

-- Stolpci Kanban table (prilagodljivi statusi) -----------------------------
CREATE TABLE board_columns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        varchar(40) NOT NULL CHECK (length(btrim(name)) > 0),
  category    varchar(12) NOT NULL CHECK (category IN ('todo', 'in_progress', 'done')),
  color       varchar(7)  NOT NULL DEFAULT '#8B8D98' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  position    integer     NOT NULL,
  wip_limit   integer CHECK (wip_limit IS NULL OR wip_limit BETWEEN 1 AND 999),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);
CREATE INDEX board_columns_project_idx ON board_columns (project_id, position);

-- Naloge -------------------------------------------------------------------
CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number        integer NOT NULL,
  title         varchar(200) NOT NULL CHECK (length(btrim(title)) > 0),
  description   text NOT NULL DEFAULT '' CHECK (length(description) <= 20000),
  column_id     uuid NOT NULL,
  position      double precision NOT NULL DEFAULT 0,
  priority      varchar(10) NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  start_date    date,
  due_date      date,
  completed_at  timestamptz,
  created_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, number),
  -- Stolpec mora pripadati istemu projektu kot naloga.
  FOREIGN KEY (project_id, column_id) REFERENCES board_columns (project_id, id) ON DELETE RESTRICT,
  CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date)
);
CREATE INDEX tasks_board_idx ON tasks (project_id, column_id, position) WHERE archived_at IS NULL;
CREATE INDEX tasks_due_idx ON tasks (due_date) WHERE archived_at IS NULL AND completed_at IS NULL;
CREATE INDEX tasks_updated_idx ON tasks (updated_at DESC);
CREATE INDEX tasks_column_idx ON tasks (column_id);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE task_assignees (
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX task_assignees_user_idx ON task_assignees (user_id);

CREATE TABLE labels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        varchar(30) NOT NULL CHECK (length(btrim(name)) > 0),
  color       varchar(7)  NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX labels_project_name_key ON labels (project_id, lower(name));

CREATE TABLE task_labels (
  task_id   uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id  uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);
CREATE INDEX task_labels_label_idx ON task_labels (label_id);

CREATE TABLE checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content       varchar(300) NOT NULL CHECK (length(btrim(content)) > 0),
  is_done       boolean NOT NULL DEFAULT false,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklist_items_task_idx ON checklist_items (task_id, position);

CREATE TABLE task_dependencies (
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_by_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, blocked_by_id),
  CHECK (task_id <> blocked_by_id)
);
CREATE INDEX task_dependencies_blocked_by_idx ON task_dependencies (blocked_by_id);

CREATE TABLE comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body        text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 5000),
  edited_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_task_idx ON comments (task_id, created_at);

-- Aktivnost, obvestila, shranjeni pogledi ----------------------------------
CREATE TABLE activity_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id     uuid REFERENCES tasks(id) ON DELETE SET NULL,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action      varchar(40) NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_project_idx ON activity_log (project_id, created_at DESC);
CREATE INDEX activity_log_task_idx ON activity_log (task_id, created_at DESC) WHERE task_id IS NOT NULL;

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  type        varchar(30) NOT NULL,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id     uuid REFERENCES tasks(id) ON DELETE CASCADE,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE saved_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        varchar(60) NOT NULL CHECK (length(btrim(name)) > 0),
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saved_views_user_name_key ON saved_views (user_id, lower(name));
