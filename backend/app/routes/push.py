from fastapi import APIRouter, Depends, Request, status

from app import redis_client as r
from app.deps import get_current_pubkey
from app.models import PushSubscribeIn

router = APIRouter(prefix="/push", tags=["push"])


@router.post("/subscribe", status_code=status.HTTP_200_OK)
async def subscribe(
    body: PushSubscribeIn,
    request: Request,
    me: str = Depends(get_current_pubkey),
):
    sub = {
        "endpoint": body.subscription.endpoint,
        "keys": body.subscription.keys,
    }
    await r.save_push_subscription(request.app.state.redis, me, sub)
    return {"ok": True}


@router.delete("/unsubscribe")
async def unsubscribe(
    endpoint: str,
    request: Request,
    me: str = Depends(get_current_pubkey),
):
    await r.delete_push_subscription(request.app.state.redis, me, endpoint)
    return {"ok": True}


@router.get("/vapid-public-key")
async def vapid_public_key():
    from app.config import settings
    return {"key": settings.vapid_public_key}
