import base64
import hashlib
import json
import sys

out, sys.stdout = sys.stdout, sys.stderr

import lameenc
import numpy as np
from vieneu import Vieneu

RATE = 48000
GAP = np.zeros(int(RATE * 0.3), dtype=np.float32)


def encode(audio):
    enc = lameenc.Encoder()
    enc.set_bit_rate(64)
    enc.set_in_sample_rate(RATE)
    enc.set_out_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    return enc.encode(pcm.tobytes()) + enc.flush()


def main():
    tts = Vieneu()
    voices = {}

    def send(msg):
        print(json.dumps(msg), file=out, flush=True)

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
                    parts.append(GAP)
                parts.append(np.asarray(tts.infer(chunk, voice=voices[path]), dtype=np.float32))
            reply = {"id": req["id"], "mp3": base64.b64encode(encode(np.concatenate(parts))).decode()}
        except Exception as e:
            reply = {"id": req["id"], "error": str(e)}
        send(reply)


main()
