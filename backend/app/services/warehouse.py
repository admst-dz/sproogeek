"""Materials warehouse — stock balances + auto-deduct on production."""
from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.material import Material, MaterialMovement
from app.models.order import Order


log = logging.getLogger(__name__)


# ─── Heuristic recipe: estimate consumed materials per ordered item ──────────
# Real impl will pull from a per-product BoM; this is a sane placeholder so
# the auto-deduct path is exercised end-to-end and stays auditable.
def estimate_consumption(order: Order) -> dict[str, float]:
    config = order.configuration or {}
    pc = config.get("productConfig") or config
    qty = max(1, int(order.quantity or 1))

    fmt = (pc.get("format") or "A5").upper()
    paper_sku = "PAPER-A5-80GSM" if fmt == "A5" else "PAPER-A6-80GSM"
    cover_sku = "COVER-CARDBOARD-2MM"

    pages = int(pc.get("pagesCount") or 192)
    sheets_per_book = max(1, pages // 2)

    rough = {
        paper_sku: float(qty * sheets_per_book),
        cover_sku: float(qty * 2),
    }
    if pc.get("hasElastic"):
        rough["ELASTIC-CORD-3MM"] = qty * 0.30  # m
    if pc.get("bindingType") == "spiral":
        rough["SPIRAL-WIRE"] = qty * 1.0
    return rough


async def deduct_for_order(db: AsyncSession, order: Order) -> list[dict]:
    """Apply estimated consumption to stock. Idempotent: skips if already
    deducted for this order id (one MaterialMovement row per material per order).
    """
    plan = estimate_consumption(order)
    if not plan:
        return []

    existing = (await db.execute(
        select(MaterialMovement.material_id).where(MaterialMovement.order_id == order.id)
    )).scalars().all()
    if existing:
        log.info("warehouse: skip duplicate deduct order=%s", order.id)
        return []

    materials = (await db.execute(select(Material).where(Material.id.in_(list(plan.keys()))))).scalars().all()
    by_id = {m.id: m for m in materials}
    moves: list[dict] = []
    for sku, qty in plan.items():
        material = by_id.get(sku)
        if not material:
            log.warning("warehouse: missing SKU %s for order=%s", sku, order.id)
            continue
        material.stock_qty = (material.stock_qty or 0.0) - qty
        db.add(MaterialMovement(
            material_id=sku,
            delta=-qty,
            balance_after=material.stock_qty,
            reason=f"production:{order.id}",
            order_id=order.id,
            payload={"qty": qty, "unit": material.unit},
        ))
        moves.append({"material_id": sku, "delta": -qty, "balance_after": material.stock_qty})
    await db.commit()
    return moves


async def list_materials(db: AsyncSession) -> list[Material]:
    return (await db.execute(select(Material).order_by(Material.id))).scalars().all()


async def topup(db: AsyncSession, material_id: str, qty: float, reason: str = "topup") -> Material:
    material = await db.get(Material, material_id)
    if not material:
        raise ValueError(f"Unknown material {material_id}")
    material.stock_qty = (material.stock_qty or 0.0) + qty
    db.add(MaterialMovement(
        material_id=material_id, delta=qty,
        balance_after=material.stock_qty, reason=reason,
    ))
    await db.commit()
    await db.refresh(material)
    return material


async def low_stock(db: AsyncSession) -> list[Material]:
    materials = await list_materials(db)
    return [m for m in materials if m.stock_qty < (m.reorder_threshold or 0)]
