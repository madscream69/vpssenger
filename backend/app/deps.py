
from fastapi import Header, HTTPException, Request, status


async def get_current_pubkey(
    request: Request,
    authorization: str = Header(default=""),
) -> str:
    """Извлекает pubkey из Bearer-токена, кладя его в request.state."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "empty token")

    # Импорт локальный, чтобы избежать циклов.
    from app.redis_client import get_session

    pubkey = await get_session(request.app.state.redis, token)
    if not pubkey:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    request.state.token = token
    return pubkey