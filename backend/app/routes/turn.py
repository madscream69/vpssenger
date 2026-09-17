import base64
import hashlib
import hmac
import time

from fastapi import APIRouter, Depends

from app.config import settings
from app.deps import get_current_pubkey

router = APIRouter(prefix="/turn", tags=["turn"])


@router.get("/credentials")
async def get_turn_credentials(
    me: str = Depends(get_current_pubkey),
):
    expiry = int(time.time()) + settings.turn_ttl_seconds

    # edPub в base64 содержит /, +, = — неудобно для coturn.
    # Заменяем на hex-хеш — безопасная строка.
    user_id = hashlib.sha256(me.encode()).hexdigest()[:32]
    username = f"{expiry}:{user_id}"

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
        "stun_uris": [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
        ],
    }