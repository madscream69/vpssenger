from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket
import logging
log = logging.getLogger("fsm.ws")

class ConnectionManager:
    """Реестр активных WS-подключений: pubkey -> set of sockets.

    Один pubkey может иметь несколько открытых вкладок.
    """

    def __init__(self) -> None:
        self._conns: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, pubkey: str, ws: WebSocket) -> None:
        await ws.accept()
        self._conns[pubkey].add(ws)

    def disconnect(self, pubkey: str, ws: WebSocket) -> None:
        s = self._conns.get(pubkey)
        if not s:
            return
        s.discard(ws)
        if not s:
            self._conns.pop(pubkey, None)

    async def send_to(self, pubkey: str, payload: dict) -> int:
    conns = list(self._conns.get(pubkey, ()))
    sent = 0
    for ws in conns:
        try:
            await ws.send_json(payload)
            sent += 1
        except Exception as e:
            log.warning("send_to %s failed: %s", pubkey[:12], e)
            self.disconnect(pubkey, ws)
    return sent
    async def relay(self, from_pubkey: str, to_pubkey: str, payload: dict) -> int:
    """Отправить payload от from_pubkey к to_pubkey. Возвращает число доставленных."""
    return await self.send_to(to_pubkey, payload)


manager = ConnectionManager()