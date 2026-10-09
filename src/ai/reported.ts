/**
 * Understands values people STATE in the chat ("my hba1c is 4,7", "fbs 5.6 this morning",
 * "bp 130/85") so the assistant can respond to the number instead of defining the word.
 * Nothing is saved here: the answer offers a button that opens the right form pre-filled.
 */
import { findBiomarker, type Biomarker } from './knowledge/biomarkers';
import { parseVoiceReading, type VoiceReading } from './voice/voiceCommands';

export interface ReportedLab {
  kind: 'lab';
  biomarker: Biomarker;
  value: number;
  unit: string;
}

export interface ReportedReading {
  kind: 'reading';
  reading: VoiceReading;
}

export type ReportedValue = ReportedLab | ReportedReading;

const NUMBER_AFTER = /^[^0-9]{0,25}?(\d{1,3}(?:[.,]\d{1,2})?)\s*(%|mmol\/mol|mg\/?dl|mmol\/?l|mg\/g|mg\/mmol|ml\/min(?:\/1\.73\s?m[²2])?|[µu]mol\/?l|miu\/l|mu\/l|g\/dl|g\/l|u\/l|iu\/l)?/i;

const UNIT_NAMES: Record<string, string> = {
  '%': '%',
  'mmol/mol': 'mmol/mol',
  'mg/dl': 'mg/dL',
  mgdl: 'mg/dL',
  'mmol/l': 'mmol/L',
  mmoll: 'mmol/L',
  'mg/g': 'mg/g',
  'mg/mmol': 'mg/mmol',
  'umol/l': 'µmol/L',
  'µmol/l': 'µmol/L',
  'miu/l': 'mIU/L',
  'mu/l': 'mIU/L',
  'g/dl': 'g/dL',
  'g/l': 'g/L',
  'u/l': 'U/L',
  'iu/l': 'U/L',
};

function normalizeUnit(raw: string): string {
  const key = raw.toLowerCase().replace(/\s+/g, '');
  if (key.startsWith('ml/min')) return 'mL/min/1.73m²';
  return UNIT_NAMES[key] ?? raw;
}

/** Picks the unit when none is written: the biomarker's canonical unit unless the size says otherwise. */
function guessUnit(biomarker: Biomarker, value: number): string {
  const [canonical, alternative] = biomarker.units;
  if (!alternative) return canonical;
  switch (biomarker.id) {
    case 'hba1c':
      return value > 20 ? 'mmol/mol' : '%';
    case 'creatinine':
      return value > 20 ? 'µmol/L' : 'mg/dL';
    case 'uric-acid':
      return value > 20 ? 'µmol/L' : 'mg/dL';
    case 'hemoglobin':
      return value > 30 ? 'g/L' : 'g/dL';
    default:
      // mg/dL scales are large numbers; mmol/L values of the same tests are small.
      return value < 20 && alternative === 'mmol/L' ? 'mmol/L' : canonical;
  }
}

/** Parses a stated value from free text. Lab analytes take priority over meter readings. */
export function parseReportedValue(text: string): ReportedValue | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const found = findBiomarker(t);
  if (found) {
    const after = NUMBER_AFTER.exec(t.slice(found.index + found.length));
    if (after) {
      const value = Number(after[1].replace(',', '.'));
      if (Number.isFinite(value) && value > 0) {
        const { biomarker } = found;
        if (biomarker.readingType === 'glucose') {
          const unit = after[2] ? normalizeUnit(after[2]) : guessUnit(biomarker, value);
          return { kind: 'reading', reading: { type: 'glucose', value, unit: unit === 'mmol/L' ? 'mmol/L' : 'mg/dL', context: biomarker.readingContext ?? null } };
        }
        return { kind: 'lab', biomarker, value, unit: after[2] ? normalizeUnit(after[2]) : guessUnit(biomarker, value) };
      }
    }
  }
  const reading = parseVoiceReading(text);
  if (!reading) return null;
  if (reading.type === 'glucose' && reading.unit === null) {
    return { kind: 'reading', reading: { ...reading, unit: reading.value < 35 ? 'mmol/L' : 'mg/dL' } };
  }
  return { kind: 'reading', reading };
}
