FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# rembg downloads its ONNX model to U2NET_HOME on first use; bake it into the
# image so runtime needs no network and every worker shares the same path.
ENV U2NET_HOME=/app/.u2net \
    REMBG_MODEL=isnet-general-use

COPY requirements.txt .
RUN pip install -r requirements.txt
RUN python -c "from rembg import new_session; new_session('${REMBG_MODEL}')"

COPY . .

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "alembic upgrade head && gunicorn app.main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --max-requests 1000 --max-requests-jitter 50 --timeout 120"]
