import csv
import json
import os
import socket
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


MAX_LINES_PER_FILE = int(os.getenv("EVENT_LOG_MAX_LINES", "10000"))
LOG_FILE_PREFIX = "events"
LOG_FILE_EXTENSION = ".csv"

LOG_FIELDS = [
    "timestamp",
    "event_id",
    "event_type",
    "direction",
    "actor_type",
    "actor_id",
    "actor_email",
    "container",
    "peer",
    "method",
    "path",
    "status_code",
    "latency_ms",
    "ip",
    "user_agent",
    "request_id",
    "entity_type",
    "entity_id",
    "description",
    "details_json",
]


def _find_project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "backend").exists() and (parent / "frontend").exists():
            return parent
        if (parent / "app").exists() and (parent / "requirements.txt").exists():
            return parent
    return current.parents[2]


def _get_log_dir() -> Path:
    configured = os.getenv("EVENT_LOG_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return _find_project_root() / "logs"


def _safe_text(value: Any, limit: int = 2000) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r", " ").replace("\n", " ").strip()
    if len(text) > limit:
        return f"{text[:limit]}..."
    return text


def _safe_json(value: Optional[Dict[str, Any]], limit: int = 6000) -> str:
    if not value:
        return "{}"
    text = json.dumps(value, ensure_ascii=False, default=str, separators=(",", ":"))
    if len(text) > limit:
        return json.dumps({"truncated": True, "preview": text[:limit]}, ensure_ascii=False)
    return text


class CsvEventLogger:
    def __init__(self) -> None:
        self.log_dir = _get_log_dir()
        self.hostname = os.getenv("HOSTNAME") or socket.gethostname()
        self._lock = threading.RLock()
        self._current_file: Optional[Path] = None
        self._current_line_count = 0

    def _line_count(self, path: Path) -> int:
        if not path.exists():
            return 0
        with path.open("r", encoding="utf-8", newline="") as handle:
            return sum(1 for _ in handle)

    def _candidate_path(self, index: int) -> Path:
        day = datetime.now(timezone.utc).strftime("%Y%m%d")
        return self.log_dir / f"{LOG_FILE_PREFIX}_{day}_{index:04d}{LOG_FILE_EXTENSION}"

    def _select_file(self) -> Path:
        self.log_dir.mkdir(parents=True, exist_ok=True)
        index = 1
        while True:
            candidate = self._candidate_path(index)
            line_count = self._line_count(candidate)
            if line_count < MAX_LINES_PER_FILE:
                self._current_file = candidate
                self._current_line_count = line_count
                return candidate
            index += 1

    def _file(self) -> Path:
        if self._current_file is None:
            return self._select_file()
        if self._current_line_count >= MAX_LINES_PER_FILE:
            return self._select_file()
        if self._current_file.name[7:15] != datetime.now(timezone.utc).strftime("%Y%m%d"):
            return self._select_file()
        return self._current_file

    def log(
        self,
        event_type: str,
        description: str,
        *,
        direction: str = "",
        actor_type: str = "",
        actor_id: str = "",
        actor_email: str = "",
        peer: str = "",
        method: str = "",
        path: str = "",
        status_code: Any = "",
        latency_ms: Any = "",
        ip: str = "",
        user_agent: str = "",
        request_id: str = "",
        entity_type: str = "",
        entity_id: str = "",
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        row = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_id": str(uuid.uuid4()),
            "event_type": _safe_text(event_type, 120),
            "direction": _safe_text(direction, 120),
            "actor_type": _safe_text(actor_type, 80),
            "actor_id": _safe_text(actor_id, 120),
            "actor_email": _safe_text(actor_email, 255),
            "container": self.hostname,
            "peer": _safe_text(peer, 255),
            "method": _safe_text(method, 16),
            "path": _safe_text(path, 1000),
            "status_code": _safe_text(status_code, 16),
            "latency_ms": _safe_text(latency_ms, 32),
            "ip": _safe_text(ip, 120),
            "user_agent": _safe_text(user_agent, 1000),
            "request_id": _safe_text(request_id, 120),
            "entity_type": _safe_text(entity_type, 120),
            "entity_id": _safe_text(entity_id, 120),
            "description": _safe_text(description, 2000),
            "details_json": _safe_json(details),
        }

        with self._lock:
            path = self._file()
            is_new_file = not path.exists() or self._current_line_count == 0
            with path.open("a", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=LOG_FIELDS)
                if is_new_file:
                    writer.writeheader()
                    self._current_line_count += 1
                writer.writerow(row)
                self._current_line_count += 1


event_logger = CsvEventLogger()

