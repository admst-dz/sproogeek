"""Server-side pricing endpoint.

Раньше цена жёстко зашита на фронте (priceBYN: 1500). Это:
- Уязвимо к подмене заказа.
- При изменении тарифов — нужен передеплой фронта.

Эндпоинт принимает конфигурацию и возвращает breakdown + total.
Логика пока простая (можно усложнить под скидки/материалы).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


router = APIRouter()


# ─── Базовые тарифы (BYN) ──────────────────────────────────────────────────────
# Можно перенести в БД позже. Сейчас — константы для скорости.

BASE_PRICE = {
    "notebook": 1500,
    "sketchbook": 1000,
    "thermos": 2200,
    "powerbank": 3500,
}

BINDING_MULTIPLIER = {
    "hard": 1.0,
    "spiral": 0.85,
    "soft": 0.7,
}

FORMAT_MULTIPLIER = {
    "A4": 1.4,
    "A5": 1.0,
    "A6": 0.8,
}

LOGO_PRICE = 250  # за каждый размещённый логотип
ELASTIC_PRICE = 80
CORNERS_PRICE = 120
SAMPLE_FEE = 500  # фикс за тиражный образец перед партией


# ─── Тираж-скидка ──────────────────────────────────────────────────────────────

def quantity_multiplier(qty: int) -> float:
    """Прогрессивная скидка от тиража. Возвращает множитель к unit price."""
    if qty >= 500:
        return 0.55
    if qty >= 200:
        return 0.65
    if qty >= 100:
        return 0.75
    if qty >= 50:
        return 0.85
    if qty >= 20:
        return 0.92
    return 1.0


# ─── Schema ────────────────────────────────────────────────────────────────────

class PricingLogo(BaseModel):
    side: Optional[str] = None
    target: Optional[str] = None


class PricingRequest(BaseModel):
    product: str = Field(..., description="notebook | sketchbook | thermos | powerbank")
    quantity: int = Field(1, ge=1, le=10000)
    is_sample: bool = False

    # Notebook/Sketchbook
    binding_type: Optional[str] = None
    format: Optional[str] = None
    has_elastic: bool = False
    has_corners: bool = False
    logos: List[PricingLogo] = Field(default_factory=list)

    # Thermos / Powerbank — currently no extras


class PricingLine(BaseModel):
    label: str
    qty: int
    unit_price: float
    total: float


class PricingResponse(BaseModel):
    currency: str = "BYN"
    quantity: int
    unit_price: float
    subtotal: float
    discount_percent: float
    total: float
    breakdown: List[PricingLine]


# ─── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/quote", response_model=PricingResponse)
async def quote(req: PricingRequest):
    if req.product not in BASE_PRICE:
        raise HTTPException(status_code=422, detail=f"Unknown product: {req.product}")

    breakdown: List[PricingLine] = []

    base = BASE_PRICE[req.product]
    binding_mult = BINDING_MULTIPLIER.get(req.binding_type or "hard", 1.0)
    format_mult = FORMAT_MULTIPLIER.get(req.format or "A5", 1.0)
    unit_base = round(base * binding_mult * format_mult, 2)

    breakdown.append(PricingLine(
        label=f"Базовая цена ({req.product}, {req.format or '—'}, {req.binding_type or '—'})",
        qty=req.quantity, unit_price=unit_base, total=round(unit_base * req.quantity, 2),
    ))

    extras_per_unit = 0.0
    if req.has_elastic:
        extras_per_unit += ELASTIC_PRICE
        breakdown.append(PricingLine(
            label="Резинка", qty=req.quantity, unit_price=ELASTIC_PRICE,
            total=ELASTIC_PRICE * req.quantity,
        ))
    if req.has_corners:
        extras_per_unit += CORNERS_PRICE
        breakdown.append(PricingLine(
            label="Уголки", qty=req.quantity, unit_price=CORNERS_PRICE,
            total=CORNERS_PRICE * req.quantity,
        ))
    if req.logos:
        logo_total = LOGO_PRICE * len(req.logos)
        extras_per_unit += logo_total
        breakdown.append(PricingLine(
            label=f"Логотипы (×{len(req.logos)})", qty=req.quantity,
            unit_price=logo_total, total=logo_total * req.quantity,
        ))

    unit_price = unit_base + extras_per_unit

    qty_mult = quantity_multiplier(req.quantity)
    discount_percent = round((1 - qty_mult) * 100, 1)

    subtotal = round(unit_price * req.quantity, 2)
    total = round(subtotal * qty_mult, 2)

    if req.is_sample:
        total += SAMPLE_FEE
        breakdown.append(PricingLine(
            label="Тиражный образец", qty=1, unit_price=SAMPLE_FEE, total=SAMPLE_FEE,
        ))

    return PricingResponse(
        quantity=req.quantity,
        unit_price=round(unit_price, 2),
        subtotal=subtotal,
        discount_percent=discount_percent,
        total=round(total, 2),
        breakdown=breakdown,
    )


# ─── Каталог тарифов (для фронта, чтобы показать сетку скидок) ────────────────

@router.get("/tariffs")
async def tariffs() -> Dict[str, Any]:
    return {
        "base": BASE_PRICE,
        "binding": BINDING_MULTIPLIER,
        "format": FORMAT_MULTIPLIER,
        "extras": {
            "logo_each": LOGO_PRICE,
            "elastic": ELASTIC_PRICE,
            "corners": CORNERS_PRICE,
            "sample_fee": SAMPLE_FEE,
        },
        "quantity_breaks": [
            {"min": 1, "discount_percent": 0},
            {"min": 20, "discount_percent": 8},
            {"min": 50, "discount_percent": 15},
            {"min": 100, "discount_percent": 25},
            {"min": 200, "discount_percent": 35},
            {"min": 500, "discount_percent": 45},
        ],
        "currency": "BYN",
    }
