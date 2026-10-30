FROM ghcr.io/astral-sh/uv:0.12.1 AS uv
FROM python:3.13-slim
COPY --from=uv /uv /uvx /bin/
WORKDIR /app
ENV REQUIRE_DATABASE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY worker ./worker
COPY db ./db
RUN useradd --create-home app && mkdir -p data && chown app:app data
USER app
CMD [".venv/bin/python", "-m", "worker.live"]
