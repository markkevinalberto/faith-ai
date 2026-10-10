# FAITH AI — AppBuildersPH Hackathon 2026 submission

**Theme:** Local AI. *"Build an AI product that remains genuinely useful when the cloud disappears."*

**FAITH** = **F**amily **A**ssistant for **I**llness, **T**reatment & **H**ealth. A private health companion for people living with diabetes and high blood pressure (and the family members who help them), with the AI running on the phone.

| | |
|---|---|
| Repository | https://github.com/markkevinalberto/faith-ai-appbuildersph |
| Web demo (same AI in the browser) | https://faith-ai-web.vercel.app |
| Landing page | https://faith-ai-landing.vercel.app |
| Android APK | https://github.com/markkevinalberto/faith-ai-appbuildersph/releases (preview build 9) |
| Submitted by | Mark Kevin Alberto (GitHub: markkevinalberto) |
| Built | 9–10 October 2026, from an empty `create-expo-app` template |
| Disclosures | [DISCLOSURES.md](../DISCLOSURES.md) (models, libraries, tools, AI-assisted development) |

---

## The pitch (60 seconds)

People with diabetes or hypertension juggle medicines, readings, lab reports and appointments, often for a parent as well as themselves. The help they get from apps today depends on the cloud: an account, a connection, a monthly plan, and their most private data on someone else's server.

FAITH keeps everything on the phone. A small language model, an embedding model, a speech model and a text-recognition model all run on the device, so FAITH can **read a lab report, listen to a reading, find a note by meaning, and explain a result like a nurse would**, in airplane mode. It never diagnoses or changes a dose; every answer is built from facts computed by tested code, and a safety guard checks every sentence the model writes.

When the internet *is* there, the person can switch on a bigger online model with one tap. When it isn't, nothing stops working.

## What FAITH does

- **Care plan:** medicines with the instructions copied from the label, dose reminders, refill alerts, lab tests with preparation notes, appointments with prepared questions.
- **Vitals:** glucose, blood pressure, pulse, weight, SpO₂, temperature, with true-time charts, target bands set by the clinician, and safety cards for dangerous values.
- **FAITH's note:** after every reading or lab result, the mascot says where it sits, compares it with the last one, gives guideline tips and food advice (Filipino foods), and asks a nurse-style follow-up question with Yes/No answers. Red-flag answers bring up the emergency card.
- **Ask FAITH:** a chat about your own records: "summarize my glucose this week", "my HbA1c is 4,7", "did I ever feel dizzy?", "prepare questions for my appointment".
- **Scan:** medicine labels and lab reports from a photo; three-tap manual entry with built-in reference ranges for 18 common tests.
- **Voice:** ask by voice, or say "blood pressure 130 over 85".
- **Family profiles** with strict data isolation; **encrypted database** (SQLCipher) with the key in the Android keystore; app lock; export and permanent deletion.
- **Senior-friendly:** large type, a Text size setting, big buttons, plain words.

## Local AI, feature by feature

| Feature | Model / runtime on the phone | Without the model |
|---|---|---|
| Ask FAITH and FAITH's note | Qwen2.5 1.5B or 0.5B Instruct (GGUF Q4_K_M) through llama.cpp (llama.rn); in the browser the same file through llama.cpp WebAssembly (wllama) | Computed record summary + library text (still useful) |
| Semantic search | all-MiniLM-L6-v2 embeddings through llama.cpp | Keyword search |
| Voice | Whisper base.en / tiny.en through whisper.cpp (whisper.rn); audio stays in memory | Typing |
| Scan labels and reports | Google ML Kit text recognition (model bundled in the APK) + layout reconstruction + tested parsers; the LLM fills only missing fields, and every value it returns must appear in the scanned text | Manual entry |
| Safety router, retrieval, calculations, output guard | Deterministic TypeScript, 316 automated tests | Always on |

Models download once from Hugging Face (verified by size, header and checksum); the first-run set-up picks the right ones for the phone's memory and starts on Wi-Fi by itself. After that FAITH needs no network at all.

