FROM debian:bookworm-slim AS cpp_build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential cmake ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY glb-unwrapper/CMakeLists.txt ./
COPY glb-unwrapper/src ./src

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --parallel


FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    GLB_UNWRAPPER_BIN=/usr/local/bin/glb_unwrapper

RUN apt-get update && apt-get install -y --no-install-recommends \
        tini \
        libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY unwrap/requirements.txt .
RUN pip install -r requirements.txt

COPY unwrap/app ./app
COPY --from=cpp_build /src/build/glb_unwrapper /usr/local/bin/glb_unwrapper

EXPOSE 8000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
