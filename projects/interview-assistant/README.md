# Interview Assistant for Windows

A standalone Windows desktop prototype that listens to Zoom audio, transcribes interview questions, and streams spoken-style answers using a local career profile or a hypothetical case approach. The default translucent overlay is 460 Ã— 380 pixels, with only the question, current answer section, and small controls visible. Everything else is under **Options**.

Everything for this project lives in this directory. It does not use or change the existing JobSearchOS server, dashboard, dependencies, or data. The repository contains only fictional sample career data.

## Current capabilities

- Zoom-only Windows application loopback capture (Zoom process and descendants), plus an explicit output-device fallback, audio meter, bounded buffering, and pause/resume.
- OpenAI Realtime transcription with incremental text, client-side speech endpointing, and ordered final turns.
- Streamed Responses API answers using the current question, recent conversation, relevant CV facts, and target JD. Project-title/tag weighting, plural normalization, and hyphen handling improve CV story retrieval. Completed questions generate an answer automatically; Options contains the manual-mode toggle.
- Detailed answers by default, plus Balanced/Brief settings, cancellation, typed follow-ups, and an explicit way to add what the candidate actually said to conversation context.
- Product/design, metrics, RCA, estimation, strategy, platform/system design and conceptual questions beyond the CV. Known cases can show a specific local opening immediately; other questions begin with their first substantive streamed section. Generic framework openings are avoided.
- Nine technical PM playbooks, retrieval over 579 repository question entries and ten worked cases, and optional private handbook preparation. Full Detailed cases have a 500â€“750 word target; if the first draft is under 420 spoken words, at most one streamed continuation adds missing reasoning. Narrow follow-ups stay focused.
- Sections are split into small pages that adapt to window/text size. Next/previous shortcuts keep the reading area fixed; new sections do not automatically replace the current page. Clarifications can carry case context forward.
- Local rehearsal of saved talking points without a credential or network request.
- Compact translucent always-on-top view, expandable settings, tint/text controls, draggable header, wide resize handles on all edges and corners, and a center-near-camera action. Positioning can reduce scanning; it cannot guarantee no eye movement.
- Windows capture-exclusion flag with readback. The UI explicitly reports that Zoom has not been verified.

## Run a portable build

Extract the complete published folder and open `InterviewAssistant.exe`. Keep its DLLs and runtime files alongside it. A self-contained Windows x64 build does not need a separate .NET installation.

1. Close any older assistant instance so it releases its keyboard shortcuts. Open **Options** to load a private profile JSON, or use the fictional sample for local rehearsal.
2. For live features, choose an existing private environment file using **Select local API env file**, or start the app with `OPENAI_API_KEY` in its process environment. The app does not display, create, or write API keys.
3. Leave **Zoom desktop only** selected and open the Zoom desktop meeting. Zoom is detected when listening starts; headphones help separate meeting playback from your own speech. For browser Zoom or other output capture, explicitly choose **Output device (manual)** and the output used by the meeting.
4. Click **â–¶** once or use **Ctrl+Alt+Space**. Partial questions appear immediately as transcription arrives. Completed prompts trigger answers after a 250 ms debounce. The default speech-end pause is 550 ms; increase it under Options if the interviewer pauses mid-question.
5. Position the narrow window below your webcam. Drag any edge/corner to resize. Use **Next** or **Ctrl+Alt+Right** to read the next section. **Options** contains tint, text size, answer detail, audio settings, profile/stories, models, transcript, sources and clear-session controls.
6. For a favourite-product case, optionally set an example product under Options. A named product in the question takes precedence. The tool does not establish personal usage or preferences, fetch live company research, or guarantee it can correctly answer every possible question.

The application never starts listening automatically. API access and billing must be enabled for the selected models; signing into ChatGPT alone does not configure this application.

| Shortcut | Action |
|---|---|
| Ctrl+Alt+Space | Start/pause listening |
| Ctrl+Alt+Enter | Generate an answer |
| Ctrl+Alt+H | Hide/show the window |
| Ctrl+Alt+Right / Left | Next / previous spoken section |
| Ctrl+Alt+S | Stop generating an answer |
| Escape | Cancel the current answer while this window has focus |

