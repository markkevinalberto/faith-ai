# Privacy, data handling and medical safety

## Data inventory

| Data | Where it is stored | Protection |
|---|---|---|
| Profiles, conditions, targets, medications, schedules, dose events, readings, labs, appointments, reminder jobs, audit trail | `carely.db` (SQLite) in the app's private storage | SQLCipher encryption with a random 256-bit raw key |
| Database key | expo-secure-store (Android Keystore-backed), `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | Never leaves secure storage and is never logged |
| Attachments (PDF and image reports) | `documents/<profileId>/<uuid>.<ext>` in private app storage | App sandbox. The DB stores relative paths only, and paths are validated against traversal |
| AI model files | `models/*.gguf` and `models/ggml-*.bin` in private app storage | Not personal data |
| Voice input | Microphone audio is held **in memory only** while you speak, transcribed by Whisper on the phone, then discarded | Never written to disk and never sent anywhere. Only the transcript is used: as the question, or to pre-fill the reading form for you to confirm |
| Scanned photos | The camera or gallery image sits in the app cache while it is read by on-device OCR | Deleted after scanning, unless you choose "Keep the photo with this record" for a lab report. It is then stored like any other attachment |
| Embeddings | Vectors for your record snippets, kept in memory to speed up semantic search | Never persisted. Cleared on profile switch, profile deletion and erase |
| Exports | Temporary file in the app cache | Deleted after the share sheet closes. The user is warned that the export is **not** encrypted |
| Scheduled notifications | The OS notification scheduler | Medicine names are hidden by default ("Hide medicine names" is on). Android lock-screen visibility is set to private |

- **No network by default.** There's no account, server, sync, analytics, crash reporting or cloud AI. The only possible requests are the model downloads the user starts.
- **Permissions:**
  - Camera and microphone are requested only when you first tap Scan or the microphone.
  - The microphone records only between your two taps, and for at most 20 seconds.
- **Backups:** `android.allowBackup` is `false`, so Android cloud backup never copies the encrypted database or the key.
- **Logs:** failures log a generic message (for example "reminder sync failed") and never any record contents.
- **Retention:** data is kept until the user deletes it. Uninstalling the app removes everything.
- **Deletion:**
  - *Delete a profile* removes every row for that profile through `ON DELETE CASCADE`, verifies that zero rows remain (integration-tested), deletes its attachment folder and refreshes reminders.
  - *Erase everything* cancels all notifications, unloads the model, closes and deletes the database file, deletes the key from secure storage, and deletes attachments, exports and (optionally) models.
- **Profile isolation:** every repository call is scoped by `profile_id`. Child tables reference parent rows through composite `(id, profile_id)` foreign keys, so the database itself rejects any record pointing to another person's data (integration-tested). The assistant only retrieves the active profile's records.
- **App lock** (optional) uses the phone's biometrics or screen lock. It re-locks after 30 s in the background and covers the content in the app switcher.

## Medical safety design

FAITH is a **health organiser and educational assistant, not a medical device**. It doesn't diagnose, prescribe, change doses or replace a clinician.

### Hard rules enforced in code
1. **Doses are never marked taken automatically.**
   - The state machine (`src/domain/doseStatus.ts`) rejects every system-initiated take, skip, snooze or undo.
   - The database `CHECK` constraints require `status_actor = 'user'` for taken, skipped and snoozed rows.
   - Overdue doses become **"Not confirmed"**, never "missed, take now".
2. **No dose advice.**
   - The router refuses requests to double, skip, stop, change or "make up" doses before any model call.
   - The output guard rejects generated text containing dose instructions, starting or stopping medicines, diagnoses, "safe" or "normal" claims, discouraging care, or numbers that aren't in the provided facts.
3. **Deterministic numbers only.** Averages, ranges, trends, conversions, supply estimates and dates come from unit-tested code in `src/domain/`. The model only rephrases facts it was given.
4. **Targets show their source.**
   - Clinician-entered targets are labelled with who set them and when.
   - Otherwise a general reference range is shown, labelled "not personalised", with its citation.
   - Wording never claims a reading is "safe".
5. **Reference scales are general, never a verdict.** The biomarker catalog (`src/ai/knowledge/biomarkers.ts`) positions a value on published scales (ADA, KDIGO, NCEP ATP III, WHO, MedlinePlus typical laboratory ranges). Band labels name the band the way the source does and never say "normal", "safe" or "fine" (unit-tested); every display adds "general reference, not personalised"; the range printed on the person's report and targets set by their clinician take precedence. A value typed into the chat is never saved by the assistant: it offers a button that opens the form pre-filled, and the person saves it.
6. **Scans and voice never save anything by themselves.**
   - Scanned labels and reports, and spoken readings, only pre-fill a review screen or form. Nothing is stored until you check it and tap Save.
   - When the on-device model helps read a scan, every value it returns must appear word for word in the scanned text. Anything else is discarded and you are told about it (unit-tested).
   - Suggested reminder times come only from the printed frequency (for example "twice daily" → 08:00 and 20:00). They are labelled as a starting point.
7. **Escalation first.** Emergency phrases (chest pain, stroke signs, trouble breathing, fainting, self-harm and others) short-circuit the assistant into an emergency card with a Call button.
9. **The online assistant is optional and off by default.** When switched on in Settings with the person's own API key and the internet is reachable, Ask FAITH and FAITH's note send the same prompt the on-device model would get (question, computed facts shown under the answer, library excerpts, up to four earlier exchanges) to an OpenAI-compatible service (Groq's free plan by default). The answer passes through the same output guard; on any failure FAITH falls back to the on-device model. Every online answer is labelled, and the status line at the top of Ask FAITH shows when the assistant is on. The key is kept in secure storage, never in the database.
8. **Tips and follow-up questions are curated, not generated.** After a reading or lab result is saved, FAITH's note (`src/ai/coach.ts`) shows the computed position, the previous result, up to three tips, food advice and one or two follow-up questions, all taken from fixed libraries (`src/ai/knowledge/tips.ts`, `checkins.ts`) that cite ADA, ISH/ESC, WHO, AHA, KDIGO, NCEP and MedlinePlus and are labelled draft, pending clinical review. Tips cover lifestyle, measurement technique, routine checks and taking medicines as prescribed; they never start, stop or change a medicine or dose and never diagnose (unit-tested). The on-device model may only reword the headline and one tip; its draft must repeat the computed position phrase and is rejected if it adds numbers, mentions the person's medicines or dose words, or says "normal", "safe" or "cure". When a safety card is shown, tips and questions are left out. A red-flag answer (for example chest pain with high blood pressure) brings up the emergency card. Answers are saved only in that reading's or result's notes.

### Escalation thresholds (draft, pending clinical review)

| Rule | Level | Source |
|---|---|---|
| Glucose < 54 mg/dL (3.0 mmol/L) | Urgent | ADA Standards of Care 2025, §6 |
| Glucose < 70 mg/dL (3.9 mmol/L) | Attention | ADA Standards of Care 2025, §6 |
| Glucose ≥ 300 mg/dL (16.7 mmol/L) | Urgent | ADA/EASD hyperglycaemic crises consensus 2024 |
| Glucose ≥ 250 mg/dL (13.9 mmol/L) | Attention | Same |
| BP ≥ 180 systolic or ≥ 120 diastolic | Urgent (emergency if symptoms) | AHA hypertensive crisis guidance, ISH 2020 |
| BP < 90/60 | Attention | AHA |
| SpO₂ < 90% | Urgent | WHO Pulse Oximetry Training Manual |
| SpO₂ ≤ 94% | Attention | WHO Pulse Oximetry Training Manual |
| Pulse < 40 or > 130 at rest | Attention | AHA |
| Temperature < 35 °C | Urgent | WHO IMAI |
| Temperature ≥ 39.5 °C | Attention | WHO IMAI |

### Before real-world use
- A licensed clinician must review every escalation rule, reference range and library article (currently marked `draft_pending_clinical_review`).
- Localise emergency guidance and numbers for each target country.
- Run usability testing with people living with diabetes or hypertension, including accessibility testing with TalkBack and large font sizes.
