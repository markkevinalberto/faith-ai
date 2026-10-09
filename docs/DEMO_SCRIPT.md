# Demo script (about 5 minutes)

## Before you present
- Install the **preview** APK (it needs no PC or dev server).
- Settings → On-device AI, install:
  - **Qwen2.5 1.5B**, or 0.5B on phones with less than 6 GB RAM. Run the quick test once.
  - **all-MiniLM-L6-v2** for semantic search (25 MB).
  - **Whisper base.en** for voice (148 MB).
- Have a printed medicine label (or a photo of one) and a printed lab report ready. Grant camera and microphone permission once.
- Turn on **airplane mode** and keep it on for the whole demo.
- Disable battery saver, set font size to default, and charge the phone.
- Start from a fresh sample profile: Settings → Remove sample profile, then Add sample data profile.

## Flow

1. **Why** (15 s): "FAITH stands for **Family Assistant for Illness, Treatment & Health**. People managing diabetes or blood pressure, often for a parent or partner too, juggle medicines, readings and appointments, and their health data shouldn't have to leave their phone. FAITH keeps a separate profile for each family member and runs everything locally, including the AI."
2. **Home** (40 s):
   - The care plan shows the next dose with the instructions copied from the label. Tap **I took it** (the button appears once the dose is within 4 hours of its scheduled time). Otherwise use **Taken** on a dose in Today’s doses.
   - Point out the refill alert for Lisinopril, the latest readings tagged "Above your target" (the target was set by the fictional clinician), and the upcoming appointment and fasting lab.
3. **Vitals → Blood glucose** (40 s):
   - Switch between week and month. The chart uses a true time axis.
   - Tap **Fasting**: the shaded band is the clinician-set target, and the caption names its source.
   - Note that statistics and trend are computed by tested code, not by AI.
4. **Safety** (30 s): tap + and add a glucose reading of **45 mg/dL**. A level-2 hypoglycaemia card appears with steps and a Call button, labelled as draft guidance pending clinical review.
5. **Ask FAITH, in airplane mode** (75 s):
   - Point to the green badge, **"Airplane mode · AI running on this phone"**, with LLM, semantic search, Whisper and ML Kit all ticked.
   - Tap the **mic** and say "Summarize my glucose this week". Whisper transcribes it on the phone. Show the **Generated explanation · on this device** block with tokens per second, then **From your records** (computed facts with sources) and **Reference library** (draft review status).
   - Ask "I missed my metformin dose, should I take two?". FAITH refuses to give dose advice, shows the recorded instructions, and **the model isn't called**.
   - Ask "Prepare questions for my next appointment" to get data-driven questions.
   - Ask "Did I ever feel dizzy or lightheaded?". Semantic search finds the note "Felt shaky after a long walk", though no words match. "What about my vision?" finds the eye exam. The caption says they were matched by meaning on the device.
6. **Scan and speak, still offline** (60 s):
   - Medications → scan icon → photograph the label. ML Kit reads it on the phone. Missing fields are filled by the on-device LLM only if they are printed on the label. Review → **Use these details** → the form is pre-filled with suggested times.
   - Care plan → Lab tests → **Scan report**. Untick any row, then save. The results now appear under Lab tests and in Ask.
   - Vitals → + → tap the mic and say "blood pressure 130 over 85, pulse 72". The form fills in for you to confirm.
7. **Trust** (30 s):
   - Settings → Security shows the SQLCipher-encrypted database.
   - Settings → On-device AI → Run a quick test shows inference offline.
   - Settings → About & disclosures lists the models, libraries and AI-assisted development.
8. **Close** (15 s): "When the cloud disappears, FAITH keeps reading, listening, searching and answering. Private by design, safe by default, and the AI runs on the phone in your pocket."
