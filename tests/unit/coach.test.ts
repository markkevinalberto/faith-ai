import { coachContext, writeCoachMessage, type CoachNote } from '@/ai/coach';
import type { ChatMessage, GenerateOptions, InferenceEngine } from '@/ai/inference/types';
import { getBiomarker, placeValue } from '@/ai/knowledge/biomarkers';
import { getSource } from '@/ai/knowledge/sources';
import { TIPS, labDirection, tipsForLab, tipsForReading } from '@/ai/knowledge/tips';

const ids = (tips: { id: string }[]) => tips.map((t) => t.id);

describe('tips after a reading', () => {
  it('matches glucose tips to the meal timing and position', () => {
    expect(ids(tipsForReading({ type: 'glucose', position: 'above', glucoseContext: 'fasting' }))).toEqual(['glucose.high.fasting', 'glucose.activity']);
    expect(ids(tipsForReading({ type: 'glucose', position: 'above', glucoseContext: 'after_meal', repeatedlyAbove: true }))).toEqual([
      'glucose.high.after_meal',
      'glucose.activity',
      'glucose.high.repeated',
    ]);
    expect(ids(tipsForReading({ type: 'glucose', position: 'below', glucoseContext: 'fasting' }))).toEqual(['glucose.low.plan', 'glucose.low.note']);
    expect(ids(tipsForReading({ type: 'glucose', position: 'within', glucoseContext: 'fasting' }))).toEqual(['glucose.within']);
    expect(ids(tipsForReading({ type: 'glucose', position: null }))).toEqual(['glucose.no_context']);
  });

  it('gives blood pressure tips for high, low and on-target readings', () => {
    expect(ids(tipsForReading({ type: 'blood_pressure', position: 'above' }))).toEqual(['bp.recheck', 'bp.salt', 'bp.activity']);
    expect(ids(tipsForReading({ type: 'blood_pressure', position: 'above', repeatedlyAbove: true }))).toEqual(['bp.recheck', 'bp.salt', 'bp.high.repeated']);
    expect(ids(tipsForReading({ type: 'blood_pressure', position: 'below' }))).toEqual(['bp.low', 'bp.measure']);
    expect(ids(tipsForReading({ type: 'blood_pressure', position: 'within' }))).toEqual(['bp.within']);
  });
});

describe('tips after a lab result', () => {
  const lab = (id: string, value: number, unit: string) => {
    const b = getBiomarker(id);
    if (!b) throw new Error(id);
    return { b, p: placeValue(b, value, unit) };
  };

  it('knows which side of the goal each result is on', () => {
    const cases: [string, number, string, string][] = [
      ['hba1c', 4.7, '%', 'within'],
      ['hba1c', 7.2, '%', 'above'],
      ['ldl', 95, 'mg/dL', 'within'],
      ['ldl', 104, 'mg/dL', 'above'],
      ['hdl', 35, 'mg/dL', 'below'],
      ['hdl', 52, 'mg/dL', 'within'],
      ['egfr', 75, 'mL/min/1.73m²', 'within'],
      ['egfr', 50, 'mL/min/1.73m²', 'below'],
      ['potassium', 5.6, 'mmol/L', 'above'],
      ['potassium', 4.2, 'mmol/L', 'within'],
      ['hemoglobin', 11.2, 'g/dL', 'below'],
      ['hemoglobin', 14, 'g/dL', 'within'],
    ];
    for (const [id, value, unit, expected] of cases) {
      const { b, p } = lab(id, value, unit);
      expect([id, value, p && labDirection(b, p)]).toEqual([id, value, expected]);
    }
  });

  it('picks tips by test', () => {
    const t = (id: string, v: number, u: string) => {
      const { b, p } = lab(id, v, u);
      return ids(tipsForLab(b, p));
    };
    expect(t('hba1c', 7.2, '%')).toEqual(['hba1c.above', 'hba1c.log', 'lab.discuss']);
    expect(t('ldl', 104, 'mg/dL')).toEqual(['lipids.food', 'lipids.activity', 'lab.discuss']);
    expect(t('egfr', 50, 'mL/min/1.73m²')).toEqual(['kidney.protect', 'kidney.repeat', 'kidney.pain_relievers']);
    expect(t('potassium', 5.6, 'mmol/L')).toEqual(['potassium.salt_substitute', 'lab.discuss']);
    // 12.5 g/dL is below the threshold for men only: no anaemia tip, just "discuss".
    expect(t('hemoglobin', 12.5, 'g/dL')).toEqual(['lab.discuss']);
    expect(t('hba1c', 5.2, '%')).toEqual(['lab.within']);
  });
});

