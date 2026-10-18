# Text-to-speech in the author's own voice — design

Tracking issue: #66. Related: #6 (browser-only "Listen" with the Web Speech API).

## Intent

Let the author have selected notes read aloud in their own cloned voice, so readers can listen to them on the page. The author picks which notes get audio by tag, category or frontmatter. The audio is produced at build time, not in the reader's browser.

## Goals

- The author chooses which notes get audio: by folder, by frontmatter key/value, or both.
- Each language has its own TTS model, chosen in config. There is no single global model.
- Drafts get audio, so the author can hear them before publishing.
- Locked parts are never read. Unlocked parts of the same note are read.
- A listener starts playback from a ▶ button at the top of the note.
- Audio is regenerated automatically when the note's text changes.

## Non-goals

- Running a model in the browser.
- Reading code blocks, diagrams, or locked parts.
- A persistent player that follows the page while scrolling (the button is at the top of the note only).

## Anti-goals

- Shipping the author's voice sample, or any voice-cloning material, in the repository or in the published site.
- Publishing audio for a note that the build would not otherwise publish.
- Publishing audio of locked text.

## Constraints

- The author's voice sample stays outside the repository.
- Model inference runs at build time on the author's machine or CI, not in the browser.
- The model used for each language must be licensed for the author's use. VieNeu is the candidate for Vietnamese; its licence and variant (v2, v3 Turbo, or a community finetune) are not yet verified.

## Decisions

These were chosen by the author:

1. Selection rule: a note gets audio if it lies in a chosen folder, or its frontmatter matches a chosen key/value. Both kinds of rule are allowed.
2. Drafts get audio.
3. Locked parts are skipped; unlocked parts of the same note are read.
4. Playback starts from a ▶ button at the top of the note.
5. Changed text triggers regeneration on the next build.
6. One model per language, set in config.

These are my calls, and the author can override them:

- Drafts are only built when the build includes `--drafts`, so their audio is never produced for a public build. This follows the existing draft rules.
- A note that matches a selection rule but is marked private is skipped. Private notes are not built publicly, so they get no audio either.
- Audio files are cached beside the note's build output, keyed by a hash of the spoken text plus the model and voice sample identity. A change to any of these regenerates the file.
- Long notes are split into chunks at paragraph boundaries and generated in parts, then joined or played as a sequence.
- A language with no configured model keeps the browser-only #6 button, using the Web Speech API. #6 is closed and its code was reverted, so this fallback has to be rebuilt as part of this work or dropped for launch.
- Notes behind a whole-note password get no audio. Audio is not encrypted, so it would expose content the password protects.
- Vietnamese is the only language with a model at launch. Other languages get the #6 fallback or nothing.
- A configured model that is missing fails the build, because it is a config error. A generation failure for one note skips audio for that note and reports a warning, so one bad note does not stop the site.

## Vietnamese model

The author left this choice to me. Use **VieNeu-TTS v3 Turbo** from the official `pnnbao-ump` Hugging Face account, through the `vieneu` Python SDK, with the version pinned.

- Licence: Apache-2.0 on the model, the GitHub repository, the MOSS-Audio-Tokenizer-Nano codec and the sea-g2p phonemizer, checked on 2026-10-18. Apache-2.0 allows publishing the generated audio.
- It runs on CPU through ONNX Runtime without PyTorch, and clones a voice from a 3–8 s reference clip on that CPU path.
- Output is 48 kHz mono.
- Do not use the variants tagged CC-BY-NC-4.0 (the 0.3B GGUF builds and the "ngoc-huyen" LoRA), nor community finetunes. Their licences forbid or do not clearly allow this use.
- Re-check the licence whenever the pinned version changes.

## Generation

Audio is generated on CI, not on the author's machine. The model runs on CPU, so the CI runner needs no GPU. The audio cache must persist between CI runs, using the CI provider's cache or an artifact store. Generated audio is deployed with the site and is not committed to the repository. The second rule is my call and can be changed by the author.

## Left to the builder

- Config key names and their shape (for example a `tts` block in `datme.yaml`).
- Audio container and bitrate.
- How the voice sample is referenced from config without its content entering the repository.
- How the model is invoked from the build (process, library, or service).
- Test strategy for chunking, locked-part skipping, and cache keys.
