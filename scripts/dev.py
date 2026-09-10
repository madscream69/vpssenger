#!/usr/bin/env python3
"""Dev helper: генерация ключей и подписи для ручного тестирования API.

НЕ часть серверного рантайма. Использует упрощённую деривацию (SHA-256 от seed),
чтобы не тащить BIP39 в dev-инструмент.
"""
import argparse
import base64
import hashlib
import json
import os
import secrets
import struct
import sys
import time
import urllib.error
import urllib.request

from nacl.signing import SigningKey


def b64e(b: bytes) -> str:
    return base64.b64encode(b).decode()


def b64d(s: str) -> bytes:
    return base64.b64decode(s)


def load_or_create_key(name: str) -> SigningKey:
    path = os.path.join(".devkeys", f"{name}.seed")
    if os.path.exists(path):
        seed = bytes.fromhex(open(path).read().strip())
    else:
        os.makedirs(".devkeys", exist_ok=True)
        seed = secrets.token_bytes(32)
        with open(path, "w") as f:
            f.write(seed.hex())
        os.chmod(path, 0o600)
    return SigningKey(seed)


def canonical_message_bytes(msg_id, from_pub, to_pub, ts, nonce, ct) -> bytes:
    return (
        b"fsm-msg-v1\0"
        + struct.pack(">H", len(msg_id))
        + msg_id
        + from_pub
        + to_pub
        + struct.pack(">Q", ts)
        + struct.pack(">B", len(nonce))
        + nonce
        + ct
    )


def http(method, url, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def cmd_key(args):
    sk = load_or_create_key(args.name)
    pub = b64e(bytes(sk.verify_key))
    print(json.dumps({"name": args.name, "pubkey": pub}, indent=2))


def cmd_login(args):
    """Полный challenge-response, сохраняет токен в .devkeys/{name}.token."""
    sk = load_or_create_key(args.name)
    pub = b64e(bytes(sk.verify_key))

    code, body = http("POST", f"{args.base}/auth/challenge", {"pubkey": pub})
    if code != 200:
        print("challenge failed:", code, body, file=sys.stderr)
        sys.exit(1)

    challenge_b64 = body["challenge"]
    sig = sk.sign(b64d(challenge_b64)).signature

    code, body = http(
        "POST",
        f"{args.base}/auth/verify",
        {"pubkey": pub, "challenge": challenge_b64, "signature": b64e(sig)},
    )
    if code != 200:
        print("verify failed:", code, body, file=sys.stderr)
        sys.exit(1)

    token = body["token"]
    os.makedirs(".devkeys", exist_ok=True)
    with open(f".devkeys/{args.name}.token", "w") as f:
        f.write(token)
    print(json.dumps({"token": token, "expires_at": body["expires_at"]}, indent=2))


def _load_token(name: str) -> str:
    path = f".devkeys/{name}.token"
    if not os.path.exists(path):
        print(f"no token for {name}; run: dev.py login {name}", file=sys.stderr)
        sys.exit(1)
    return open(path).read().strip()


def cmd_send(args):
    sk = load_or_create_key(args.name)
    from_pub = bytes(sk.verify_key)

    to_pub = b64d(args.to)
    if len(to_pub) != 32:
        print("invalid --to pubkey", file=sys.stderr)
        sys.exit(1)

    msg_id = args.id or secrets.token_urlsafe(9)
    ts = int(time.time())
    nonce = secrets.token_bytes(24)  # заглушка под будущий XChaCha20
    ct = b"PLAINTEXT:" + args.text.encode()  # НЕ настоящее шифрование, только для тестов

    payload = canonical_message_bytes(
        msg_id.encode(), from_pub, to_pub, ts, nonce, ct
    )
    sig = sk.sign(payload).signature

    body = {
        "id": msg_id,
        "to": args.to,
        "ts": ts,
        "nonce": b64e(nonce),
        "ct": b64e(ct),
        "sig": b64e(sig),
    }
    token = _load_token(args.name)
    code, resp = http("POST", f"{args.base}/messages", body, token=token)
    print(json.dumps({"status": code, "response": resp}, indent=2))


def cmd_inbox(args):
    token = _load_token(args.name)
    code, resp = http("GET", f"{args.base}/messages", token=token)
    print(json.dumps({"status": code, "messages": resp}, indent=2))


def cmd_delete(args):
    token = _load_token(args.name)
    code, resp = http("DELETE", f"{args.base}/messages/{args.id}", token=token)
    print(json.dumps({"status": code, "response": resp}, indent=2))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://127.0.0.1:8000")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("key"); sp.add_argument("name"); sp.set_defaults(fn=cmd_key)
    sp = sub.add_parser("login"); sp.add_argument("name"); sp.set_defaults(fn=cmd_login)
    sp = sub.add_parser("send")
    sp.add_argument("name")
    sp.add_argument("--to", required=True)
    sp.add_argument("--text", required=True)
    sp.add_argument("--id", default=None)
    sp.set_defaults(fn=cmd_send)
    sp = sub.add_parser("inbox"); sp.add_argument("name"); sp.set_defaults(fn=cmd_inbox)
    sp = sub.add_parser("delete")
    sp.add_argument("name"); sp.add_argument("id"); sp.set_defaults(fn=cmd_delete)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()