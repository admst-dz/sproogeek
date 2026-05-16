from typing import List, Literal, Optional, Tuple

from pydantic import BaseModel, Field


ProductKind = Literal["thermos", "powerbank", "notebook"]


class LogoPlacement(BaseModel):
    """Placement of a single decal as captured by the configurator scene.

    `target` is the named slot on the product (e.g. "body", "capTop", "front").
    `position` is the configurator's signed editor coordinate for the target
    surface (center is [0, 0]); the renderer maps each target to print-space.
    `scale` is the configurator's visual size value, not a full-face fraction.
    `decal_url` is optional — if present, the service can embed the artwork into
    the unwrap; otherwise we draw a placeholder rectangle showing the print area.
    """
    id: Optional[str] = None
    target: str
    position: Tuple[float, float] = (0.0, 0.0)
    rotation: float = 0.0
    scale: float = 0.3
    filename: Optional[str] = None
    mode: Optional[Literal["decal", "wrap"]] = None
    side: Optional[str] = None
    decal_url: Optional[str] = None
    decal_data_url: Optional[str] = None  # base64 data URL


class ThermosDimensions(BaseModel):
    body_diameter_mm: float = 70.0
    body_height_mm: float = 190.0
    cap_diameter_mm: float = 55.0
    cap_side_height_mm: float = 35.0


class PowerbankDimensions(BaseModel):
    width_mm: float = 95.0
    height_mm: float = 65.0
    depth_mm: float = 22.0


class NotebookDimensions(BaseModel):
    width_mm: float = 145.0
    height_mm: float = 210.0
    spine_thickness_mm: float = 12.0


class UnwrapRequest(BaseModel):
    order_id: str = Field(..., min_length=1, max_length=80)
    product_kind: ProductKind
    logos: List[LogoPlacement] = []
    thermos: Optional[ThermosDimensions] = None
    powerbank: Optional[PowerbankDimensions] = None
    notebook: Optional[NotebookDimensions] = None


class UnwrapResponse(BaseModel):
    bytes: int
    pages: int
