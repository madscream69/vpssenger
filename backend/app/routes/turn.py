import base64
import hashlib
import hmac
import time

from fastapi import APIRouter, Depends, Request

from app.config import settings
from app.deps import get_current_pubkey

router = APIRouter(prefix="/turn", tags=["turn"])


@router.get("/credentials")
async def get_turn_credentials(
    me: str = Depends(get_current_pubkey),
):
    """Генерирует временные TURN-креды для текущего пользователя.

    Формат username: "<expiry_unix>:<edPub>" — coturn с use-auth-secret
    проверит HMAC и срок.
    """
    expiry = int(time.time()) + settings.turn_ttl_seconds
    username = f"{expiry}:{me}"

    # HMAC-SHA1 от username с секретом.
    digest = hmac.new(
        settings.turn_secret.encode(),
        username.encode(),
        hashlib.sha1,
    ).digest()
    credential = base64.b64encode(digest).decode()

    return {
        "username": username,
        "credential": credential,
        "ttl": settings.turn_ttl_seconds,
        "realm": settings.turn_realm,
        "uris": [
            "turn:vpssenger.dolbit.fun:3478?transport=udp",
            "turn:vpssenger.dolbit.fun:3478?transport=tcp",
        ],
        # Публичные STUN (бесплатные, не наши).
        "stun_uris": [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
        ],
    }