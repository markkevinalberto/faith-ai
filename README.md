# FAITH AI

**F**amily **A**ssistant for **I**llness, **T**reatment & **H**ealth. *Your health, in your hands. Even offline.*

**A private, offline-first health companion for people living with diabetes, high blood pressure and other long-term conditions.** It runs on Android first, with iOS to follow, using React Native and Expo. All of its AI runs **on the phone**: llama.cpp, whisper.cpp and Google ML Kit.

> FAITH is a health organiser and educational assistant, **not a medical device**. It doesn't diagnose, prescribe or change treatment. All clinical thresholds and reference content are drafts pending clinical review.

## What it does

| Area | Features |
|---|---|
| **Home** | Today's care plan, next dose with one-tap "I took it", refill alerts, latest readings tagged against targets (with the target's source), upcoming appointments and labs, assistant entry point |
| **Vitals** | Glucose (mg/dL or mmol/L with meal context), blood pressure with pulse, pulse, weight, temperature, SpO₂, and custom measurements. Time-proportional charts (day, week, month, year), statistics, trend, clinician or reference target bands, history and editing |
| **Medications** | Name, strength and form; instructions copied from the label; start and end dates; multiple times per day; repeat days; as-needed medicines; supply and refill reminders. Dose statuses: upcoming, taken, skipped, snoozed, **not confirmed**. A dose is never marked taken automatically |
| **Care plan** | Appointments (preparation notes, questions, reminders, attachments) and lab tests (fasting flag, preparation, reminders, results recorded exactly as printed, report attachments) |
| **Ask FAITH** | Offline assistant: safety router, then retrieval from your records, then deterministic calculations, then the curated library (with sources and review dates), then optional on-device generation, then an output guard. Records, references and generated text are shown as three distinct sections. Without a model it still answers deterministically |
| **Reminders** | Local notifications with Taken, Snooze and Skip actions; DST and time-zone aware; reconciled against the database by deterministic IDs |
| **Privacy** | SQLCipher-encrypted database, key in secure storage, optional biometric or PIN app lock, separate profiles per family member, JSON and CSV export, permanent deletion, no network by default |
| **Demo mode** | A clearly labelled fictional person with 90 days of realistic data |

## Local AI: still useful when the cloud disappears

Every AI feature runs on the phone and keeps working in airplane mode. Every model is optional, and each feature falls back to a non-AI path.

| Feature | On-device stack | What happens without it |
|---|---|---|
| **Ask FAITH** | Qwen2.5 1.5B or 0.5B through llama.cpp, after a deterministic safety router, record retrieval and calculations, with an output guard checking every number | Answers from computed record summaries and the library |
| **Semantic search** | all-MiniLM-L6-v2 embeddings through llama.cpp. Records and library articles are matched by meaning, so "Did I ever feel dizzy?" finds a note saying "felt shaky after a long walk". Keyword matches are always kept | Keyword search |
| **Voice** | Whisper base.en or tiny.en through whisper.cpp. Ask questions by voice, or say "blood pressure 130 over 85, pulse 72" to fill the reading form. Audio stays in memory and is never saved | Typing |
| **Scan labels and lab reports** | ML Kit text recognition (model bundled in the app), then layout reconstruction and tested parsers. The on-device LLM fills only missing fields, with JSON-schema constrained output, and **every value must appear in the scanned text**. You review everything before saving | Manual entry |
| **Offline proof badge** | Live connection and airplane-mode status next to the local components that are running (LLM, search, voice, OCR) | Not applicable |

**Why local beats cloud here:**
- Health records, voice and photos of prescriptions never leave the phone.
- It works in clinics, on the road and during outages.
- There's no per-request cost or account.
- Answers stay grounded in the user's own encrypted records.

## Quick start

```bash
# Windows: skip llama.rn's native download locally (EAS fetches it on Linux)
RNLLAMA_SKIP_POSTINSTALL=1 npm install

npm test               # unit + integration tests (Jest)
npm run typecheck      # TypeScript strict
npm run lint           # ESLint (expo config)
npx expo start --web   # UI preview in a browser (no native AI, no encryption)
```

**Android device build:** see [docs/ANDROID_BUILD_AND_DEVICE_TESTING.md](docs/ANDROID_BUILD_AND_DEVICE_TESTING.md).

```bash
npx eas-cli@latest build -p android --profile preview
```

## Verification status (2026-10-09)

