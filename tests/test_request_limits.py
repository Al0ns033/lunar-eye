"""Verifica ammissione e rilascio senza rete o carico sul servizio."""
import asyncio
from backend.request_limits import RequestLimits


def test_capacity_rejects_without_queue_and_releases():
    async def run():
        entered, release = asyncio.Event(), asyncio.Event()
        async def app(scope, receive, send):
            entered.set()
            await release.wait()
        guard = RequestLimits(app, maximum=1)
        scope = {'type': 'http', 'path': '/api/site'}
        messages = []
        async def send(message):
            messages.append(message)
        first = asyncio.create_task(guard(scope, None, send))
        await entered.wait()
        await guard(scope, None, send)
        assert messages[0]['status'] == 429
        assert guard.active == 1
        release.set()
        await first
        assert guard.active == 0
    asyncio.run(run())


def test_rate_budget_and_exception_release():
    async def run():
        async def app(scope, receive, send):
            raise RuntimeError('fixture')
        guard = RequestLimits(app, per_minute=1)
        scope = {'type': 'http', 'path': '/api/objects/ceres'}
        messages = []
        async def send(message):
            messages.append(message)
        try:
            await guard(scope, None, send)
        except RuntimeError:
            pass
        assert guard.active == 0
        await guard(scope, None, send)
        assert messages[0]['status'] == 429
    asyncio.run(run())


def test_timeout_cancels_work_and_releases_capacity():
    async def run():
        cancelled = asyncio.Event()
        async def app(scope, receive, send):
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        guard = RequestLimits(app, timeout_seconds=0.01)
        messages = []
        async def send(message):
            messages.append(message)
        await guard({'type': 'http', 'path': '/api/states'}, None, send)
        assert cancelled.is_set()
        assert guard.active == 0
        assert messages[0]['status'] == 504
    asyncio.run(run())
