# Profile sample

`profile.example.json` is entirely fictional and demonstrates the `CandidateProfile` model. Copy it to a private location outside this repository and replace the sample with your own facts before importing it.

The profile contains basic role information, an optional target job description, a speaking style, facts, experience stories, cautions and source metadata. Each story has an `Id`, `Title`, `Tags`, `Facts`, `Caveats` and a `SpokenAnswer` rehearsal.

An optional `CaseExampleProduct` string supplies a default example for favourite-product cases. It is a presentation preference, not evidence of usage, ownership or personal achievements. A product explicitly named in the current question takes precedence. The value can be overridden under Options.

Use these evidence values exactly:

| Value | Meaning |
|---|---|
| `CV` | Claimed in the candidate's current CV; not independent verification. |
| `TALKING_POINT` | Supplied narrative or interpretation that retains its source. |
| `DESIGN` | Proposed design, not established delivered experience. |
| `VERIFY` | Missing, conflicting or unconfirmed detail. |

For example:

```json
{
  "Id": "setup-outcome",
  "Text": "Setup completion rose from 58% to 68% in the fictional example.",
  "Source": "demo-cv:setup-project",
  "Evidence": "CV"
}
```

Keep a stable `Id` for each fact and story. `Source` can refer to a source ID plus a page, section or line reference. `Sources` records the source ID, title, kind, optional local path and provenance notes. A local path is metadata; it does not embed that file's contents.

Write `SpokenAnswer` examples only from established claims, with precise ownership and qualifications. Put missing denominators, uncertain launch status and hypothetical architecture in the corresponding `Caveats` and evidence-labelled facts. Do not transform `DESIGN` or `VERIFY` facts into accomplished work.

Private profiles can contain sensitive career information. Keep them and their source files outside public repositories. Avoid unnecessary email addresses, phone numbers or full source-document dumps.
