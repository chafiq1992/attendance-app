import os
import importlib
import asyncio
import pytest
import pytest_asyncio
from testcontainers.postgres import PostgresContainer
from httpx import AsyncClient

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest_asyncio.fixture(scope="session")
async def client():
    with PostgresContainer("postgres:15") as postgres:
        url = postgres.get_connection_url()
        async_url = url.replace("postgresql://", "postgresql+asyncpg://")
        os.environ["DATABASE_URL"] = async_url

        import api.models
        import api.main
        importlib.reload(api.models)
        importlib.reload(api.main)

        from api.models import init_models
        from api.main import app

        await init_models()
        async with AsyncClient(app=app, base_url="http://test") as ac:
            yield ac
