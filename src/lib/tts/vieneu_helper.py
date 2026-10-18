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
from vieneu import Vieneu

# The official Apache-2.0 weights, named rather than left to the SDK default.
MODEL_REPO = "pnnbao-ump/VieNeu-TTS-v3-Turbo"


def encoder(rate):
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(rate)
    enc.set_out_sample_rate(rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc


def load():
    tts = Vieneu(mode="v3turbo", backbone_repo=MODEL_REPO)
    repo = getattr(tts, "backbone_repo", None)
    rate = getattr(tts, "sample_rate", None)
    if repo != MODEL_REPO:
        sys.exit(f"datme: expected VieNeu-TTS v3 Turbo from {MODEL_REPO}, the SDK loaded {repo!r}")
    if not isinstance(rate, int) or rate <= 0:
        sys.exit(f"datme: the VieNeu SDK reports no usable sample rate ({rate!r})")
    return tts, rate


def main():
    tts, rate = load()
    gap = np.zeros(int(rate * 0.3), dtype=np.float32)
    voices = {}

    def send(msg):
        out.write(json.dumps(msg) + "\n")
        out.flush()

    send({"ready": True})
    for line in sys.stdin:
        req = json.loads(line)
        try:
            path = req["voice"]
            if path not in voices:
                voices[path] = "datme-" + hashlib.sha256(path.encode()).hexdigest()[:16]
                tts.add_voice(voices[path], path)
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