| Check | Result |
|---|---|
| Unit tests (`tests/unit`) | **174 passed**: units, time zones and DST, statistics and trends, schedule generation, dose state machine, reminder reconciliation, escalation, targets, validation, supply, chart scales, router, guard, conversions, library, label and lab-report parsers, OCR layout, grounded AI extraction (invented values are dropped), spoken-reading parser, PCM helpers, semantic ranking and caching |
| Integration tests (`tests/integration`, real SQLite through `node:sqlite`) | **52 passed**: migrations (with rollback), persistence, schedule-edit regeneration, time-zone re-timing, profile isolation (composite FKs), export, permanent deletion, reminder reconciliation with a fake notifier, demo seeding, offline assistant (network calls fail the test), semantic record search and embedder-failure fallback |
| `tsc --noEmit` (strict) | Clean |
| `expo lint` | Clean |
| `expo-doctor` | Every check passes except the React Native Directory metadata check. It flags `@react-native-ml-kit/text-recognition` (untested on the New Architecture) and `whisper.rn` and `@fugood/react-native-audio-pcm-stream` (no metadata). Legacy native modules run through React Native's interop layer, and the Gradle plugin adds their missing namespaces. Confirm on the device |
| Web UI walkthrough | Onboarding → sample data → Home → Vitals chart and target band → add reading → safety card → Ask (deterministic answer and dose-change refusal) → all settings screens render |
| EAS preview build | First APK (core app and LLM) built successfully on 2026-10-09. A second build adds scan, voice, semantic search and the offline badge |
| **Physical Android device** | **Not yet run.** SQLCipher, llama.rn and whisper.rn inference, ML Kit OCR, microphone capture, notifications and biometrics need checking on the phone. Follow the checklist in the device-testing doc |

## Project structure

```
src/
  app/          Expo Router screens: (tabs) home/vitals/medications/care/ask, details, forms, settings
  domain/       Pure, tested medical and time logic (units, DST, stats, schedules, dose states, reminders, targets, escalation)
  db/           SQL interface, versioned migrations, SQLCipher adapter, profile-scoped repositories, export and deletion
  ai/           Router, retrieval, knowledge library and sources, prompt, guard, answer orchestrator, semantic search,
                inference (llama.rn engine, embeddings, Whisper, model catalog and manager), scan (OCR, layout, parsers,
                grounded extraction), voice (recorder, PCM helpers, spoken-reading parser)
  services/     Notifications, reminder sync, files, app lock, demo seed, device locale and time zone
  state/        App providers (database, profile, app lock, reminder coordinator) and data hooks
  ui/           Design tokens, components, time chart, escalation card
tests/unit, tests/integration
docs/           Implementation plan, Android build and device testing, privacy and safety, demo script
```

## Documentation
- [Implementation plan and architecture](docs/IMPLEMENTATION_PLAN.md)
- [Android build, device checklist, model compatibility, notification limits](docs/ANDROID_BUILD_AND_DEVICE_TESTING.md)
- [Privacy, data handling and medical safety](docs/PRIVACY_AND_SAFETY.md)
- [Disclosures: models, libraries, tools](DISCLOSURES.md)
- [Demo script](docs/DEMO_SCRIPT.md)

## Known limitations
- **Some artwork is still a placeholder.** The five mascot poses are sharp transparent cut-outs from the character sheet. The other illustrations (3D icons, empty states, contextual mascot scenes) are 2× upscales cropped from the design board, so they look soft on high-density screens. Replace any of them with a full-resolution export of the same file name, and update its pixel size in `src/ui/Illustration.tsx`.
- The clinical content (escalation thresholds, reference ranges, library) is **draft** and needs review by a licensed clinician before real-world use.
- iOS hasn't been built yet. It needs EAS and an Apple developer account; the code avoids Android-only APIs except the date picker, which has an iOS path.
- Model download speed and inference speed depend on the device. Speeds in the docs are estimates until measured with the in-app test.
- OCR quality depends on the photo. Handwritten prescriptions and multi-column reports may need manual correction, which the review screens allow.
- Voice is English-only (Whisper `.en` models). The spoken-reading parser understands common phrasings, and anything it doesn't understand is left for you to type.
- The ML Kit wrapper bundles the Latin, Chinese, Devanagari, Japanese and Korean recognisers, which adds about 20–30 MB to the APK. FAITH uses only Latin.
- Web preview only: charts use a window-size estimate before layout. No encryption, notifications or native AI on web.
