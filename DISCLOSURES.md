# FAITH AI — Disclosures

Everything FAITH uses to work, and how it was built. Last updated 2026-10-09.

## AI inference (runs locally on the phone)

| Component | What it does | Licence | Where it runs |
|---|---|---|---|
| **Qwen2.5-1.5B-Instruct**, GGUF Q4_K_M (1,117,320,736 bytes, SHA-256 `6a1a2eb6…9407e`) | Rephrases facts that FAITH has already computed into short answers | Apache-2.0 (Alibaba Cloud Qwen team) | On the device CPU |
| **Qwen2.5-0.5B-Instruct**, GGUF Q4_K_M (491,400,032 bytes, SHA-256 `74a4da8c…7a9db`), "Lite" option | Same, for phones with less RAM | Apache-2.0 | On the device CPU |
| **all-MiniLM-L6-v2**, GGUF Q8_0 (25,008,064 bytes, SHA-256 `263215c3…2f8ed`), converted by second-state | Sentence embeddings for semantic search over your records and the library | Apache-2.0 (sentence-transformers) | On the device CPU |
| **Whisper base.en** (147,964,211 bytes, SHA-256 `a03779c8…6d002`) and **tiny.en** (77,704,715 bytes, SHA-256 `921e4cf8…b1f`), ggml format | Speech-to-text for voice questions and voice logging | MIT (OpenAI); ggml conversion by the whisper.cpp project | On the device CPU |
| **llama.cpp** through **llama.rn 0.12.9** | Native runtime for the chat and embedding models (GGUF loading, sampling, JSON-schema constrained output) | MIT | On the device |
| **whisper.cpp** through **whisper.rn 0.7.4** | Native runtime for Whisper | MIT | On the device |
| **llama.cpp compiled to WebAssembly** through **wllama 3.8.1** | Runs the same Qwen2.5 and all-MiniLM-L6-v2 GGUF files in the browser build, inside a Web Worker (multi-threaded when the page is served with cross-origin isolation headers) | MIT | In the browser. Model files are kept in the browser's private origin storage. On Safari, wllama loads a compatibility build of its worker from jsDelivr; other browsers use the WebAssembly file served with the site |
| **Google ML Kit Text Recognition v2** (bundled model, `com.google.mlkit:text-recognition` 16.0.1) through **@react-native-ml-kit/text-recognition 2.0.0** | Reads text from photos of medicine labels and lab reports | ML Kit Terms of Service (free); wrapper MIT | On the device. The model ships inside the app, so it needs no download and no network |

- Models come from the official `Qwen/Qwen2.5-*-Instruct-GGUF` and `ggerganov/whisper.cpp` repositories and the `second-state/All-MiniLM-L6-v2-Embedding-GGUF` repository on Hugging Face. Each download is verified on the phone by size, file header (GGUF or ggml) and MD5. The MD5 values were matched to the published SHA-256 on 2026-10-09.
- The semantic-search thresholds were calibrated on 2026-10-09 by running all-MiniLM-L6-v2 (via transformers.js, on the development PC) over FAITH's library and sample records. The app itself uses only the on-device GGUF model.
- **No cloud AI API is used unless you switch on the optional online assistant** (its own section below). Without a model, FAITH answers from deterministic record summaries and the offline library.
- Core "local AI" features run fully offline:
  - the safety and intent router
  - retrieval and calculations
  - the library search
  - on-device generation
  - the output guard
  - semantic search (embeddings)
  - voice transcription (Whisper)
  - label and lab-report scanning (ML Kit OCR, parsers, and grounded extraction by the on-device LLM)
- **Network use:** the only requests FAITH can make are the model downloads that you start yourself from Settings → On-device AI (to huggingface.co). They send no health data. You can also import model files from phone storage with no network at all. The browser build downloads the same files into the browser's private storage; voice and scanning are not part of the browser build.

## Optional online assistant (off by default)

Added 2026-10-10. In Settings → Online assistant (or with one tap on the offer card in Ask FAITH), a person can switch on a cloud model for Ask FAITH and FAITH's notes. Three ways to reach one:
- **FAITH's assistant (default, no key or account):** the app calls a small relay deployed with the FAITH website, `https://faith-ai-web.vercel.app/api/chat/completions` (source: `web/api/chat/completions.js`, a Vercel function in the United States). The relay holds the project's Groq key as a server environment variable, checks each request (allowed models only, at most 12 messages / 16,000 characters / 400 output tokens, a small per-client rate limit), forwards it to Groq, and returns the reply. It stores and logs nothing from the request or the answer. It is shared by all FAITH users, so Groq's free-plan limits (30 requests a minute, 1,000 a day) apply to everyone together; when they are used up, FAITH answers on the device.
- **Own Groq key:** the person's own **Groq free plan** key (`openai/gpt-oss-120b` by default; also `openai/gpt-oss-20b` and `qwen/qwen3.8-27b`), reached directly through Groq's OpenAI-compatible endpoint `https://api.groq.com/openai/v1`.
- **Custom:** any other OpenAI-compatible service, with its own key.

