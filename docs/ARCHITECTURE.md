# FAITH AI — structure and architecture

How the app is put together: frameworks, layers, the AI pipelines, data model, build and deployment.

## 1. Frameworks and runtime

| Layer | Choice | Why |
|---|---|---|
| App framework | **Expo SDK 57** on **React Native 0.86**, **React 19.2**, **TypeScript 6** (strict), React Compiler enabled | One codebase for Android, iOS and the web; EAS cloud builds (no local Android SDK needed); Expo modules for camera, files, notifications, secure storage |
| Navigation | **Expo Router** (file-based, typed routes) | Every screen is a file under `src/app/`; deep links for free |
| Database | **expo-sqlite** with **SQLCipher** (AES-256) and **expo-secure-store** for the key | Health data encrypted at rest; the key never leaves the Android keystore-backed store |
| On-device LLM + embeddings | **llama.cpp** through **llama.rn 0.12.9** (Android); **wllama 3.8.1** (llama.cpp in WebAssembly) in the browser | Same GGUF files on both; CPU inference with ARM NEON / WASM SIMD threads |
| Speech-to-text | **whisper.cpp** through **whisper.rn 0.7.4** | Offline English transcription; audio captured as PCM in memory |
| OCR | **Google ML Kit Text Recognition v2**, bundled model, via `@react-native-ml-kit/text-recognition` | No download, no network; returns text boxes with geometry |
| Charts | **react-native-svg** with our own time-scaled chart | True time axis, target bands |
| Tests | **Jest** (jest-expo) with Node's built-in `node:sqlite` for integration tests | Real SQL in tests, no device needed |
| Builds | **EAS Build** (Android APK, preview profile) | Cloud signing and native compilation |
| Web hosting | **Vercel**: static export + one serverless function (the online-assistant relay) | COOP/COEP headers for multi-threaded WebAssembly |

