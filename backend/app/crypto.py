import base64
import struct

from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey


def b64d(s: str) -> bytes:
    return base64.b64decode(s, validate=True)


def b64e(b: bytes) -> str:
    return base64.b64encode(b).decode()


def decode_verify_key(pubkey_b64: str) -> VerifyKey:
    raw = b64d(pubkey_b64)
    if len(raw) != 32:
        raise ValueError("Ed25519 pubkey must be 32 bytes")
    return VerifyKey(raw)


def canonical_message_bytes(
    msg_id: bytes,
    from_pub: bytes,
    to_pub: bytes,
    ts: int,
    nonce: bytes,
    ct: bytes,
) -> bytes:
    """Детерминированная сериализация полей, покрытых подписью.

    Формат зафиксирован; при изменении — меняем префикс на fsm-msg-v2.
    """
    if len(from_pub) != 32 or len(to_pub) != 32:
        raise ValueError("pubkeys must be 32 bytes")
    if not (0 <= ts < 2**64):
        raise ValueError("ts out of u64")
    if len(nonce) > 255:
        raise ValueError("nonce too long")

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


def verify_signature(pubkey_b64: str, message: bytes, sig_b64: str) -> bool:
    """Проверка Ed25519-подписи над произвольным сообщением."""
    try:
        vk = decode_verify_key(pubkey_b64)
        sig = b64d(sig_b64)
        if len(sig) != 64:
            return False
        vk.verify(message, sig)
        return True
    except (BadSignatureError, ValueError):
        return False


def verify_message_signature(
    msg_id: bytes,
    from_pub: bytes,
    to_pub: bytes,
    ts: int,
    nonce: bytes,
    ct: bytes,
    sig_b64: str,
) -> bool:
    try:
        sig = b64d(sig_b64)
        if len(sig) != 64:
            return False
        payload = canonical_message_bytes(msg_id, from_pub, to_pub, ts, nonce, ct)
        VerifyKey(from_pub).verify(payload, sig)
        return True
    except (BadSignatureError, ValueError):
        return False
def canonical_profile_bytes(pubkey: bytes, name: str, updated_at: int) -> bytes:
    """Формат: 'fsm-prof-v1\\0' || pubkey || u64(updated_at) || u16(len(name)) || name."""
    name_b = name.encode("utf-8")
    if len(name_b) > 1024:
        raise ValueError("name too long")
    return (
        b"fsm-prof-v1\0"
        + pubkey
        + struct.pack(">Q", updated_at)
        + struct.pack(">H", len(name_b))
        + name_b
    )
