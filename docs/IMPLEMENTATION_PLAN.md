# FAITH AI — Implementation Plan & Architecture

Status: living document. Started 2026-10-09. Android first; iOS follows once Android is verified on a device.

## 1. Repository inspection (2026-10-09)

- `D:\FAITH` was empty. Scaffolded with `create-expo-app` (default template).
- Toolchain: Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6 (strict), Expo Router (routes in `src/app/`).
- Host: Windows 11, Node 24, no JDK/Android SDK, no macOS. Native builds therefore run on **EAS Build** (cloud), installed on a physical Android phone. Unit/integration tests run locally with Jest.

## 2. Decisions

| Topic | Decision | Why |
|---|---|---|
| Platform order | Android first, iOS second | User decision; EAS + physical Android phone |
| Runtime | Expo **development build** (`expo-dev-client`), never Expo Go | SQLCipher, llama.rn and notification actions need native code |
| Database | `expo-sqlite` with `useSQLCipher: true`; 256-bit random key in `expo-secure-store` (Android Keystore-backed) | Encryption at rest; key never leaves secure storage |
| Local LLM | `llama.rn` 0.12.9 (llama.cpp bindings), Qwen2.5-Instruct GGUF Q4_K_M (1.5B default, 0.5B "lite") — Apache-2.0 | Small, permissively licensed, runs on arm64 Android |
| Model delivery | Explicit, user-initiated download (size + MD5 verified, matched to published SHA-256) **or** import a `.gguf` from device storage | No silent network use; demo works offline |
| Charts | Custom time-scaled charts on `react-native-svg`; scales/ticks computed in tested domain code | Index-spaced chart libs misplace irregular readings in time; health data needs true time axes |
| Time zones | Medication times are local wall-clock times in the device zone ("8:00 wherever I am"); each event stores the IANA zone + UTC instant used | Matches user expectation; DST gaps/overlaps resolved deterministically and tested |
| Reminders | Rolling 7-day window of one-shot DATE notifications, reconciled against `reminder_jobs` by deterministic IDs; refresh on launch/foreground/data change | Per-dose IDs allow snooze/taken to cancel a single reminder; stays well under OS alarm limits |
| Guidelines | International (WHO, ADA Standards of Care, ISH 2020 / ESC) — every rule and article labelled **"Draft — pending clinical review"** | We cannot claim clinical review |
| Network | None for core features. Only the model download (user-initiated). No analytics, no crash reporting, no cloud AI | Privacy + hackathon rule: core AI runs locally |

## 3. Architecture

```
src/
  app/            Expo Router screens only (thin: layout + wiring)
  domain/         Pure TypeScript medical/time logic. No React, no Expo imports. 100% unit tested.
                  units, time (tz/DST), stats, schedule, doseStatus, reminders (reconciliation planner),
                  targets, escalation, chartScale, validation
  db/             SqlDatabase interface, migrations + runner, Expo/SQLCipher adapter, repositories
                  (every repository call is scoped by profileId), export, deletion
  services/       Side-effect glue: notifications, reminder sync, app lock, document files, demo seed
  ai/             router (intent + safety), retrieval (DB facts with provenance), knowledge library,
                  prompt builder, output guard, answer orchestrator, inference adapters, model manager
  ui/             Design tokens, theme hook, reusable components (cards, fields, charts, banners)
  state/          App providers: database, active profile, data-change bus, app lock
tests/
  unit/           domain + ai logic
  integration/    real SQLite via node:sqlite — migrations, FK/profile isolation, persistence,
                  dose-event regeneration, deletion, offline assistant
```

The `SqlDatabase` interface (`execAsync`, `runAsync`, `getFirstAsync`, `getAllAsync`, `transaction`) is implemented twice: on top of `expo-sqlite` in the app, and on top of Node's built-in `node:sqlite` in integration tests. Repositories only see the interface, so the same SQL runs in both.

### Assistant pipeline ("Ask FAITH")