describe('tip safety', () => {
  const all = Object.values(TIPS);

  it('never gives medicine or dose instructions, diagnoses, or calls a result safe', () => {
    for (const tip of all) {
      expect([tip.id, tip.text]).not.toEqual([tip.id, expect.stringMatching(/\b(stop|start|skip|increase|decrease|double|change|adjust)\b[^.]{0,25}\b(medicine|medication|dose|insulin|tablets?|pills?)\b/i)]);
      expect([tip.id, tip.text]).not.toEqual([tip.id, expect.stringMatching(/\b(normal|safe|fine|healthy result|nothing to worry)\b/i)]);
      expect([tip.id, tip.text]).not.toEqual([tip.id, expect.stringMatching(/\byou (may |probably |likely )?have (diabetes|hypertension|anaemia|anemia|kidney disease|liver disease|a condition)\b/i)]);
    }
  });

  it('cites a known guideline for every tip', () => {
    for (const tip of all) {
      expect(tip.sourceIds.length).toBeGreaterThan(0);
      for (const id of tip.sourceIds) expect([tip.id, getSource(id)?.id]).toEqual([tip.id, id]);
    }
  });
});

describe('the model-written note', () => {
  const note: CoachNote = {
    summary: 'Your fasting glucose of 142 mg/dL is above the general reference range (80–130 mg/dL). That range is general, not personalised.',
    details: ['Your previous fasting glucose reading was 150 mg/dL on Thu, 8 Oct, 8:00 AM. This one is 8 mg/dL lower.'],
    tips: [TIPS.glucoseHighFasting, TIPS.glucoseActivity],
    requiredPhrase: 'above the general reference range',
    sources: ['American Diabetes Association'],
  };

  class FakeEngine implements InferenceEngine {
    readonly id = 'fake';
    readonly label = 'Fake on-device engine';
    readonly runsOnDevice = true as const;
    prompt = '';
    constructor(private readonly text: string) {}
    isReady() {
      return true;
    }
    async generate(messages: ChatMessage[], opts: GenerateOptions) {
      this.prompt = messages.map((m) => m.content).join('\n');
      opts.onToken?.(this.text);
      return { text: this.text, tokens: 30, durationMs: 10, tokensPerSecond: 3000, interrupted: false };
    }
    async stop() {}
  }

  it('gives the model only the computed result and the chosen tips', async () => {
    const engine = new FakeEngine('Your fasting glucose of 142 mg/dL is above the general reference range. A short walk on most days can help.');
    const r = await writeCoachMessage(note, engine);
    expect(r.message?.text).toMatch(/^Your fasting glucose of 142 mg\/dL is above the general reference range/);
    expect(engine.prompt).toContain(coachContext(note));
    expect(engine.prompt).toMatch(/Never suggest starting, stopping or changing any medicine/);
  });

  it('rejects drafts that change medicines, add numbers or drop the position', async () => {
    const bad = [
      'Your fasting glucose of 142 mg/dL is above the general reference range. You should increase your metformin dose.',
      'Your fasting glucose of 142 mg/dL is above the general reference range. Aim for 95 mg/dL tomorrow.',
      'Your fasting glucose of 142 mg/dL is a little high. Try a short walk.',
      'Your fasting glucose of 142 mg/dL is above the general reference range, but it is perfectly normal.',
      'Your fasting glucose of 142 mg/dL is above the general reference range. Keep taking your Metformin with breakfast.',
      'Your fasting glucose of 142 mg/dL is above the general reference range. Talk to your care team about your insulin.',
    ];
    for (const text of bad) {
      const r = await writeCoachMessage(note, new FakeEngine(text), { medicationNames: ['Metformin', 'Lisinopril'] });
      expect([text, r.message]).toEqual([text, null]);
      expect(r.violations.length).toBeGreaterThan(0);
    }
  });
});
