import type { ConditionCategory } from '../domain/types';

export const CONDITION_OPTIONS: { value: ConditionCategory; label: string }[] = [
  { value: 'diabetes_type2', label: 'Type 2 diabetes' },
  { value: 'diabetes_type1', label: 'Type 1 diabetes' },
  { value: 'prediabetes', label: 'Prediabetes' },
  { value: 'gestational_diabetes', label: 'Gestational diabetes' },
  { value: 'hypertension', label: 'High blood pressure' },
  { value: 'heart_disease', label: 'Heart disease' },
  { value: 'kidney_disease', label: 'Kidney disease' },
  { value: 'high_cholesterol', label: 'High cholesterol' },
  { value: 'asthma_copd', label: 'Asthma / COPD' },
];

export const MED_FORMS = ['Tablet', 'Capsule', 'Liquid', 'Injection', 'Inhaler', 'Patch', 'Drops', 'Other'];

export const DAY_OPTIONS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

export const APPOINTMENT_REMINDERS: { value: number; label: string }[] = [
  { value: -1, label: 'None' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 1440, label: '1 day' },
];

export const LAB_REMINDERS: { value: number; label: string }[] = [
  { value: -1, label: 'None' },
  { value: 120, label: '2 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '1 day' },
];

export const LAB_SUGGESTIONS = ['HbA1c', 'Lipid panel', 'Kidney function (eGFR)', 'Urine albumin (UACR)', 'Fasting glucose', 'Complete blood count', 'Thyroid (TSH)', 'Liver function'];