Unavailable shortcuts are reported at startup. **Ctrl+Alt+Space** pauses capture, pending automatic requests and the current answer. **Ctrl+Alt+S** cancels only answer generation. Hiding the window keeps listening active. Closing stops both. **Clear session** stops listening and clears the session context.

## Data and grounding

### PM answer preparation

The [PM answer skills](knowledge/PM-ANSWER-SKILLS.md) cover product judgement, metrics/experimentation, diagnosis, estimation, strategy/build-buy, platform/system design, behavioural ownership, positioning and technical deep dives. They emphasize concrete workflow, failure semantics, alternatives, economic trade-offs, measurement and acceptance criteria. They are reasoning and voice guides, not claims that the candidate has five years of PM tenure.

The app retrieves relevant prompts and worked-case considerations from a bundled snapshot of `public/coach/questions.js` and `public/coach/data.js`. Those original files are unchanged. Company/interview attributions in the source are not independently verified. It does not train/fine-tune a model or pre-generate every answer. Similar cases are context; their numbers, findings and invented interviewer replies must not be transferred to the current question.

Regenerate the snapshot and readable skillbook from this project directory:

```powershell
node .\scripts\prepare-corpus.cjs
```

Import a private handbook into a **new** profile copy using Python 3:

```powershell
python .\scripts\prepare-handbook.py --profile .\private\original-profile.json --handbook C:\path\to\handbook.md --output .\private\prepared-profile.json
```

The importer preserves original files and CV facts. `PreparationNotes` remain PREP, DESIGN, REFERENCE or BOUNDARY data, even when the document contains an inline `[CV]` label. They can inform explanations, proposed designs and follow-up preparation; they do not establish shipped implementation, personal research or measured impact. Runtime retrieval is local and cached. Only the selected snippets are sent with an answer request. Consumer cases exclude unrelated company/interview handbook material; relevant platform and career questions can retrieve it. Private profile/handbook contents must stay outside public GitHub history.

The speech policy leads with a concrete decision and explanation rather than a repeated framework. References and verification lists belong in optional notes. Missing project-specific impact remains unknown; adjacent workflow metrics are not substituted as an AI project's results. A depth continuation can increase completion time and API use; the first sections remain visible while it runs. Cancellation stops either request.

The [profile sample](samples/profile.example.json) and [schema notes](samples/README.md) describe the JSON format. PDF/Markdown/JD ingestion is a preparation step in this version; the app imports the resulting JSON, not arbitrary documents.

Only facts labelled `CV` are supplied as evidence for personal accomplishments. This label means claimed in the supplied CV, not independently verified. `TALKING_POINT`, `DESIGN`, and `VERIFY` claims remain separate and are excluded from generated personal claims. Saved `SpokenAnswer` text is shown only as local rehearsal. Relevant caveats are included in AI requests. Job descriptions and document text are treated as untrusted data, not system instructions.

Suggestions are labelled `suggestion_not_spoken` in conversation context. To ground a follow-up in your actual response, type what you said into the question field and use **Add Q text as what I said** under Options. Microphone transcription and speaker diarization are not implemented. Cases use explicit working assumptions; speculative numbers and solutions are not presented as measured company facts.

Profile files stay on disk at the location you choose. During generation, selected facts, private preparation snippets, skill/case context, source labels, target JD, question, and recent conversation are sent to OpenAI. During listening in Zoom mode, playback from the detected Zoom process and its descendants is sent to OpenAI. This includes all meeting participants and any other playback inside Zoom; it does not identify individual speakers. The explicit output-device fallback sends all audio on that output, including unrelated apps. Zoom browser tabs require that fallback. No microphone is captured.

The app does not save raw audio or transcripts by default. Settings contain file paths, selected devices and model names, never key values. Settings are in `%LOCALAPPDATA%\JobSearchOS.InterviewAssistant\settings.json`. Responses requests use `store: false`; this is not a claim of zero provider-side retention. Private profiles, credentials, logs and build outputs are excluded by the project `.gitignore`; keep private source documents outside the public repository.

## Requirements and configuration

