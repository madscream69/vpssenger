#!/usr/bin/env python3
"""Кросс-проверка: подпись из браузера проходит верификацию через backend/crypto.py."""
import json
import sys
from pathlib import Path

# Чтобы импортировать app.crypto из backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.crypto import b64d, verify_message_signature  # noqa: E402


def main():
    path = Path(__file__).resolve().parent.parent / "debug_payload.json"
    if not path.exists():
        print(f"missing {path}", file=sys.stderr)
        sys.exit(2)

    data = json.loads(path.read_text(encoding="utf-8"))

    print("envelope:")
    print(json.dumps(data, indent=2))
    print()

    ok = verify_message_signature(
        msg_id=data["id"].encode("utf-8"),
        from_pub=b64d(data["from_pub"]),
        to_pub=b64d(data["to_pub"]),
        ts=data["ts"],
        nonce=b64d(data["nonce"]),
        ct=b64d(data["ct"]),
        sig_b64=data["sig"],
    )
    print("verify_message_signature:", ok)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()