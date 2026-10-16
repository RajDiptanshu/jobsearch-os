# Interview Assistant for Windows

A standalone desktop prototype that listens to Zoom desktop audio (or a selected Windows output in manual fallback mode), transcribes interview questions, and streams a concise spoken-style answer grounded in a local career profile. It has a resizable, always-on-top floating view for use beside Zoom.

Everything for this project lives in this directory. It does not use or change the existing JobSearchOS server, dashboard, dependencies, or data. The repository contains only fictional sample career data.

## Current capabilities

- Zoom-only Windows application loopback capture (Zoom process and descendants), plus an explicit output-device fallback, audio meter, bounded buffering, and pause/resume.
- OpenAI Realtime transcription with incremental text, client-side speech endpointing, and ordered final turns.
- Streamed Responses API answers using the current question, recent conversation, relevant CV facts, and target JD. Completed questions generate an answer automatically by default. A visible Auto-answer toggle and Generate answer button support manual use.
- Three answer lengths, cancellation, typed follow-ups, and a way to add what the candidate actually said to conversation context.
- Local rehearsal of saved talking points without a credential or network request.
- Translucent always-on-top full/floating views, a background-tint slider that keeps text solid, and hide/show shortcuts.
- Windows capture-exclusion flag with readback. The UI explicitly reports that Zoom has not been verified.

## Run a portable build

Extract the complete published folder and open `InterviewAssistant.exe`. Keep its DLLs and runtime files alongside it. A self-contained Windows x64 build does not need a separate .NET installation.

1. Load a private profile JSON, or use the fictional sample to explore local rehearsal.
2. For live features, choose an existing private environment file using **Select local API env file**, or start the app with `OPENAI_API_KEY` in its process environment. The app does not display, create, or write API keys.
3. Leave **Zoom desktop only** selected and open the Zoom desktop meeting. Zoom is detected when listening starts; headphones help separate meeting playback from your own speech. For browser Zoom or other output capture, explicitly choose **Output device (manual)** and the output used by the meeting.
4. Click **Start listening** once. Spoken questions appear as text, and completed question prompts generate answers after a short pause. Turn off **Auto-answer** to generate manually; **Generate answer** also works while automatic mode is on.
5. Choose **Floating view**, position it over the meeting, and use **Tint** to balance the interviewer's visibility with text readability.

The application never starts listening automatically. API access and billing must be enabled for the selected models; signing into ChatGPT alone does not configure this application.

| Shortcut | Action |
|---|---|
| Ctrl+Alt+Space | Start/pause listening |
| Ctrl+Alt+Enter | Generate an answer |
| Ctrl+Alt+H | Hide/show the window |
| Escape | Cancel the current answer while this window has focus |

Unavailable shortcuts are reported at startup. Drag the header to move the window. **Clear session** stops listening and clears transcript, question, answer, and conversation context.

## Data and grounding

The [profile sample](samples/profile.example.json) and [schema notes](samples/README.md) describe the JSON format. PDF/Markdown/JD ingestion is a preparation step in this version; the app imports the resulting JSON, not arbitrary documents.

Only facts labelled `CV` are supplied as evidence for personal accomplishments. This label means claimed in the supplied CV, not independently verified. `TALKING_POINT`, `DESIGN`, and `VERIFY` claims remain separate and are excluded from generated personal claims. Saved `SpokenAnswer` text is shown only as local rehearsal. Relevant caveats are included in AI requests. Job descriptions and document text are treated as untrusted data, not system instructions.

Suggestions are labelled `suggestion_not_spoken` in conversation context. To ground a follow-up in your actual response, type what you said into the question field and click **Add as what I said**. Microphone transcription and speaker diarization are not implemented.

Profile files stay on disk at the location you choose. During generation, selected facts, source labels, target JD, question, and recent conversation are sent to OpenAI. During listening in Zoom mode, playback from the detected Zoom process and its descendants is sent to OpenAI. This includes all meeting participants and any other playback inside Zoom; it does not identify individual speakers. The explicit output-device fallback sends all audio on that output, including unrelated apps. Zoom browser tabs require that fallback. No microphone is captured.

The app does not save raw audio or transcripts by default. Settings contain file paths, selected devices and model names, never key values. Settings are in `%LOCALAPPDATA%\JobSearchOS.InterviewAssistant\settings.json`. Responses requests use `store: false`; this is not a claim of zero provider-side retention. Private profiles, credentials, logs and build outputs are excluded by the project `.gitignore`; keep private source documents outside the public repository.

## Requirements and configuration

- Windows build 20348 or newer for Zoom-only process capture (Windows 11 is tested). Output-device fallback and capture exclusion require Windows 10 version 2004 or newer.
- Windows x64 for the provided publish target.
- A working speaker/headphone output endpoint, internet for live features, and model access in an OpenAI API project.
- .NET 10 SDK for development only; NAudio 2.2.1 is restored from the committed package lock files.

Default models are `gpt-live-transcribe` and `gpt-6.1-sol`. GPT-6 answer requests use low reasoning effort to reduce delay. Change `TranscriptionModel` and `AnswerModel` in the local settings file with the app closed if your API project uses other compatible models. No particular latency or accuracy is guaranteed.

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

Smoke mode renders the two app layouts with alpha transparency and probes capture flags across hide/show and minimize/restore. Its JSON reports transparency, the tint alpha, and the default audio/answer modes. It does not perform a Zoom receiver test. Use fictional data for any screenshots you intend to publish.

## Validation boundary

This revision passes 21 offline/native checks on Windows 11, including the automatic/manual UI workflow and target-process audio isolation. Translucent WPF rendering and capture-flag readback pass locally. Mouse pass-through is not included. Live OpenAI answer generation and Realtime transcription of a synthetic spoken question also passed using the shipped services. An actual Zoom meeting and Zoom receiver-side exclusion still require validation. Credentials are configured only in the local installation and are not included in this repository.

Before relying on capture exclusion, join a Zoom test call on a second device and inspect the receiver's view while sharing the whole display and a specific application window. Repeat for the actual monitor, Zoom sharing mode, hide/show, minimize/restore and app restart you plan to use. Windows display affinity is best-effort supported-capture exclusion, not universal invisibility. Other capture methods or external cameras can still see the panel.

## Implementation references

- [OpenAI Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
- [OpenAI Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses)
- [GPT-6 model configuration](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol)
- [Microsoft SetWindowDisplayAffinity](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)
- [Microsoft application loopback capture](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)
- [Microsoft loopback recording](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording)
- [NAudio](https://github.com/naudio/NAudio)