- Windows build 20348 or newer for Zoom-only process capture (Windows 11 is tested). Output-device fallback and capture exclusion require Windows 10 version 2004 or newer.
- Windows x64 for the provided publish target.
- A working speaker/headphone output endpoint, internet for live features, and model access in an OpenAI API project.
- .NET 10 SDK for development only; NAudio 2.2.1 is restored from the committed package lock files.

Default models are `gpt-live-transcribe` with `delay: minimal` and `gpt-6.1-sol` with low reasoning for answers and cases. A lighter model was evaluated but repeated output in local checks, so it is not the default. HTTP connections are pooled across answers, and CV packets are bounded to relevant evidence. Model fields are editable under Options. `TranscriptionModel`, `AnswerModel`, `CaseModel`, `EndpointSilenceMs`, reading size/tint and example product also live in local settings. No premium service tier is enabled. No particular latency or accuracy is guaranteed.

Optional process environment settings:

| Name | Purpose |
|---|---|
| `INTERVIEW_ASSISTANT_PROFILE` | Absolute path to a private profile JSON |
| `INTERVIEW_ASSISTANT_ENV` | Absolute path to an existing credential file |
| `OPENAI_API_KEY` | Process credential; takes precedence over the selected file |

## Build and test

From this directory in PowerShell:

```powershell
.\scripts\build.ps1
.\scripts\test.ps1
.\scripts\test.ps1 -Audio
.\scripts\publish.ps1
```

All scripts accept `-DotNetPath 'C:\path\to\dotnet.exe'` for a local SDK installation. Publishing creates `publish\win-x64`; use `-OutputPath` for a different destination. No script edits the root repository configuration.

The offline tests use simulated API streams and cover failures, cancellation, grounding, transcript order, endpointing, credential parsing and invalid profiles. The native WPF workflow test verifies automatic answers, manual mode, and cancellation when speech resumes using a fake API. `-Audio` additionally plays quiet test tones, checks output loopback, and verifies process isolation against a separate tone process; it makes no API calls and saves no audio.

Native UI checks:

```powershell
.\publish\win-x64\InterviewAssistant.exe --diagnostics --output diagnostics.json
.\publish\win-x64\InterviewAssistant.exe --smoke-test --profile .\samples\profile.example.json --output preview.png
```

Smoke mode renders compact, expanded-options, case and minimum-size views with alpha transparency, then probes capture flags across hide/show and minimize/restore. Its JSON reports transparency, dimensions, tint and audio/answer modes. It does not perform a Zoom receiver test. Use fictional data for any screenshots you intend to publish.

## Validation boundary

This revision passes 30 offline/native checks, including corpus completeness, category routing, worked-case constraints, handbook relevance and evidence boundaries, copilot retrieval, bounded streamed depth continuation, and the existing compact/auto/manual UI workflow. Live checks cover 12 distinct prompts across product design, RCA, technical systems, metrics, strategy, estimation, career/CCV and a constrained follow-up, with three v3 baselines captured for comparison. Final full-case samples contained roughly 650-750 spoken words; narrow follow-ups stayed shorter. First generated text took about 1.6-6.4 seconds in those local checks. Detailed cases finished while streaming in roughly 23-32 seconds; concept/career/follow-up answers were shorter. A shallow-answer continuation can add a second request. These are sampled observations, not accuracy, naturalness or Zoom latency guarantees. The 579-entry corpus was indexed, not exhaustively answered or evaluated. The private handbook and CV remain local and are not committed.

The native audio and capture implementation is unchanged from v3. The portable smoke test checks compact/expanded/minimum-size rendering and capture flag readback. Actual Zoom meeting audio and receiver-side exclusion still require validation.

Before relying on capture exclusion, join a Zoom test call on a second device and inspect the receiver's view while sharing the whole display and a specific application window. Repeat for the actual monitor, Zoom sharing mode, hide/show, minimize/restore and app restart you plan to use. Windows display affinity is best-effort supported-capture exclusion, not universal invisibility. Other capture methods or external cameras can still see the panel.

## Implementation references

- [OpenAI Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
- [OpenAI Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [GPT-6 model configuration](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol)
- [Microsoft SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)
- [Microsoft application loopback capture](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)
- [Microsoft loopback recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- [NAudio](https://github.com/naudio/NAudio)
