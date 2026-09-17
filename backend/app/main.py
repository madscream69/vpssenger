from contextlib import asynccontextmanager

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status

from app import redis_client as r
from app.config import settings
from app.routes import auth, messages, profile, push, turn
from app.websocket import manager
from fastapi.middleware.cors import CORSMiddleware

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
    # Токен в query — компромисс MVP. Позже можно перейти на first-frame auth.
    pubkey = await r.get_session(websocket.app.state.redis, token)
    if not pubkey:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(pubkey, websocket)
    try:
        await websocket.send_json({"type": "hello", "pubkey": pubkey})
        while True:
            # Клиент шлёт {"type":"ping"} — мы ничего не делаем, только держим соединение.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(pubkey, websocket)
