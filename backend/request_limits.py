"""Limiti globali per il singolo worker: ammissione immediata, nessuna coda illimitata.

Il proxy pubblico deve aggiungere limiti per IP e protezione del traffico in ingresso.
"""
import asyncio
import time
from collections import deque

class RequestLimits:
    def __init__(self, app, maximum=4, per_minute=120, timeout_seconds=120):
        self.app = app
        self.timeout_seconds = timeout_seconds
        self.maximum = maximum
        self.per_minute = per_minute
        self.active = 0
        self.arrivals = deque()

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope['path'].startswith('/api/') or scope['path'] == '/api/meta':
            return await self.app(scope, receive, send)
        now = time.monotonic()
        while self.arrivals and self.arrivals[0] <= now - 60:
            self.arrivals.popleft()
        if self.active >= self.maximum or len(self.arrivals) >= self.per_minute:
            await send({'type': 'http.response.start', 'status': 429,
                        'headers': [(b'content-type', b'application/json'), (b'retry-after', b'60')]})
            await send({'type': 'http.response.body', 'body': b'{"detail":"Service busy. Retry later."}'})
            return
        self.arrivals.append(now)
        self.active += 1
        started = False
        async def tracked_send(message):
            nonlocal started
            if message['type'] == 'http.response.start':
                started = True
            await send(message)
        try:
            async with asyncio.timeout(self.timeout_seconds):
                await self.app(scope, receive, tracked_send)
        except TimeoutError:
            if started:
                raise
            await send({'type': 'http.response.start', 'status': 504,
                        'headers': [(b'content-type', b'application/json')]})
            await send({'type': 'http.response.body', 'body': b'{"detail":"Calculation timed out. Retry later."}'})
        finally:
            self.active -= 1