## Why local beats cloud here

1. **Privacy:** readings, lab reports, voice and prescriptions never leave the phone. No account, no server, no analytics.
2. **Availability:** works in clinics with no signal, in the provinces, on prepaid data, during outages, and at 3 a.m.
3. **Cost:** no per-question API cost, so a barangay health worker or a family can use it without a subscription.
4. **Grounding:** the model only sees facts computed from the person's own encrypted records, so answers are about *them*.

## Hybrid, by choice

The optional **online assistant** (Settings → Online assistant, or one tap on the offer card) sends the same prompt to a bigger model (GPT-OSS 120B on Groq's free plan through a small relay on the FAITH website that stores nothing, or the person's own key). The same guard checks its answer and every online answer is labelled; offline, FAITH falls back to the phone model. It is off by default, so the core product is the local one.

## How it was built

- Expo SDK 57 / React Native 0.86 / TypeScript, Expo Router, EAS Build for Android, Vercel for the web build and the relay function. See [ARCHITECTURE.md](ARCHITECTURE.md).
- 31 commits over two days; 316 automated tests (unit, plus integration tests on a real SQLite database); TypeScript strict and ESLint clean.
- AI-assisted development with Claude Code as the coding assistant (disclosed; Claude is never part of the app). Artwork made with Google Flow and ChatGPT image generation.
- Clinical content paraphrases ADA, ISH/ESC, WHO, AHA, KDIGO, NCEP ATP III and MedlinePlus, and is labelled **draft, pending clinical review** everywhere it appears.

## How FAITH meets the rules

| Rule | How |
|---|---|
| Substantially built during the hackathon | Started 2026-10-09 from the empty template; all app code, tests and docs are in the repository history |
| Meaningful AI inference runs locally | LLM generation, embeddings, speech-to-text and OCR all run on the device; measured on a physical Android phone and in the browser |
| A working product, demonstrated | APK + web demo + sample profile + [demo script](DEMO_SCRIPT.md) that runs in airplane mode |
| Models, APIs, frameworks and tools disclosed | [DISCLOSURES.md](../DISCLOSURES.md), the in-app About screen, and this document |
| Core local AI does not depend on a cloud AI API | The online assistant is optional and off by default; everything works with it off |

---

## Questions the judges may ask, and the answers

**"What exactly runs on the device?"**
Four models and all the logic around them: Qwen2.5 (1.5B or 0.5B) for writing answers, all-MiniLM-L6-v2 for semantic search, Whisper for speech, and ML Kit for reading photos. The safety router, record retrieval, statistics, the reference library and the output guard are plain TypeScript. Turn on airplane mode and every feature still works; the status line on the Ask screen shows it live.

**"Isn't this just a small chat model with a medical system prompt?"**
No. The model is the last and least trusted step. A deterministic router first catches emergencies and requests to change medicines (those never reach the model). Tested code then retrieves the person's records and computes the numbers: averages, ranges, trends, where a value sits against the clinician's target or a published reference scale. The model is only allowed to reword those facts, and the guard throws the draft away if it adds a number that isn't in the facts, claims something is "normal" or "safe", diagnoses, or suggests changing a dose. Without any model, FAITH still answers with the computed facts.

**"How do you stop it from giving dangerous medical advice?"**
Layers: (1) refusals for dosing, prescribing and diagnosis, with the recorded instructions shown instead; (2) escalation cards for dangerous values, with a Call button; (3) the output guard described above, including required phrases (the model must repeat the computed band, e.g. "below the prediabetes range", word for word); (4) curated tips that never mention medicines; (5) every clinical statement cites its guideline and is labelled a draft pending clinical review. FAITH is an organiser and educator, not a diagnostic device.

