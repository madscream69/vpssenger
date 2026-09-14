import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.crypto import b64d, canonical_profile_bytes, verify_signature
from app.deps import get_current_pubkey
from app.models import ProfileIn

router = APIRouter(prefix="/profile", tags=["profile"])

# Профиль живёт 30 дней.
PROFILE_TTL = 30 * 24 * 60 * 60


@router.post("", status_code=status.HTTP_200_OK)
async def put_profile(
    body: ProfileIn,
    request: Request,
    me: str = Depends(get_current_pubkey),
):
    now = int(time.time())
    if abs(now - body.updated_at) > 300:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "timestamp out of range")

    try:
        me_bytes = b64d(me)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad pubkey")

    payload = canonical_profile_bytes(me_bytes, body.name, body.updated_at)
    if not verify_signature(me, payload, body.sig):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad signature")

    record = {
        "pubkey": me,
        "name": body.name,
        "updated_at": body.updated_at,
        "sig": body.sig,
    }
    await request.app.state.redis.set(
        f"profile:{me}",
        json.dumps(record, separators=(",", ":")).encode(),
        ex=PROFILE_TTL,
    )
    return {"ok": True}


@router.get("/{pubkey}")
async def get_profile(pubkey: str, request: Request):
    raw = await request.app.state.redis.get(f"profile:{pubkey}")
    if not raw:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    return json.loads(raw)
