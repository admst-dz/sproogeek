from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from app.core.config import get_settings


settings = get_settings()

# При работе через PgBouncer в transaction pool mode серверные prepared
# statements asyncpg конфликтуют с пулом (statement готовится на одном
# backend-коннекте, а исполняется на другом). Отключаем кеш PS.
engine = create_async_engine(
    settings.sqlalchemy_database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    pool_pre_ping=True,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
