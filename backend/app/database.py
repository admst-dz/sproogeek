import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    # БЕЗОПАСНОСТЬ: Настройка пула соединений
    pool_size=10,        # Держим 10 постоянных подключений
    max_overflow=20,     # Разрешаем создать еще 20 при пиковой нагрузке
    pool_recycle=1800,   # Перезапускаем соединения каждые 30 минут
    pool_pre_ping=True   # Проверяем "живость" соединения перед использованием
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()