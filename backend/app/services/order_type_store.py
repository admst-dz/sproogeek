import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException


ORDER_TYPE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
MAX_ORDER_TYPE_FILE_BYTES = int(os.getenv("ORDER_TYPE_FILE_MAX_BYTES", "262144"))


def _data_dir() -> Path:
    configured = os.getenv("ORDER_TYPES_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[1] / "data" / "order_types"


def _ensure_dir() -> Path:
    directory = _data_dir()
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def validate_type_id(type_id: str) -> str:
    if not ORDER_TYPE_ID_PATTERN.fullmatch(type_id):
        raise HTTPException(status_code=400, detail="Invalid order type id")
    return type_id


def _path_for(type_id: str) -> Path:
    directory = _ensure_dir()
    safe_id = validate_type_id(type_id)
    path = (directory / f"{safe_id}.json").resolve()
    if directory.resolve() not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid order type path")
    return path


def list_order_types() -> List[Dict[str, Any]]:
    directory = _ensure_dir()
    items = []
    for path in sorted(directory.glob("*.json")):
        stat = path.stat()
        items.append(
            {
                "id": path.stem,
                "filename": path.name,
                "size_bytes": stat.st_size,
                "updated_at": stat.st_mtime,
            }
        )
    return items


def read_order_type(type_id: str) -> Dict[str, Any]:
    path = _path_for(type_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Order type file not found")
    if path.stat().st_size > MAX_ORDER_TYPE_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Order type file is too large")
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="Order type JSON is invalid")
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Order type JSON must be an object")
    return data


def write_order_type(type_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="Order type JSON must be an object")
    encoded = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    if len(encoded) > MAX_ORDER_TYPE_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Order type JSON is too large")

    path = _path_for(type_id)
    tmp_path = path.with_suffix(".json.tmp")
    with tmp_path.open("wb") as handle:
        handle.write(encoded)
        handle.write(b"\n")
    tmp_path.replace(path)
    return read_order_type(type_id)