1. **Safety router** (deterministic): emergency phrases/readings → escalation card first; dose-change requests (double, skip, stop, increase) → refusal + "ask your clinician/pharmacist"; otherwise classify intent (readings summary, medication lookup, lab summary, appointments, term explanation, clinician questions, general search).
2. **Retrieval**: profile-scoped SQL queries; numbers (averages, ranges, trends, conversions, dates) are computed by `domain/` code, never by the model. Each fact carries record IDs and timestamps.
3. **Knowledge library**: bundled, versioned JSON articles with source, publisher, year, review status and review date.
4. **Generation**: if a local model is loaded, llama.rn rephrases the deterministic facts into a short answer with a strict system prompt (no diagnosis, no dosing, cite only provided facts). Output passes an **output guard**; violations are replaced by a safe message.
5. **Fallback**: without a model the same facts render as a deterministic summary + local search results.
6. **Display**: three visually distinct sections — *From your records* (with timestamps/units), *Reference library* (source + review date), *Generated explanation* (labelled "AI-generated on this device").

## 4. Data model (SQLite, migration v1)

`profiles`, `conditions`, `target_ranges`, `medications`, `medication_schedules`, `medication_events`, `vital_readings`, `custom_vital_types`, `lab_tests`, `lab_results`, `appointments`, `documents`, `reminder_jobs`, `audit_events`, `app_settings`, `schema_migrations`.

- UUID text primary keys (`expo-crypto.randomUUID`).
- `PRAGMA foreign_keys = ON`; children reference `(id, profile_id)` composite keys so a row can never point at another family member's parent row.
- Timestamps: UTC ISO-8601 (`…Z`) + IANA zone + UTC offset minutes at the time of measurement.
- Indexes on `(profile_id, type, measured_at)`, `(profile_id, scheduled_for)`, etc.
- All writes via parameterized statements; multi-row changes in exclusive transactions.
- Documents copied into private app storage (`Paths.document/documents/<profileId>/`), DB stores relative paths only.

## 5. Milestones

| # | Milestone | Verification |
|---|---|---|
| 1 | Plan, scaffold, design system, SQLite + migrations | migration integration tests |
| 2 | Profile setup (onboarding) + dashboard | persistence tests; UI preview |
| 3 | Medications, schedules, dose events | schedule/status unit tests; regeneration integration tests |
| 4 | Vitals, charts, labs, appointments | units/stats/chart-scale unit tests |
| 5 | Local notifications + reconciliation | reconciliation unit tests |
| 6 | Demo mode (fictional, labelled) | seed integration test |
| 7 | llama.rn integration + model manager | Jest mock locally; **real verification on device** |
| 8 | Retrieval, sources, deterministic calc, safety routing, fallback | router/guard/retrieval tests; offline test |
| 9 | Security (SQLCipher, app lock), export/delete, error handling | deletion integration tests |
| 10 | Docs: build instructions, privacy, model compatibility, disclosures, demo script | — |

## 6. Status (end of 2026-10-09)

| # | Status |
|---|---|
| 1–6 | Done and covered by tests (145 unit, 50 integration) |
| 7 | llama.rn engine, model catalog (verified hashes), download/import/verify, load/unload and benchmark UI are implemented. **On-device run still pending** (needs an EAS build) |
| 8 | Done: router, retrieval, library with sources, guard, deterministic fallback; offline integration tests |
| 9 | SQLCipher adapter with key in SecureStore, app lock, export/delete (deletion integration-tested), error screens. **Encryption confirmed only on device** (Settings shows the cipher version) |
| 10 | README, DISCLOSURES, Android build and device-testing guide, privacy and safety, demo script |

## 7. Known limits (tracked honestly)

- Native paths (SQLCipher, llama.rn, notifications, biometrics) cannot be executed on this Windows host; they are verified on the physical Android device via an EAS development build.
- Clinical content is a draft; it needs review by a licensed clinician before real-world use.
- iOS: not yet built (needs EAS + Apple developer account).
