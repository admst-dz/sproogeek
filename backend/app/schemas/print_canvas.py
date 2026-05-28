from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PrintCanvasExportResponse(BaseModel):
    id: UUID
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    filename: str
    file_size: int
    content_type: str
    sheet_width_mm: int
    used_width_mm: float
    used_height_mm: float
    max_length_m: int
    logo_gap_mm: float
    items_count: int
    density: int
    export_dpi: int
    export_metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
