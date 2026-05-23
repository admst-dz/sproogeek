# syntax=docker/dockerfile:1.6
#
# Build context для этого Dockerfile = корень репозитория (.), потому
# что нам нужны GLB-модели из frontend/src/assets/. См. docker-compose.yml
# (services.glb_unwrapper.build.context = .).

# ── 1. Сборка C++ бинаря (как раньше) ──────────────────────────────────
FROM debian:bookworm-slim AS cpp-build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential cmake ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY microservices/glb-unwrapper/CMakeLists.txt .
COPY microservices/glb-unwrapper/src ./src

RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build build --parallel \
    && strip build/glb_unwrapper

# ── 2. Сборка Go HTTP-обёртки ──────────────────────────────────────────
FROM golang:1.22-alpine AS go-build

WORKDIR /src
COPY microservices/glb-unwrapper/server/go.mod ./
COPY microservices/glb-unwrapper/server/main.go ./

ENV CGO_ENABLED=0
RUN go build -ldflags="-s -w" -o /out/glb_unwrapper_server ./...

# ── 3. Runtime ─────────────────────────────────────────────────────────
# Бинарь glb_unwrapper линкуется с glibc (libstdc++/libgcc), поэтому
# берём debian-slim, а не distroless-static. На distroless-cc можно при
# желании заменить — образ получится меньше, но debian-slim надёжнее
# для дальнейших отладок (есть shell).
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 svc

WORKDIR /app
COPY --from=cpp-build /src/build/glb_unwrapper /usr/local/bin/glb_unwrapper
COPY --from=go-build  /out/glb_unwrapper_server /usr/local/bin/glb_unwrapper_server

# GLB-модели берём из единственного источника правды — frontend assets,
# чтобы не плодить копию ассетов в репо. Сервис /by-model/{name}/...
# использует name = имя файла без расширения, см. README ниже.
COPY frontend/src/assets/termos3.glb           /models/termos.glb
COPY frontend/src/assets/poverbank.glb         /models/powerbank.glb
COPY frontend/src/assets/tverdiy_pereplet.glb  /models/notebook_hard.glb
COPY frontend/src/assets/tonkiy_pereplet.glb   /models/notebook_soft.glb
COPY frontend/src/assets/na_pruzhine.glb       /models/notebook_spiral.glb
COPY frontend/src/assets/spiral.glb            /models/spiral.glb

ENV GLB_UNWRAPPER_BIN=/usr/local/bin/glb_unwrapper \
    GLB_UNWRAPPER_MODELS_DIR=/models \
    GLB_UNWRAPPER_LISTEN_ADDR=:8000

USER svc
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/glb_unwrapper_server"]
