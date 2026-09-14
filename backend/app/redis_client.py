"""Тонкие обёртки над Redis. Ключи и TTL — только здесь."""
from typing import Optional

from app.config import settings


# ---------- sessions ----------

async def save_session(redis, token: str, pubkey: str, ttl: int) -> None:
    await redis.set(f"session:{token}", pubkey.encode(), ex=ttl)


async def get_session(redis, token: str) -> Optional[str]:
    v = await redis.get(f"session:{token}")
    return v.decode() if v is not None else None


async def delete_session(redis, token: str) -> None:
    await redis.delete(f"session:{token}")


# ---------- challenges ----------

async def save_challenge(redis, pubkey: str, challenge: bytes, ttl: int) -> None:
    await redis.set(f"challenge:{pubkey}", challenge, ex=ttl)


async def pop_challenge(redis, pubkey: str) -> Optional[bytes]:
    """Атомарный GET+DEL, чтобы challenge нельзя было использовать дважды."""
    key = f"challenge:{pubkey}"
    pipe = redis.pipeline()
    pipe.get(key)
    pipe.delete(key)
    value, _ = await pipe.execute()
    return value


# ---------- messages ----------

async def store_message(
    redis,
    from_pubkey: str,
    to_pubkey: str,
    msg_id: str,
    payload: bytes,
    ts: int,
    ttl: int,
) -> None:
    """Сохраняет конверт в inbox получателя И отправителя (оба — на TTL).

    Так у отправителя тоже есть история исходящих после перезагрузки.
    Сервер по-прежнему видит только ciphertext.
    """
    pipe = redis.pipeline()
    # Получатель
    pipe.set(f"msg:{to_pubkey}:{msg_id}", payload, ex=ttl)
    pipe.zadd(f"inbox:{to_pubkey}", {msg_id: ts})
    pipe.zremrangebyrank(f"inbox:{to_pubkey}", 0, -(settings.inbox_max_size + 1))
    # Отправитель
    pipe.set(f"msg:{from_pubkey}:{msg_id}", payload, ex=ttl)
    pipe.zadd(f"inbox:{from_pubkey}", {msg_id: ts})
    pipe.zremrangebyrank(f"inbox:{from_pubkey}", 0, -(settings.inbox_max_size + 1))
    await pipe.execute()


async def list_messages(redis, to_pubkey: str) -> list[dict]:
    """Возвращает список конвертов, чистя попутно протухшие id."""
    import json

    inbox = f"inbox:{to_pubkey}"
    ids: list[bytes] = await redis.zrevrange(inbox, 0, -1)
    if not ids:
        return []

    keys = [f"msg:{to_pubkey}:{i.decode()}" for i in ids]
    values = await redis.mget(keys)

    stale = [ids[i] for i, v in enumerate(values) if v is None]
    if stale:
        await redis.zrem(inbox, *stale)

    return [json.loads(v) for v in values if v is not None]


async def delete_message(redis, pubkey: str, msg_id: str) -> None:
    """Удаляет сообщение из inbox пользователя. Второй стороны — по TTL."""
    pipe = redis.pipeline()
    pipe.delete(f"msg:{pubkey}:{msg_id}")
    pipe.zrem(f"inbox:{pubkey}", msg_id)
    await pipe.execute()
#------------subscriptions
async def save_push_subscription(redis, pubkey: str, subscription: dict) -> None:
    import json
    key = f"push:{pubkey}"
    existing = await redis.smembers(key)
    endpoint = subscription["endpoint"]
    for raw in existing:
        try:
            old = json.loads(raw)
        except Exception:
            continue
        if old.get("endpoint") == endpoint:
            await redis.srem(key, raw)
    await redis.sadd(key, json.dumps(subscription, separators=(",", ":")))


async def get_push_subscriptions(redis, pubkey: str) -> list[dict]:
    import json
    key = f"push:{pubkey}"
    raws = await redis.smembers(key)
    out = []
    for raw in raws:
        try:
            out.append(json.loads(raw))
        except Exception:
            await redis.srem(key, raw)
    return out


async def delete_push_subscription(redis, pubkey: str, endpoint: str) -> None:
    import json
    key = f"push:{pubkey}"
    raws = await redis.smembers(key)
    for raw in raws:
        try:
            if json.loads(raw).get("endpoint") == endpoint:
                await redis.srem(key, raw)
        except Exception:
            await redis.srem(key, raw)



