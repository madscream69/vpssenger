import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app import redis_client as r
from app.config import settings
from app.crypto import b64d, verify_message_signature
from app.deps import get_current_pubkey
from app.models import MessageIn
from app.websocket import manager

router = APIRouter(prefix="/messages", tags=["messages"])


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def send_message(
    body: MessageIn,
    request: Request,
    sender: str = Depends(get_current_pubkey),
):
    if body.to == sender:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot send to self")

    now = int(time.time())
    if abs(now - body.ts) > settings.max_clock_skew_seconds:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "timestamp out of range")

    try:
        from_pub = b64d(sender)
        to_pub = b64d(body.to)
        nonce = b64d(body.nonce)
        ct = b64d(body.ct)
        msg_id_bytes = body.id.encode("utf-8")
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid base64 field")

    if len(from_pub) != 32 or len(to_pub) != 32:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad pubkey size")
    if len(nonce) < 16:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "nonce too short")
    if len(ct) > settings.max_message_size:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "message too large"
        )

    if not verify_message_signature(
        msg_id=msg_id_bytes,
        from_pub=from_pub,
        to_pub=to_pub,
        ts=body.ts,
        nonce=nonce,
        ct=ct,
        sig_b64=body.sig,
    ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bad signature")

    envelope = {
        "id": body.id,
        "from": sender,
        "to": body.to,
        "ts": body.ts,
        "nonce": body.nonce,
        "ct": body.ct,
        "sig": body.sig,
    }
    payload = json.dumps(envelope, separators=(",", ":")).encode()

    await r.store_message(
        request.app.state.redis,
        from_pubkey=sender,           # ← новое
        to_pubkey=body.to,
        msg_id=body.id,
        payload=payload,
        ts=body.ts,
        ttl=settings.message_ttl_seconds,
    )

    # Realtime-пуш получателю (может быть 0 подключений — это ок).
    await manager.send_to(body.to, {"type": "message", "message": envelope})

    return {"id": body.id, "status": "queued"}


@router.get("")
async def list_messages(
    request: Request,
    me: str = Depends(get_current_pubkey),
):
    return await r.list_messages(request.app.state.redis, me)


@router.delete("/{msg_id}")
async def delete_message(
    msg_id: str,
    request: Request,
    me: str = Depends(get_current_pubkey),
):
    await r.delete_message(request.app.state.redis, me, msg_id)
    return {"ok": True}