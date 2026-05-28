from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.print_canvas_export import PrintCanvasExport


async def create_export(db: AsyncSession, payload: dict) -> PrintCanvasExport:
    item = PrintCanvasExport(**payload)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def list_exports_for_user(db: AsyncSession, user_id: str) -> list[PrintCanvasExport]:
    result = await db.execute(
        select(PrintCanvasExport)
        .where(PrintCanvasExport.user_id == user_id)
        .order_by(desc(PrintCanvasExport.created_at))
    )
    return list(result.scalars().all())


async def get_export(db: AsyncSession, export_id: UUID) -> PrintCanvasExport | None:
    result = await db.execute(
        select(PrintCanvasExport).where(PrintCanvasExport.id == export_id)
    )
    return result.scalar_one_or_none()
