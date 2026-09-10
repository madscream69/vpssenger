import secrets
import time

from fastapi import APIRouter, HTTPException, Request, status

from app import redis_client as r
from app.config import settings
from app.crypto import b64d, b64e, decode_verify_key, verify_signature
from app.models import (
    ChallengeRequest,
    ChallengeResponse,
    VerifyRequest,
    VerifyResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/challenge", response_model=ChallengeResponse)
async def request_challenge(body: ChallengeRequest, request: Request):
    # Ранняя валидация формата pubkey — мусор в Redis не кладём.
    try:
        decode_verify_key(body.pubkey)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid pubkey")

    challenge = secrets.token_bytes(32)
    await r.save_challenge(
        request.app.state.redis,
        body.pubkey,
        challenge,
        settings.challenge_ttl_seconds,
    )
    return ChallengeResponse(
        challenge=b64e(challenge),
        expires_at=int(time.time()) + settings.challenge_ttl_seconds,
    )


@router.post("/verify", response_model=VerifyResponse)
async def verify(body: VerifyRequest, request: Request):
    redis = request.app.state.redis

    stored = await r.pop_challenge(redis, body.pubkey)
    if stored is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "no challenge or expired")

    try:
        provided = b64d(body.challenge)
    except Exception:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid challenge encoding")

    # Сравнение с постоянным временем; важно, чтобы не текла информация.
    if not secrets.compare_digest(provided, stored):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "challenge mismatch")

    if not verify_signature(body.pubkey, stored, body.signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad signature")

    token = secrets.token_urlsafe(32)
    await r.save_session(redis, token, body.pubkey, settings.session_ttl_seconds)
    return VerifyResponse(
        token=token,
        expires_at=int(time.time()) + settings.session_ttl_seconds,
    )


@router.post("/logout")
async def logout(request: Request):
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        token = auth.removeprefix("Bearer ").strip()
        if token:
            await r.delete_session(request.app.state.redis, token)
    return {"ok": True}