from datetime import datetime, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from app.config import get_settings
from app.schemas import TechCardRequest


BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"


_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def _yes_no(value):
    if value is True:
        return "Да"
    if value is False:
        return "Нет"
    return value if value not in (None, "") else "—"


def _safe(value):
    if value is None or value == "":
        return "—"
    return value


_env.filters["yn"] = _yes_no
_env.filters["safe_dash"] = _safe


def render_pdf(req: TechCardRequest) -> bytes:
    settings = get_settings()
    template_name = "approval.html" if req.doc_type == "approval" else "techcard.html"
    template = _env.get_template(template_name)
    html = template.render(
        req=req,
        manufacturer_name=settings.manufacturer_name,
        manufacturer_id=settings.manufacturer_id,
        generated_at=datetime.now(timezone.utc).strftime("%d.%m.%Y %H:%M"),
        order_date=(req.created_at.strftime("%d.%m.%Y") if req.created_at else "—"),
    )
    pdf = HTML(string=html, base_url=str(STATIC_DIR)).write_pdf()
    return pdf
