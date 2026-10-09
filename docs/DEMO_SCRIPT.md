# Demo script (about 5 minutes)

## Before you present
- Install the **preview** APK (it needs no PC or dev server).
- On first launch on Wi-Fi, FAITH downloads the right models for the phone by itself (progress card on Home). Otherwise use Settings → On-device AI and install:
  - **Qwen2.5 1.5B**, or 0.5B on phones with less than 6 GB RAM. Run the quick test once.
  - **all-MiniLM-L6-v2** for semantic search (25 MB).
  - **Whisper base.en** for voice (148 MB).
- Have a printed medicine label (or a photo of one) and a printed lab report ready. Grant camera and microphone permission once.
- Turn on **airplane mode** and keep it on for the whole demo.
- Disable battery saver and charge the phone. To show the senior-friendly design, set Settings → Display → Text size to Large.
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
4b. **FAITH speaks** (45 s): tap + and save blood pressure **150/95**. FAITH (the mascot) answers in a speech bubble: where it sits against the target, the previous reading, tips, and **What to eat** (less salt, soy sauce and patis; calamansi and garlic for flavour). The note is reworded by the on-device model and checked by the guard. She then asks “Do you have chest pain, a severe headache…?” Tap **No**, then answer the resting question; each answer is saved with the reading. (Tapping **Yes** on the red-flag question shows the emergency card with a Call button.)
5. **Ask FAITH, in airplane mode** (75 s):
   - Point to the line at the top, **"Airplane mode · AI on this phone"**, and tap it: the dropdown shows the chat model in use (switch models here), search by meaning, Whisper voice and ML Kit scanning.
   - Tap the **mic** and say "Summarize my glucose this week". Whisper transcribes it on the phone. Show the **Generated explanation · on this device** block with tokens per second, then **From your records** (computed facts with sources) and **Reference library** (draft review status).
   - Ask "I missed my metformin dose, should I take two?". FAITH refuses to give dose advice, shows the recorded instructions, and **the model isn't called**.
   - Ask "Prepare questions for my next appointment" to get data-driven questions.
   - Ask "Did I ever feel dizzy or lightheaded?". Semantic search finds the note "Felt shaky after a long walk", though no words match. "What about my vision?" finds the eye exam. The caption says they were matched by meaning on the device.
   - Type "my hba1c is 4,7". FAITH answers the value like a nurse: where 4.7 % sits on the ADA scale (general reference, not personalised), how it compares with the last recorded result, and a **Save 4.7 % as HbA1c** button. The generated sentence must repeat the band phrase exactly or the guard discards it and shows the facts alone.
   - Care plan → Lab tests → **Add a result from a report**: pick LDL cholesterol, type 104, and the reference band appears before you save. Three taps, no range to type.
6. **Scan and speak, still offline** (60 s):
   - Medicines tab → scan icon → photograph the label. ML Kit reads it on the phone. Missing fields are filled by the on-device LLM only if they are printed on the label. Review → **Use these details** → the form is pre-filled with suggested times.
   - Care plan → Lab tests → **Scan report**. Untick any row, then save. The results now appear under Lab tests and in Ask.
   - Vitals → + → tap the mic and say "blood pressure 130 over 85, pulse 72". The form fills in for you to confirm.
6b. **Hybrid, if asked** (30 s, optional): Settings → Online assistant is off by default. With your own free Groq key and Wi-Fi back on, the status line reads "Online assistant · Groq", answers are labelled "online (Groq)" and the same guard checks them; switch airplane mode on again and the next answer comes from the phone. Keep it off for the offline part of the demo.
7. **Trust** (30 s):
   - Settings → Security shows the SQLCipher-encrypted database.
   - Settings → On-device AI → Run a quick test shows inference offline.
   - Settings → About & disclosures lists the models, libraries and AI-assisted development.
8. **Close** (15 s): "When the cloud disappears, FAITH keeps reading, listening, searching and answering. Private by design, safe by default, and the AI runs on the phone in your pocket."