- **What is sent:** the same prompt the on-device model gets: the system prompt, the question, the facts FAITH computed from the person's records (the ones shown under the answer), the library excerpts, and up to four earlier exchanges of the same chat. Nothing else leaves the device; nothing is sent when the switch is off, when there is no key, or when there is no internet.
- **Same rules:** the online model's answer passes through the same output guard (no dosing, no diagnosis, no "normal/safe", no unsupported numbers, required band phrases). If it fails or the service is unreachable, FAITH falls back to the on-device model, then to the record summary. Every online answer is labelled "online (Groq)".
- **Groq's data handling (per its "Your Data" page, read 2026-10-10):** inference requests are not retained by default; logs of up to 30 days may be kept only for reliability or abuse investigations, which the account owner can opt out of with Zero Data Retention; data is processed in the United States. Its free plan allows 30 requests a minute and 1,000 a day. Google's Gemini API was considered and not used: its unpaid tier may be read by human reviewers and used for training, and its terms exclude providing medical advice.
- A person's own API key is stored in expo-secure-store on the phone (localStorage in the browser build) and is never written to FAITH's database or logs. The relay's key is never sent to any device.
- The hackathon's "hybrid local + cloud" category applies: the core local AI (router, retrieval, library, on-device generation, guard, embeddings, voice, scanning) works with the switch off and offline.

## Frameworks and libraries

- React Native 0.86, React 19.2, TypeScript 6 (all MIT or Apache-2.0)
- Expo SDK 57 (MIT):
  - expo-router
  - expo-sqlite, with SQLCipher enabled through its config plugin
  - expo-secure-store
  - expo-notifications (local notifications only)
  - expo-local-authentication
  - expo-file-system, expo-document-picker, expo-sharing
  - expo-localization, expo-device, expo-crypto
  - expo-image-picker (camera and gallery for scanning)
  - expo-network (connection and airplane-mode status for the offline badge)
  - expo-build-properties, expo-dev-client
- react-native-svg (MIT), used for the custom time-scaled charts
- @fugood/react-native-audio-pcm-stream 1.1.4 (MIT): microphone capture as raw PCM in memory
- buffer 6.0.3 (MIT, feross): the Node `Buffer` polyfill that whisper.rn expects the app to provide
- @react-native-community/datetimepicker (MIT)
- @expo/vector-icons and Ionicons (MIT)
- Testing and tooling: Jest with jest-expo, Node's built-in `node:sqlite` for integration tests, ESLint with eslint-config-expo, and EAS Build for Android binaries

## Reference content

The offline reference library and the escalation rules paraphrase public guidance:
- ADA Standards of Care 2025 and the ADA/EASD hyperglycaemic crises consensus
- ISH 2020 and ESC 2024 hypertension guidelines
- AHA patient education
- WHO pulse oximetry, IMAI, Basic Emergency Care, HEARTS and adherence publications
- KDIGO 2024
- The NGSP/IFCC HbA1c equation
- NCEP ATP III (NHLBI, 2002) for the lipid categories in the biomarker catalog
- MedlinePlus (NIH) medical-test pages for typical adult laboratory ranges (creatinine, BUN, uric acid, ALT, AST, sodium, potassium, TSH), always shown as "typical laboratory range" with the report's printed range taking precedence
- WHO 2024 guideline on haemoglobin cut-offs for anaemia

Every article and rule is labelled **"Draft — pending clinical review"**. See `src/ai/knowledge/sources.ts` for full citations.

## How it was built

- Built during the hackathon, starting on 2026-10-09 from the empty `create-expo-app` default template. All application code, tests and docs were written for this project.
- **AI-assisted development:** written with Claude Code (Anthropic) as a coding assistant. Claude is not part of the app and is never called at runtime.
- **AI-generated artwork:** the FAITH nurse mascot, feature illustrations, empty-state art and the heart logo design were created with **Google Flow** and **ChatGPT** image generation. The mascot poses in `assets/illustrations/` are transparent cut-outs from the character sheet, and the other illustrations are cropped from the design board. The app icon and splash are vector re-drawings of the logo, made by a script in this project. These tools were used only to make artwork during development; the app never calls them.
- Demo data is fictional and generated by a seeded generator (`src/services/demoSeed.ts`).
