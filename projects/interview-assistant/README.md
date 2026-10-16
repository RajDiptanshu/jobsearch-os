# Interview Assistant for Windows

A standalone Windows desktop prototype that listens to Zoom audio, transcribes interview questions, and streams spoken-style answers using a local career profile or a hypothetical case approach. The default translucent overlay is 460 × 380 pixels, with only the question, current answer section, and small controls visible. Everything else is under **Options**.

Everything for this project lives in this directory. It does not use or change the existing JobSearchOS server, dashboard, dependencies, or data. The repository contains only fictional sample career data.

## Current capabilities

- Zoom-only Windows application loopback capture (Zoom process and descendants), plus an explicit output-device fallback, audio meter, bounded buffering, and pause/resume.
- OpenAI Realtime transcription with incremental text, client-side speech endpointing, and ordered final turns.
- Streamed Responses API answers using the current question, recent conversation, relevant CV facts, and target JD. Project-title/tag weighting, plural normalization, and hyphen handling improve CV story retrieval. Completed questions generate an answer automatically; Options contains the manual-mode toggle.
- Detailed answers by default, plus Balanced/Brief settings, cancellation, typed follow-ups, and an explicit way to add what the candidate actually said to conversation context.
- Product/design, RCA, estimation, strategy and general conceptual questions beyond the CV. Cases show a relevant local opening immediately after the completed question triggers, while one streamed request builds the detailed solution in ordered sections. These openings are approach templates, not researched answers.
- Sections are split into small pages that adapt to window/text size. Next/previous shortcuts keep the reading area fixed; new sections do not automatically replace the current page. Clarifications can carry case context forward.
- Local rehearsal of saved talking points without a credential or network request.
- Compact translucent always-on-top view, expandable settings, tint/text controls, draggable header, wide resize handles on all edges and corners, and a center-near-camera action. Positioning can reduce scanning; it cannot guarantee no eye movement.
- Windows capture-exclusion flag with readback. The UI explicitly reports that Zoom has not been verified.

## Run a portable build

Extract the complete published folder and open `InterviewAssistant.exe`. Keep its DLLs and runtime files alongside it. A self-contained Windows x64 build does not need a separate .NET installation.

1. Close any older assistant instance so it releases its keyboard shortcuts. Open **Options** to load a private profile JSON, or use the fictional sample for local rehearsal.
2. For live features, choose an existing private environment file using **Select local API env file**, or start the app with `OPENAI_API_KEY` in its process environment. The app does not display, create, or write API keys.
3. Leave **Zoom desktop only** selected and open the Zoom desktop meeting. Zoom is detected when listening starts; headphones help separate meeting playback from your own speech. For browser Zoom or other output capture, explicitly choose **Output device (manual)** and the output used by the meeting.
4. Click **▶** once or use **Ctrl+Alt+Space**. Partial questions appear immediately as transcription arrives. Completed prompts trigger answers after a 250 ms debounce. The default speech-end pause is 550 ms; increase it under Options if the interviewer pauses mid-question.
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

The [profile sample](samples/profile.example.json) and [schema notes](samples/README.md) describe the JSON format. PDF/Markdown/JD ingestion is a preparation step in this version; the app imports the resulting JSON, not arbitrary documents.

Only facts labelled `CV` are supplied as evidence for personal accomplishments. This label means claimed in the supplied CV, not independently verified. `TALKING_POINT`, `DESIGN`, and `VERIFY` claims remain separate and are excluded from generated personal claims. Saved `SpokenAnswer` text is shown only as local rehearsal. Relevant caveats are included in AI requests. Job descriptions and document text are treated as untrusted data, not system instructions.

Suggestions are labelled `suggestion_not_spoken` in conversation context. To ground a follow-up in your actual response, type what you said into the question field and use **Add Q text as what I said** under Options. Microphone transcription and speaker diarization are not implemented. Cases use explicit working assumptions; speculative numbers and solutions are not presented as measured company facts.

Profile files stay on disk at the location you choose. During generation, selected facts, source labels, target JD, question, and recent conversation are sent to OpenAI. During listening in Zoom mode, playback from the detected Zoom process and its descendants is sent to OpenAI. This includes all meeting participants and any other playback inside Zoom; it does not identify individual speakers. The explicit output-device fallback sends all audio on that output, including unrelated apps. Zoom browser tabs require that fallback. No microphone is captured.

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

This revision is checked with 24 offline/native tests on Windows 11, including automatic/manual workflow, live partial display, resizing, staged case openings/navigation, retrieval, cancellation and target-process audio isolation. Compact/expanded/minimum-size WPF rendering and capture-flag readback are checked locally. Live API checks cover CV answers, a product improvement, RCA, an estimate and transcription of synthetic speech. With the default model in one local sample, CV speech began about 4 seconds after the answer request; case generated speech began about 3–5.2 seconds after the request, with a local opening shown first. Full detailed answers took about 14–19 seconds to finish while streaming. Synthetic speech finalized about 0.9 seconds after its audio ended, excluding the separate client endpoint/debounce waits. These are individual observations, not latency guarantees or actual Zoom meeting measurements. An actual Zoom meeting and receiver-side exclusion still require validation. Credentials and private profiles are not included in this repository.

Before relying on capture exclusion, join a Zoom test call on a second device and inspect the receiver's view while sharing the whole display and a specific application window. Repeat for the actual monitor, Zoom sharing mode, hide/show, minimize/restore and app restart you plan to use. Windows display affinity is best-effort supported-capture exclusion, not universal invisibility. Other capture methods or external cameras can still see the panel.

## Implementation references

- [OpenAI Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
- [OpenAI Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [GPT-6 model configuration](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol)
- [Microsoft SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)
- [Microsoft application loopback capture](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)
- [Microsoft loopback recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- [NAudio](https://github.com/naudio/NAudio)