**"Why Qwen2.5, and why such a small model?"**
It has to run on mid-range Android phones with 4–6 GB of RAM, so the choice was between 0.5B and 1.5B parameters at 4-bit quantisation (0.47 GB and 1.04 GB). Qwen2.5 Instruct is Apache-2.0, well supported by llama.cpp, and follows instructions well for its size. The catalog is data-driven, so Qwen3 1.7B or a 4B model can be added in a few lines; the trade-off is download size, RAM and speed.

**"How fast is it?"**
In the browser build on a desktop, the 0.5B model writes at about 42–44 tokens per second through WebAssembly with 8 threads. On the phone, the embedding and Whisper models were verified end to end; the 1.5B chat model typically writes a 3-sentence answer in a few seconds on a recent mid-range phone. The in-app "Run a quick test" shows the measured tokens per second on the judge's own phone.

**"What is semantic search doing?"**
Records and library articles are embedded on the device with all-MiniLM-L6-v2 (a 24 MB model). A question like "Did I ever feel dizzy?" finds the note "felt shaky after a long walk" even though no words match. We calibrated the similarity thresholds on FAITH's own library and sample records, and keyword matches are always kept too.

**"How accurate is the lab-report scanning?"**
ML Kit reads the photo on the phone; FAITH rebuilds the table rows from the text boxes, then a tolerant parser reads each row (name, value, unit, reference range, flag, in any of the common layouts, including mg/dL and mmol/L side by side). Rows it rebuilt from separate lines are marked "check this row". If the local LLM is installed it may fill in rows the parser missed, but only values that literally appear in the scanned text are accepted. The person ticks what to keep before anything is saved, and can type results in three taps instead.

**"Where is my data, and who can see it?"**
In a SQLCipher-encrypted SQLite database on the phone, with the key in secure storage backed by the Android keystore. No account, no server, no analytics or crash reporting. The only network requests are the model downloads (no health data) and, only if the person switches it on, the online assistant.

**"Then why is there an online option at all?"**
Because a 120-billion-parameter model explains things more naturally than a 0.5B one, and people with good connectivity may want that. It is off by default, needs one explicit tap, sends only what the local model would see, is checked by the same guard, is labelled on every answer, and falls back to the phone model offline. Google's Gemini free tier was rejected on its own terms (training on prompts, human review, no medical-advice use); Groq's free plan doesn't retain requests by default. That makes FAITH a "hybrid local + cloud" product whose core is local.

**"Is this a medical device? Did a clinician review it?"**
No, and not yet. FAITH records, organises and explains; it does not diagnose or change treatment, and says so in the app. The thresholds and library paraphrase published guidelines (ADA, ISH/ESC, WHO, KDIGO, NCEP, MedlinePlus) with citations, and every one is labelled draft pending clinical review. Clinician review is the first item on the roadmap before any real-world use.

**"What was the hardest technical problem?"**
Three stand out. First, SQLCipher on Android: expo-sqlite's transaction helper opened a second connection that never received the key, so the app crashed at start; FAITH now routes every statement through one keyed connection. Second, running the same GGUF models in a browser: wllama needs cross-origin isolation headers, and Vercel silently drops any folder called `node_modules`, which is where Expo puts the WebAssembly files. Third, making a 0.5B model reliable enough for health: the guard's "required phrase" rule came from watching it invert "below the prediabetes range" into "within".

**"How much of this did AI write?"**
It was AI-assisted development with Claude Code, which the rules allow and the disclosures state. The design decisions, the product direction (seniors first, Filipino foods, the nurse persona) and the testing on a real phone were the human part; the 316 automated tests are what we trust, not the tool that typed the code.

**"What's next?"**
Clinician review of the content; Tagalog and Bisaya for the assistant and voice; iOS; caregiver sharing between family members' phones; a bigger on-device model (Qwen3) for phones that can run it; more lab tests in the catalog; and structured export for clinic visits.

**"Can we try it right now?"**
Yes: install the APK, tap "Explore with sample data", and switch on airplane mode. The demo script in `docs/DEMO_SCRIPT.md` takes five minutes. The web version runs the same models in Chrome.
