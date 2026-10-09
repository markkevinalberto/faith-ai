# Android: build, install and test on a device

FAITH needs a **development build** or a **preview build**. Expo Go doesn't include SQLCipher, llama.rn or the native notification actions. Builds run on **EAS** in the cloud, so this Windows machine needs no Android SDK or JDK.

## 1. One-time setup

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

`eas init` links the project to your Expo account and writes `extra.eas.projectId` into `app.json`. The Android package (and iOS bundle ID) is `com.faithai.app`. It can't be changed after the app is published to a store.

> **llama.rn native libraries.** llama.rn's `postinstall` downloads prebuilt Android JNI libraries and verifies their checksums. On EAS (Linux) this happens automatically. `package.json` → `allowScripts` approves it for npm 11.16 or later; if you upgrade llama.rn, update that entry too. On this Windows machine, run local installs as `RNLLAMA_SKIP_POSTINSTALL=1 npm install`, because Git's `tar` breaks the extraction. Local JS and test work doesn't need the native libraries.

## 2. Build

| Goal | Command | Result |
|---|---|---|
| Day-to-day development (hot reload from your PC) | `npx eas-cli@latest build -p android --profile development` | APK with the dev client |
| **Demo day** (standalone, no PC needed) | `npx eas-cli@latest build -p android --profile preview` | APK with the bundled JS |
| Play Store | `npx eas-cli@latest build -p android --profile production` | AAB |

Install the APK from the EAS link or QR code on the phone (allow "Install unknown apps" for your browser).

For a development build, start Metro on the PC and open the app on the phone over the same Wi-Fi:

```bash
npx expo start --dev-client
```

## 3. Device test checklist

Run these on the physical phone and record the results. They can't be verified on Windows or in the web preview.

**Storage and security**
- [ ] Settings → Security shows **"Database encrypted · SQLCipher x.y"**. If it says "unavailable", SQLCipher wasn't compiled in. Check the `expo-sqlite` plugin option `useSQLCipher: true` and rebuild.
- [ ] Turning on the app lock asks for fingerprint, face or PIN. Background the app for more than 30 s, return, and it should be locked. The app switcher shows the lock cover.
- [ ] Export JSON and CSV open the share sheet, and the temporary file is gone afterwards.
- [ ] Deleting a profile, then reopening the app: no data remains. "Erase everything" returns to onboarding.

**Reminders** (use a real profile; the demo profile never schedules reminders)
- [ ] Adding the first medication asks for notification permission.
- [ ] A dose scheduled 2–3 minutes ahead fires with the app closed. Check the medicine name is hidden while "Hide medicine names" is on.
- [ ] Each notification button works: **Taken** records the dose, **Snooze 10 min** fires again, **Skip** records a skip.
- [ ] Editing a medication's time moves the reminder. Pausing or deleting a medication removes its reminders.
- [ ] Rebooting the phone keeps reminders (expo-notifications registers `RECEIVE_BOOT_COMPLETED`).

**On-device AI** (do this before the demo)
- [ ] Settings → On-device AI shows RAM, free storage and CPU ABI, plus a compatibility verdict per model.
- [ ] Downloading over Wi-Fi shows progress, then "verifying checksum", and the model loads.
  - Alternative with no network: copy `qwen2.5-1.5b-instruct-q4_k_m.gguf` to the phone, then use **Import model file**.
- [ ] **Run a quick on-device test** in airplane mode prints a sentence and its tokens per second.
- [ ] In airplane mode, Ask FAITH with "Summarize my glucose this week" shows a **Generated explanation · on this device** block above the record facts.
- [ ] "I missed my metformin, should I take two?" is refused and the model is not called.

## 4. Model compatibility

| Model | File | Minimum RAM | Recommended RAM | Notes |
|---|---|---|---|---|
| Qwen2.5 1.5B Instruct Q4_K_M | 1.12 GB | 4 GB | 6 GB or more | Best wording |
| Qwen2.5 0.5B Instruct Q4_K_M | 0.49 GB | 2 GB | 3 GB or more | Faster, simpler wording |

- **ABI:** llama.rn supports `arm64-v8a` and `x86_64` only. 32-bit-only phones are blocked in the UI.
- **CPU only:** `n_gpu_layers: 0`, and OpenCL/Hexagon are disabled in the plugin, for broad compatibility. Expect roughly 5–20 tokens/s for 1.5B on recent mid-range and flagship phones. These are estimates; measure on your phone with the built-in test.
- **Context:** 2048 tokens. Answers are capped at 220 tokens and time out after 90 s, after which the record summary is shown.
- **Memory:** the model loads when Ask FAITH opens, if one is installed and active. Settings → On-device AI → Unload frees it.

## 5. Notification limitations (Android)

- **Exact timing.** `SCHEDULE_EXACT_ALARM` is declared, but Android 14+ doesn't grant it by default. Without it, reminders may arrive a few minutes late. The user can enable it in Settings → Apps → FAITH → Alarms & reminders; the app links there.
- **Battery savers.** Some manufacturers' aggressive battery management can delay or drop scheduled notifications. Exclude FAITH from battery optimisation.
- **Rolling window.** Reminders are scheduled 7 days ahead, up to 60 at a time. On the last evening a "Keep your reminders running" notification asks the user to open the app, which schedules the next week. Opening the app at any time refreshes reminders.
- **Action buttons open the app.** Taken, Snooze and Skip bring FAITH to the foreground to record the action. If the app lock is on, the action is applied only after unlocking.
- **Time zones and DST.** Dose times are local wall-clock times in the phone's current time zone. After travel or a DST change, untouched future doses are re-timed on next launch. Times that don't exist during a spring-forward gap move forward by the gap length; ambiguous fall-back times use the first occurrence. Both rules are covered by unit tests.
