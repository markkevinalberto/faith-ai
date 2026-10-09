/**
 * Versioned migrations. Never edit a shipped migration — append a new one.
 *
 * Profile isolation: every child table carries profile_id, and references its parent through a
 * composite (id, profile_id) foreign key, so a row can never point at another person's record.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const V1 = `
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  date_of_birth TEXT,
  sex TEXT CHECK (sex IS NULL OR sex IN ('female','male','intersex','unspecified')),
  locale TEXT NOT NULL,
  timezone TEXT NOT NULL,
  glucose_unit TEXT NOT NULL CHECK (glucose_unit IN ('mg/dL','mmol/L')),
  weight_unit TEXT NOT NULL CHECK (weight_unit IN ('kg','lb')),
  temperature_unit TEXT NOT NULL CHECK (temperature_unit IN ('C','F')),
  emergency_number TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0,1)),
  reminder_privacy INTEGER NOT NULL DEFAULT 1 CHECK (reminder_privacy IN (0,1)),
  reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conditions (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  category TEXT NOT NULL CHECK (category IN ('diabetes_type1','diabetes_type2','prediabetes','gestational_diabetes','hypertension','heart_disease','kidney_disease','high_cholesterol','asthma_copd','other')),
  diagnosed_on TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_conditions_profile ON conditions(profile_id);

CREATE TABLE target_ranges (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('glucose_fasting','glucose_before_meal','glucose_after_meal','glucose_bedtime','bp_systolic','bp_diastolic','pulse','spo2','weight')),
  low REAL,
  high REAL,
  unit TEXT NOT NULL,
  set_by TEXT NOT NULL CHECK (length(trim(set_by)) > 0),
  set_on TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (profile_id, metric),
  CHECK (low IS NOT NULL OR high IS NOT NULL),
  CHECK (low IS NULL OR high IS NULL OR low < high)
);

CREATE TABLE medications (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  strength TEXT,
  form TEXT,
  dose_instructions TEXT NOT NULL DEFAULT '',
  prescriber TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','stopped')),
  as_needed INTEGER NOT NULL DEFAULT 0 CHECK (as_needed IN (0,1)),
  refill_supply_count REAL CHECK (refill_supply_count IS NULL OR refill_supply_count >= 0),
  refill_units_per_dose REAL CHECK (refill_units_per_dose IS NULL OR refill_units_per_dose > 0),
  refill_threshold_days INTEGER CHECK (refill_threshold_days IS NULL OR refill_threshold_days >= 0),
  refill_reminder_date TEXT,
  supply_updated_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, profile_id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_medications_profile ON medications(profile_id, status);

CREATE TABLE medication_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  time_of_day TEXT NOT NULL CHECK (time_of_day GLOB '[0-2][0-9]:[0-5][0-9]'),
  days_of_week TEXT NOT NULL DEFAULT '',
  dose_label TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, profile_id),
  FOREIGN KEY (medication_id, profile_id) REFERENCES medications(id, profile_id) ON DELETE CASCADE
);
CREATE INDEX idx_schedules_medication ON medication_schedules(medication_id, active);

CREATE TABLE medication_events (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  schedule_id TEXT,
  scheduled_for TEXT NOT NULL,
  local_date TEXT NOT NULL,
  local_time TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('upcoming','taken','skipped','snoozed','unconfirmed')),
  status_changed_at TEXT NOT NULL,
  status_actor TEXT NOT NULL CHECK (status_actor IN ('user','system')),
  snoozed_until TEXT,
  taken_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (medication_id, profile_id) REFERENCES medications(id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id, profile_id) REFERENCES medication_schedules(id, profile_id) ON DELETE CASCADE,
  -- A dose can only ever be "taken" by an explicit user action.
  CHECK (status <> 'taken' OR (taken_at IS NOT NULL AND status_actor = 'user')),
  CHECK (status <> 'skipped' OR status_actor = 'user'),
  CHECK (status <> 'snoozed' OR (snoozed_until IS NOT NULL AND status_actor = 'user'))
);
CREATE UNIQUE INDEX idx_events_slot ON medication_events(schedule_id, local_date, local_time) WHERE schedule_id IS NOT NULL;
CREATE INDEX idx_events_profile_time ON medication_events(profile_id, scheduled_for);
CREATE INDEX idx_events_medication_time ON medication_events(medication_id, scheduled_for);

CREATE TABLE custom_vital_types (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
  decimals INTEGER NOT NULL DEFAULT 1 CHECK (decimals BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, profile_id),
  UNIQUE (profile_id, name)
);

CREATE TABLE vital_readings (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('glucose','blood_pressure','pulse','weight','temperature','spo2','custom')),
  custom_type_id TEXT,
  value REAL,
  unit TEXT NOT NULL,
  value_canonical REAL,
  systolic INTEGER,
  diastolic INTEGER,
  pulse INTEGER,
  measured_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  utc_offset_min INTEGER NOT NULL,
  context TEXT,
  source TEXT NOT NULL CHECK (source IN ('manual','device','demo')),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (custom_type_id, profile_id) REFERENCES custom_vital_types(id, profile_id) ON DELETE CASCADE,
  CHECK ((type = 'blood_pressure' AND systolic IS NOT NULL AND diastolic IS NOT NULL AND systolic > diastolic)
      OR (type <> 'blood_pressure' AND value IS NOT NULL AND value_canonical IS NOT NULL)),
  CHECK ((type = 'custom') = (custom_type_id IS NOT NULL))
);
CREATE INDEX idx_readings_profile_type_time ON vital_readings(profile_id, type, measured_at);

CREATE TABLE lab_tests (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  ordered_by TEXT,
  location TEXT,
  scheduled_at TEXT,
  timezone TEXT,
  fasting_required INTEGER NOT NULL DEFAULT 0 CHECK (fasting_required IN (0,1)),
  preparation_notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  completed_at TEXT,
  reminder_minutes_before INTEGER CHECK (reminder_minutes_before IS NULL OR reminder_minutes_before >= 0),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, profile_id)
);
CREATE INDEX idx_lab_tests_profile ON lab_tests(profile_id, scheduled_at);

CREATE TABLE lab_results (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  lab_test_id TEXT NOT NULL,
  analyte TEXT NOT NULL CHECK (length(trim(analyte)) > 0),
  value_num REAL,
  value_text TEXT,
  unit TEXT,
  reference_low REAL,
  reference_high REAL,
  reference_text TEXT,
  lab_flag TEXT,
  result_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lab_test_id, profile_id) REFERENCES lab_tests(id, profile_id) ON DELETE CASCADE,
  CHECK (value_num IS NOT NULL OR value_text IS NOT NULL)
);
CREATE INDEX idx_lab_results_test ON lab_results(lab_test_id);
CREATE INDEX idx_lab_results_profile_analyte ON lab_results(profile_id, analyte, result_date);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  clinician TEXT,
  location TEXT,
  starts_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  duration_min INTEGER CHECK (duration_min IS NULL OR duration_min > 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  reminder_minutes_before INTEGER CHECK (reminder_minutes_before IS NULL OR reminder_minutes_before >= 0),
  preparation_notes TEXT,
  questions TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, profile_id)
);
CREATE INDEX idx_appointments_profile ON appointments(profile_id, starts_at);

CREATE TABLE documents (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lab_test_id TEXT,
  appointment_id TEXT,
  title TEXT NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lab_test_id, profile_id) REFERENCES lab_tests(id, profile_id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id, profile_id) REFERENCES appointments(id, profile_id) ON DELETE CASCADE
);
CREATE INDEX idx_documents_profile ON documents(profile_id);

CREATE TABLE reminder_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('dose','refill','appointment','lab','window_refresh')),
  entity_id TEXT,
  fire_at TEXT NOT NULL,
  notification_id TEXT,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled','cancelled','failed')),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_reminder_jobs_profile ON reminder_jobs(profile_id, status);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  at TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX idx_audit_profile_time ON audit_events(profile_id, at);
`;

export const MIGRATIONS: Migration[] = [{ version: 1, name: 'initial_schema', sql: V1 }];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Every table holding a profile's health data (used by export, deletion and isolation tests). */
export const PROFILE_SCOPED_TABLES = [
  'conditions',
  'target_ranges',
  'medications',
  'medication_schedules',
  'medication_events',
  'custom_vital_types',
  'vital_readings',
  'lab_tests',
  'lab_results',
  'appointments',
  'documents',
  'reminder_jobs',
  'audit_events',
] as const;
