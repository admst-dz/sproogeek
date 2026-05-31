import json
import os
from pathlib import Path
from typing import Any, Dict

from fastapi import HTTPException


DEFAULT_SETTINGS: Dict[str, Any] = {
    "guest_approval_enabled": True,
    "home_sections": {
        "notebook": True,
        "thermos": True,
        "powerbank": True,
        "sticker": True,
        "print_canvas": False,
    },
    "dashboard_sections": {
        "notebook": True,
        "thermos": True,
        "powerbank": True,
        "sticker": True,
        "print_canvas": True,
    },
}
MAX_SETTINGS_FILE_BYTES = int(os.getenv("APP_SETTINGS_MAX_BYTES", "16384"))


def _settings_path() -> Path:
    configured = os.getenv("APP_SETTINGS_FILE")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[1] / "data" / "settings.json"


def read_settings() -> Dict[str, Any]:
    path = _settings_path()
    if not path.exists():
        return DEFAULT_SETTINGS.copy()
    if path.stat().st_size > MAX_SETTINGS_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Settings file is too large")
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Settings JSON is invalid") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Settings JSON must be an object")
    settings = {**DEFAULT_SETTINGS, **data}
    for section_key in ("home_sections", "dashboard_sections"):
        settings[section_key] = {
            **DEFAULT_SETTINGS[section_key],
            **(data.get(section_key) if isinstance(data.get(section_key), dict) else {}),
        }
    return settings


def write_settings(patch: Dict[str, Any]) -> Dict[str, Any]:
    next_settings = {**read_settings(), **patch}
    encoded = json.dumps(next_settings, ensure_ascii=False, indent=2).encode("utf-8")
    if len(encoded) > MAX_SETTINGS_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Settings JSON is too large")

    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(".json.tmp")
    with tmp_path.open("wb") as handle:
        handle.write(encoded)
        handle.write(b"\n")
    tmp_path.replace(path)
    return read_settings()
