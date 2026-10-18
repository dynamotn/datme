import base64
import hashlib
import json
import os
import sys

# Protocol replies get their own copy of fd 1; anything else written there, native code included, goes to stderr.
out = os.fdopen(os.dup(1), "w", buffering=1)
os.dup2(2, 1)
sys.stdout = sys.stderr

import lameenc
import numpy as np
from huggingface_hub import constants as hf_constants, snapshot_download
from vieneu import Vieneu
from vieneu._v3_turbo_engine.onnx_runtime_lite import OnnxV3LiteEngine

# The official Apache-2.0 weights and codec, each pinned to a commit, so a push upstream never changes the voice.
MODEL_REPO = "pnnbao-ump/VieNeu-TTS-v3-Turbo"
MODEL_REVISION = "61b85e3d937fbbacb387714180e8182823512523"
CODEC_REPO = "OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX"
CODEC_REVISION = "ceff0d0749bfb3fa2d61149794ec6feef0d1e1ae"
# What the ONNX/CPU engine reads, and nothing else: the fp32 graphs and the cloning models at the root.
ONNX_DIR = "onnx_update"
MODEL_FILES = ["config.json", "denoiser.onnx", "speaker_encoder.onnx"] + [
    f"{ONNX_DIR}/{f}"
    for f in [
        "config.json",
        "tokenizer.json",
        "vieneu_prefill.onnx",
        "vieneu_decode_step.onnx",
        "vieneu_acoustic_cached.onnx",
        "vieneu_backbone_shared.data",
        "vieneu_v3_heads.npz",
    ]
]
CODEC_FILES = [
    "codec_browser_onnx_meta.json",
    "moss_audio_tokenizer_decode_full.onnx",
    "moss_audio_tokenizer_decode_shared.data",
    "moss_audio_tokenizer_decode_step.onnx",
    "moss_audio_tokenizer_encode.onnx",
    "moss_audio_tokenizer_encode.data",
]


def fetch(repo, revision, files):
    """
    The files of a repo at a commit, in a folder of their own under HF_HOME: real files, not
    the cache's links into its blobs, which ONNX Runtime refuses for a graph's external data.
    """
    local = os.path.join(hf_constants.HF_HOME, "datme", repo.replace("/", "--"), revision)
    if not all(os.path.isfile(os.path.join(local, f)) for f in files):
        snapshot_download(repo, revision=revision, allow_patterns=files, local_dir=local)
    return local


def encoder(rate):
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(rate)
    enc.set_out_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc


def load():
    model = fetch(MODEL_REPO, MODEL_REVISION, MODEL_FILES)
    codec = fetch(CODEC_REPO, CODEC_REVISION, CODEC_FILES)
    # Everything is local now: a download the SDK would make on its own, of whatever is newest, fails instead.
    os.environ["HF_HUB_OFFLINE"] = "1"
    hf_constants.HF_HUB_OFFLINE = True
    # The SDK takes no codec directory, so its engine is handed the pinned one (vieneu is pinned too).
    init = OnnxV3LiteEngine.__init__
    OnnxV3LiteEngine.__init__ = lambda self, *a, **k: init(self, *a, **{**k, "codec_dir": codec})
    tts = Vieneu(mode="v3turbo", backbone_repo=model, onnx_dir=os.path.join(model, ONNX_DIR), backend="onnx")
    rate = getattr(tts, "sample_rate", None)
    if getattr(tts, "backend", None) != "onnx" or getattr(tts.engine, "checkpoint_path", None) != model:
        sys.exit(f"datme: expected VieNeu-TTS v3 Turbo on ONNX from {MODEL_REPO}@{MODEL_REVISION}")
    if not isinstance(rate, int) or rate <= 0:
        sys.exit(f"datme: the VieNeu SDK reports no usable sample rate ({rate!r})")
    return tts, rate


def enrol(tts, path):
    name = "datme-" + hashlib.sha256(path.encode()).hexdigest()[:16]
    tts.add_voice(name, path)
    return name


def main():
    tts, rate = load()
    gap = np.zeros(int(rate * 0.3), dtype=np.float32)
    voices = {}

    def send(msg):
        out.write(json.dumps(msg) + "\n")
        out.flush()

    # The sample is enrolled before ready, so one the SDK cannot use fails the start rather than every note.
    voice = os.environ.get("DATME_TTS_VOICE")
    if voice:
        try:
            voices[voice] = enrol(tts, voice)
        except Exception as e:
            sys.exit(f"datme: cannot use the voice sample {voice}: {e}")
    send({"ready": True})
    for line in sys.stdin:
        req = json.loads(line)
        try:
            path = req["voice"]
            if path not in voices:
                voices[path] = enrol(tts, path)
            parts = []
            for chunk in req["chunks"]:
                if parts:
                    parts.append(gap)
                parts.append(np.asarray(tts.infer(chunk, voice=voices[path]), dtype=np.float32))
            pcm = (np.clip(np.concatenate(parts), -1, 1) * 32767).astype(np.int16)
            enc = encoder(rate)
            reply = {"id": req["id"], "mp3": base64.b64encode(enc.encode(pcm.tobytes()) + enc.flush()).decode()}
        except Exception as e:
            reply = {"id": req["id"], "error": str(e)}
        send(reply)


main()
