/** Row (snake_case) → domain (camelCase) mappers. */
import { parseDaysOfWeek } from '../domain/schedule';
import type {
  Appointment,
  ClinicianTarget,
  Condition,
  CustomVitalType,
  DocumentRecord,
  DoseEvent,
  LabResult,
  LabTest,
  Medication,
  MedicationSchedule,
  Profile,
  VitalReading,
} from '../domain/types';
import { fromBit } from './sql';

/** Rows come untyped from SQLite. */
type Row = Record<string, any>;

export const mapProfile = (r: Row): Profile => ({
  id: r.id,
  displayName: r.display_name,
  dateOfBirth: r.date_of_birth ?? null,
  sex: r.sex ?? null,
  locale: r.locale,
  timezone: r.timezone,
  glucoseUnit: r.glucose_unit,
  weightUnit: r.weight_unit,
  temperatureUnit: r.temperature_unit,
  emergencyNumber: r.emergency_number ?? null,
  isDemo: fromBit(r.is_demo),
  reminderPrivacy: fromBit(r.reminder_privacy),
  remindersEnabled: fromBit(r.reminders_enabled),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapCondition = (r: Row): Condition => ({
  id: r.id,
  profileId: r.profile_id,
  name: r.name,
  category: r.category,
  diagnosedOn: r.diagnosed_on ?? null,
  notes: r.notes ?? null,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapTarget = (r: Row): ClinicianTarget => ({
  id: r.id,
  profileId: r.profile_id,
  metric: r.metric,
  low: r.low ?? null,
  high: r.high ?? null,
  unit: r.unit,
  setBy: r.set_by,
  setOn: r.set_on ?? null,
  notes: r.notes ?? null,
});

export const mapMedication = (r: Row): Medication => ({
  id: r.id,
  profileId: r.profile_id,
  name: r.name,
  strength: r.strength ?? null,
  form: r.form ?? null,
  doseInstructions: r.dose_instructions ?? '',
  prescriber: r.prescriber ?? null,
  startDate: r.start_date,
  endDate: r.end_date ?? null,
  status: r.status,
  asNeeded: fromBit(r.as_needed),
  refillSupplyCount: r.refill_supply_count ?? null,
  refillUnitsPerDose: r.refill_units_per_dose ?? null,
  refillThresholdDays: r.refill_threshold_days ?? null,
  refillReminderDate: r.refill_reminder_date ?? null,
  supplyUpdatedAt: r.supply_updated_at ?? null,
  notes: r.notes ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const mapSchedule = (r: Row): MedicationSchedule => ({
  id: r.id,
  profileId: r.profile_id,
  medicationId: r.medication_id,
  timeOfDay: r.time_of_day,
  daysOfWeek: parseDaysOfWeek(r.days_of_week ?? ''),
  doseLabel: r.dose_label ?? null,
  active: fromBit(r.active),
});

export const mapDoseEvent = (r: Row): DoseEvent => ({
  id: r.id,
  profileId: r.profile_id,
  medicationId: r.medication_id,
  scheduleId: r.schedule_id ?? null,
  scheduledFor: r.scheduled_for,
  localDate: r.local_date,
  localTime: r.local_time,
  timezone: r.timezone,
  status: r.status,
  statusChangedAt: r.status_changed_at,
  statusActor: r.status_actor,
  snoozedUntil: r.snoozed_until ?? null,
  takenAt: r.taken_at ?? null,
  note: r.note ?? null,
});

export const mapReading = (r: Row): VitalReading => ({
  id: r.id,
  profileId: r.profile_id,
  type: r.type,
  customTypeId: r.custom_type_id ?? null,
  value: r.value ?? null,
  unit: r.unit,
  valueCanonical: r.value_canonical ?? null,
  systolic: r.systolic ?? null,
  diastolic: r.diastolic ?? null,
  pulse: r.pulse ?? null,
  measuredAt: r.measured_at,
  timezone: r.timezone,
  utcOffsetMin: r.utc_offset_min,
  context: r.context ?? null,
  source: r.source,
  notes: r.notes ?? null,
  createdAt: r.created_at,
});

export const mapCustomType = (r: Row): CustomVitalType => ({
  id: r.id,
  profileId: r.profile_id,
  name: r.name,
  unit: r.unit,
  decimals: r.decimals,
});

export const mapLabTest = (r: Row): LabTest => ({
  id: r.id,
  profileId: r.profile_id,
  name: r.name,
  orderedBy: r.ordered_by ?? null,
  location: r.location ?? null,
  scheduledAt: r.scheduled_at ?? null,
  timezone: r.timezone ?? null,
  fastingRequired: fromBit(r.fasting_required),
  preparationNotes: r.preparation_notes ?? null,
  status: r.status,
  completedAt: r.completed_at ?? null,
  reminderMinutesBefore: r.reminder_minutes_before ?? null,
  notes: r.notes ?? null,
  createdAt: r.created_at,
});

export const mapLabResult = (r: Row): LabResult => ({
  id: r.id,
  profileId: r.profile_id,
  labTestId: r.lab_test_id,
  analyte: r.analyte,
  valueNum: r.value_num ?? null,
  valueText: r.value_text ?? null,
  unit: r.unit ?? null,
  referenceLow: r.reference_low ?? null,
  referenceHigh: r.reference_high ?? null,
  referenceText: r.reference_text ?? null,
  labFlag: r.lab_flag ?? null,
  resultDate: r.result_date,
  notes: r.notes ?? null,
});

export const mapAppointment = (r: Row): Appointment => ({
  id: r.id,
  profileId: r.profile_id,
  title: r.title,
  clinician: r.clinician ?? null,
  location: r.location ?? null,
  startsAt: r.starts_at,
  timezone: r.timezone,
  durationMin: r.duration_min ?? null,
  status: r.status,
  reminderMinutesBefore: r.reminder_minutes_before ?? null,
  preparationNotes: r.preparation_notes ?? null,
  questions: r.questions ?? null,
  notes: r.notes ?? null,
  createdAt: r.created_at,
});

export const mapDocument = (r: Row): DocumentRecord => ({
  id: r.id,
  profileId: r.profile_id,
  labTestId: r.lab_test_id ?? null,
  appointmentId: r.appointment_id ?? null,
  title: r.title,
  relativePath: r.relative_path,
  mimeType: r.mime_type ?? null,
  sizeBytes: r.size_bytes ?? null,
  createdAt: r.created_at,
});

/** Trims a string and converts empty to null for optional text columns. */
export function optText(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}
