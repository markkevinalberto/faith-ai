/**
 * Core domain types shared by the database layer, services, AI pipeline and UI.
 * Conventions:
 *  - LocalDate: 'YYYY-MM-DD' calendar date in a named IANA time zone.
 *  - LocalTime: 'HH:mm' 24-hour wall-clock time.
 *  - Instants are UTC ISO-8601 strings ending in 'Z'.
 */

export type LocalDate = string;
export type LocalTime = string;
export type IsoInstant = string;

export type GlucoseUnit = 'mg/dL' | 'mmol/L';
export type WeightUnit = 'kg' | 'lb';
export type TemperatureUnit = 'C' | 'F';

export type VitalType =
  | 'glucose'
  | 'blood_pressure'
  | 'pulse'
  | 'weight'
  | 'temperature'
  | 'spo2'
  | 'custom';

export const GLUCOSE_CONTEXTS = [
  'fasting',
  'before_meal',
  'after_meal',
  'bedtime',
  'overnight',
  'random',
] as const;
export type GlucoseContext = (typeof GLUCOSE_CONTEXTS)[number];

export const BP_CONTEXTS = ['seated_rest', 'standing', 'after_activity', 'clinic', 'other'] as const;
export type BpContext = (typeof BP_CONTEXTS)[number];

export type ReadingSource = 'manual' | 'device' | 'demo';

export const DOSE_STATUSES = ['upcoming', 'taken', 'skipped', 'snoozed', 'unconfirmed'] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

export type MedicationStatus = 'active' | 'paused' | 'stopped';
export type LabStatus = 'scheduled' | 'completed' | 'cancelled';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

export const CONDITION_CATEGORIES = [
  'diabetes_type1',
  'diabetes_type2',
  'prediabetes',
  'gestational_diabetes',
  'hypertension',
  'heart_disease',
  'kidney_disease',
  'high_cholesterol',
  'asthma_copd',
  'other',
] as const;
export type ConditionCategory = (typeof CONDITION_CATEGORIES)[number];

export const TARGET_METRICS = [
  'glucose_fasting',
  'glucose_before_meal',
  'glucose_after_meal',
  'glucose_bedtime',
  'bp_systolic',
  'bp_diastolic',
  'pulse',
  'spo2',
  'weight',
] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export interface Profile {
  id: string;
  displayName: string;
  dateOfBirth: LocalDate | null;
  sex: 'female' | 'male' | 'intersex' | 'unspecified' | null;
  locale: string;
  timezone: string;
  glucoseUnit: GlucoseUnit;
  weightUnit: WeightUnit;
  temperatureUnit: TemperatureUnit;
  emergencyNumber: string | null;
  isDemo: boolean;
  reminderPrivacy: boolean;
  remindersEnabled: boolean;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface Condition {
  id: string;
  profileId: string;
  name: string;
  category: ConditionCategory;
  diagnosedOn: LocalDate | null;
  notes: string | null;
  status: 'active' | 'resolved';
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface ClinicianTarget {
  id: string;
  profileId: string;
  metric: TargetMetric;
  low: number | null;
  high: number | null;
  /** Canonical unit: mg/dL for glucose, mmHg, bpm, %, kg. */
  unit: string;
  setBy: string;
  setOn: LocalDate | null;
  notes: string | null;
}

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  strength: string | null;
  form: string | null;
  doseInstructions: string;
  prescriber: string | null;
  startDate: LocalDate;
  endDate: LocalDate | null;
  status: MedicationStatus;
  asNeeded: boolean;
  refillSupplyCount: number | null;
  refillUnitsPerDose: number | null;
  refillThresholdDays: number | null;
  refillReminderDate: LocalDate | null;
  supplyUpdatedAt: IsoInstant | null;
  notes: string | null;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export interface MedicationSchedule {
  id: string;
  profileId: string;
  medicationId: string;
  timeOfDay: LocalTime;
  /** 0 = Sunday … 6 = Saturday. Empty = every day. */
  daysOfWeek: number[];
  doseLabel: string | null;
  active: boolean;
}

export interface DoseEvent {
  id: string;
  profileId: string;
  medicationId: string;
  scheduleId: string | null;
  scheduledFor: IsoInstant;
  localDate: LocalDate;
  localTime: LocalTime;
  timezone: string;
  status: DoseStatus;
  statusChangedAt: IsoInstant;
  statusActor: 'user' | 'system';
  snoozedUntil: IsoInstant | null;
  takenAt: IsoInstant | null;
  note: string | null;
}

export interface VitalReading {
  id: string;
  profileId: string;
  type: VitalType;
  customTypeId: string | null;
  value: number | null;
  unit: string;
  valueCanonical: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  measuredAt: IsoInstant;
  timezone: string;
  utcOffsetMin: number;
  context: string | null;
  source: ReadingSource;
  notes: string | null;
  createdAt: IsoInstant;
}

export interface CustomVitalType {
  id: string;
  profileId: string;
  name: string;
  unit: string;
  decimals: number;
}

export interface LabTest {
  id: string;
  profileId: string;
  name: string;
  orderedBy: string | null;
  location: string | null;
  scheduledAt: IsoInstant | null;
  timezone: string | null;
  fastingRequired: boolean;
  preparationNotes: string | null;
  status: LabStatus;
  completedAt: IsoInstant | null;
  reminderMinutesBefore: number | null;
  notes: string | null;
  createdAt: IsoInstant;
}

export interface LabResult {
  id: string;
  profileId: string;
  labTestId: string;
  analyte: string;
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  referenceText: string | null;
  labFlag: string | null;
  resultDate: LocalDate;
  notes: string | null;
}

export interface Appointment {
  id: string;
  profileId: string;
  title: string;
  clinician: string | null;
  location: string | null;
  startsAt: IsoInstant;
  timezone: string;
  durationMin: number | null;
  status: AppointmentStatus;
  reminderMinutesBefore: number | null;
  preparationNotes: string | null;
  questions: string | null;
  notes: string | null;
  createdAt: IsoInstant;
}

export interface DocumentRecord {
  id: string;
  profileId: string;
  labTestId: string | null;
  appointmentId: string | null;
  title: string;
  relativePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: IsoInstant;
}