## 2. Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│  src/app         Screens (Expo Router): tabs, forms, settings         │
│  src/components  Composite UI: AnswerCard, CoachCard, OfflineBadge…   │
│  src/ui          Design system: theme, Text, Button, Fields, Layout   │
├──────────────────────────────────────────────────────────────────────┤
│  src/state       Providers and hooks: AppState (db, profiles),        │
│                  AppLock, ReminderCoordinator, useQuery/useAction     │
├──────────────────────────────────────────────────────────────────────┤
│  src/ai          Ask FAITH pipeline, FAITH's note, knowledge, scan,   │
│                  voice, inference engines and model management        │
├──────────────────────────────────────────────────────────────────────┤
│  src/domain      Pure, tested logic: units, time zones, statistics,   │
│                  schedules, dose states, reminders, targets, safety   │
├──────────────────────────────────────────────────────────────────────┤
│  src/db          SQL interface, migrations, SQLCipher adapter,        │
│                  profile-scoped repositories                          │
│  src/services    Notifications, files, app lock, device, demo seed,   │
│                  secrets                                              │
└──────────────────────────────────────────────────────────────────────┘
```

Rules that keep it honest:
- `domain/` has no React, no I/O: everything that computes a health number lives here and is unit-tested.
- `db/repo/*` are the only modules that write SQL; every query is scoped by `profile_id`, and foreign keys are composite (`id, profile_id`) so a record can never cross profiles.
- `ai/` never writes to the database. Screens save what the person confirmed.
- Nothing in `src/` makes a network request except the model downloader and the opt-in online assistant.

## 3. Directory map

```
src/
  app/
    _layout.tsx            Root stack: providers, status bar, screen titles
    index.tsx              Redirect: onboarding or tabs
    (tabs)/                home, vitals, medications, care, ask
    vitals/                [type] chart screen, new (reading form + FAITH's note)
    medications/           [id], edit, scan (label OCR)
    dose/[id]              One dose: taken / skipped / snoozed
    care/                  lab/[id], lab/add (3-tap entry), lab/edit, lab/scan, appointment/*
    onboarding/            Welcome (text size, consent), profile
    settings/              index, profile, targets, model (on-device AI), online, data, about
  ai/
    router.ts              Intent + safety routing (emergency, dose change, prescribe, diagnosis, …)
    reported.ts            "my hba1c is 4,7" → a stated value (lab or reading)
    retrieval.ts           Facts from records: summaries, trends, targets, stated-value comparison
    knowledge/             library.ts (articles), sources.ts (citations), search.ts (keyword),
                           biomarkers.ts (18 tests, units, reference bands), tips.ts, checkins.ts
    semantic.ts            Embedding cache, cosine ranking, hybrid search with calibrated thresholds
    prompt.ts, guard.ts    Nurse persona prompt with chat history; output guard
    answer.ts              Orchestrator: route → retrieve → search → generate → guard
    coach.ts               FAITH's note after a reading/lab result (position, previous, tips, questions)
    inference/             types.ts, llamaEngine.ts (llama.rn), webLlama.web.ts (wllama),
                           cloudEngine.ts (OpenAI-compatible), engineStore.ts, localModels.ts
                           (embeddings + Whisper), modelCatalog.ts, modelManager.ts, modelStore(.web).ts,
                           downloads.ts, autoSetup.ts (first-run), onlineAssistant.ts
    scan/                  ocr.ts (ML Kit), layout.ts (rows from boxes), labReportParser.ts,
                           labelParser.ts, grounding.ts, extract.ts (grounded LLM fill-in)
    voice/                 recorder.ts (PCM stream), wav.ts, voiceCommands.ts (spoken readings)
  domain/                  units, time, stats, chartScale, schedule, doseStatus, reminders,
                           targets, escalation, supply, validation, types
  db/                      schema.ts, migrate.ts, expoDatabase.ts (SQLCipher), singleConnection.ts,
                           sql.ts, rows.ts, dataManagement.ts, repo/ (profiles, vitals, medications,
                           doseEvents, care, audit)
  services/                notifications, reminderSync, files, appLock, device, demoSeed, secret(.web)
  state/                   AppState, AppLock, ReminderCoordinator, hooks
  ui/                      theme (tokens, type scale, text size), Text, Button, Fields, Layout
                           (Card, MascotCard, Section…), Feedback, SpeechBubble, TimeChart,
                           EscalationCard, Illustration, dialog, webStyles(.web)
  components/              AnswerCard, CoachCard, OfflineBadge, OnlineOfferCard, AiSetupCard,
                           DoseItem, CareItems, VoiceButton, TextSizePicker, AppChrome
web/api/chat/completions.js   Vercel function: relay for the shared online assistant
scripts/                   postexport-web.js (Vercel-safe static export), icon generation
landing/                   Static landing page
tests/unit, tests/integration
docs/                      This file, SUBMISSION, DEMO_SCRIPT, PRIVACY_AND_SAFETY, Android build guide
```

## 4. The Ask FAITH pipeline

```
question ──► router.ts ──► emergency? ──► EscalationCard (no model)
                │
                ├─► dose change / prescribe / diagnosis? ──► refusal + recorded instructions (no model)
                │
                ├─► unit conversion? ──► fixed formula
                │
                └─► retrieval.ts: facts from the encrypted records (tested domain code)
                        + knowledge/search.ts (keyword) + semantic.ts (embeddings) ──► library articles
                        │
                        ▼
                 prompt.ts: nurse persona + FACTS + REFERENCE + recent chat turns
                        │
                        ▼
                 engine: online assistant (if on + reachable) → on-device llama.cpp → none
                        │
                        ▼
                 guard.ts: no dosing / diagnosis / "normal" / unsupported numbers; required phrases
                        │              ▲ fail: next engine, then the computed facts alone
                        ▼
                 AnswerCard: safety card · generated explanation (labelled on-device / online)
                             · "From your records" facts · reference library with sources
```

FAITH's note (`coach.ts`) reuses the same pieces after a reading or lab result: position against the clinician's target or a published band, the previous result, the 7-day pattern, up to three tips, food advice, and one or two follow-up questions from a curated list. The model may only reword the headline and one tip.

## 5. The scan pipeline

```
photo (camera / gallery) ──► ML Kit text recognition (on device)
   ──► layout.ts: group text boxes into printed rows (centre distance or vertical overlap)
   ──► labReportParser.ts: token parser per row (name · value · unit · 2nd unit · range · flag · method),
       two tests per line, catalog-tagged names, layouts 2 and 3 for column-by-column OCR
   ──► extract.ts: optional on-device LLM for leftover lines, JSON-schema constrained,
       every returned value must literally appear in the scanned text
   ──► review screen: the person ticks rows; nothing is saved until "Save"
```

## 6. Models and the engine abstraction

`InferenceEngine` (`ai/inference/types.ts`) is one interface: `generate(messages, options)`, `isReady()`, `stop()`, `runsOnDevice`. Three implementations:
- `LlamaRnEngine` (Android, llama.rn), with grammar-constrained JSON output for scans;
- `WllamaEngine` (browser, llama.cpp WASM in a Web Worker);
- `CloudEngine` (any OpenAI-compatible `/chat/completions`, used only by the opt-in online assistant).

`modelCatalog.ts` lists each downloadable model with size, checksum, licence, RAM guidance and a compatibility check; `modelStore(.web).ts` downloads and verifies files (phone file system or browser OPFS); `engineStore.ts` holds the loaded chat engine; `localModels.ts` lazily loads the embedding and Whisper models; `autoSetup.ts` plans the first-run download for the device's memory.

## 7. Data model (SQLite, encrypted)

Tables are created by versioned migrations in `db/schema.ts` / `db/migrate.ts`. Every health table carries `profile_id`, and child tables reference parents with composite foreign keys.

- `profiles` (display name, units, emergency number, reminder settings, demo flag), `conditions`, `target_ranges` (clinician-set targets by metric)
- `medications`, `medication_schedules`, `medication_events` (the per-dose state machine: upcoming / taken / skipped / snoozed / unconfirmed)
- `vital_readings` (glucose, blood pressure, pulse, weight, SpO₂, temperature, custom), `custom_vital_types`
- `lab_tests`, `lab_results` (value as printed, unit, printed reference, flag), `appointments`, `documents` (photos and files kept on the phone)
- `reminder_jobs` (scheduled notification bookkeeping), `app_settings` (non-health key/value: active profile, model choice, text size, online-assistant settings), `audit_events`

The API key for the online assistant is kept out of the database: `expo-secure-store` on the phone, `localStorage` in the browser build.

## 8. Safety design in one place

See [PRIVACY_AND_SAFETY.md](PRIVACY_AND_SAFETY.md) for the full rules. In short: doses are never marked taken automatically; no dose advice; deterministic numbers only; targets show their source; reference scales never say "normal"; scans and voice never save by themselves; escalation first; tips and questions are curated; the online assistant is optional and labelled.

## 9. Build, test and deploy

```bash
npm test                 # 316 tests: unit + integration (real SQLite)
npm run typecheck        # tsc --noEmit, strict
npm run lint             # eslint-config-expo
npx expo start --web     # dev server with COOP/COEP (metro.config.js)
npm run deploy:web       # expo export → scripts/postexport-web.js → vercel deploy --prod
npx eas-cli@latest build -p android --profile preview   # APK
```

The web export renames `assets/node_modules` to `assets/vendor` (Vercel never uploads a folder called `node_modules`, and that is where the WebAssembly files live) and copies `web/api/` next to the site so the relay deploys as a Vercel function. `vercel.json` sets the cross-origin isolation headers and keeps `/api` out of the single-page rewrite.

## 10. Known limits

- Clinical content is draft, pending clinician review.
- Voice is English-only; the assistant answers in English.
- iOS is not built yet (no Apple developer account in the hackathon window).
- OCR quality depends on the photo; the review screen and three-tap manual entry cover the rest.
- The 0.5B model sometimes copies tip wording rather than rephrasing; the 1.5B model and the online assistant read more naturally.
