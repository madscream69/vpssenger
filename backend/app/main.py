from contextlib import asynccontextmanager
import json
import time
from collections import defaultdict
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from app import redis_client as r
from app.config import settings
from app.routes import auth, messages, profile, push, turn
from app.websocket import manager
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket, WebSocketDisconnect, status, Query

# rate limit: не больше 30 call-* в минуту на пользователя
_CALL_RATE: dict[str, list[float]] = defaultdict(list)
CALL_RATE_WINDOW = 60
CALL_RATE_MAX = 30
CALL_RATE_TYPES = {
    "call-invite", "call-accept", "call-decline",
    "call-sdp", "call-ice", "call-end",
}
MAX_CALL_MSG_BYTES = 64 * 1024

def _call_rate_ok(pubkey: str) -> bool:
    now = time.time()
    window_start = now - CALL_RATE_WINDOW
    bucket = [t for t in _CALL_RATE[pubkey] if t > window_start]
    if len(bucket) >= CALL_RATE_MAX:
        return False
    bucket.append(now)
    _CALL_RATE[pubkey] = bucket
    return True


def _valid_pubkey_b64(s: str) -> bool:
    if not isinstance(s, str):
        return False
    if len(s) != 44:  # 32 байта → 44 символа base64 с padding
        return False
    return True


def _valid_call_id(s: str) -> bool:
    if not isinstance(s, str):
        return False
    return 1 <= len(s) <= 64 and all(c.isalnum() or c in "-_" for c in s)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = redis.from_url(settings.redis_url, decode_responses=False)
    await app.state.redis.ping()
    try:
        yield
    finally:
        await app.state.redis.aclose()


app = FastAPI(
    title="Family Secure Messenger",
    version="0.3.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    try:
        pong = await app.state.redis.ping()
    except Exception as exc:
        raise HTTPException(503, f"redis unavailable: {exc}")
    return {"status": "ok", "redis": bool(pong)}


app.include_router(auth.router)
app.include_router(messages.router)
app.include_router(profile.router)
app.include_router(push.router)
app.include_router(turn.router)

@app.websocket("/ws")
async def ws_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    pubkey = await r.get_session(websocket.app.state.redis, token)
    if not pubkey:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(pubkey, websocket)
    try:
        await websocket.send_json({"type": "hello", "pubkey": pubkey})

        while True:
            raw = await websocket.receive_text()

            # защита от больших сообщений
            if len(raw) > MAX_CALL_MSG_BYTES:
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            mtype = msg.get("type")

            if mtype == "ping":
                # heartbeat (пока не используется)
                continue

            if mtype in CALL_RATE_TYPES:
                if not _call_rate_ok(pubkey):
                    await websocket.send_json({
                        "type": "call-rate-limited",
                    })
                    continue

                to = msg.get("to", "")
                call_id = msg.get("callId", "")

                if not _valid_pubkey_b64(to) or not _valid_call_id(call_id):
                    await websocket.send_json({
                        "type": "call-error",
                        "error": "bad-request",
                        "callId": call_id,
                    })
                    continue

                # Relay: подставляем from, убираем потенциальные лишние поля
                relay = dict(msg)
                relay["from"] = pubkey
                relay.pop("to", None)  # получателю не нужен его же pubkey

                delivered = await manager.relay(pubkey, to, relay)

                if delivered == 0:
                    await websocket.send_json({
                        "type": "call-unreachable",
                        "callId": call_id,
                        "to": to,
                    })
                continue

            # неизвестный тип — игнорируем
            continue

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(pubkey, websocket)
