from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket


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
            except Exception:
                self.disconnect(pubkey, ws)
        return sent


manager = ConnectionManager()