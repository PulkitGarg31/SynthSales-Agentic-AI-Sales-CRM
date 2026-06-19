# SynthSales API — production image.
#
# psycopg[binary] bundles its own libpq, so no system Postgres client libs are
# needed; the slim base stays lean. The schema is migrated on boot by the app's
# lifespan (`alembic upgrade head`), so no separate migration step is required.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install deps first so the layer caches across code-only changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code (includes alembic/ for the on-boot upgrade).
COPY . .

# Run as a non-root user.
RUN useradd --create-home --uid 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Documentation only — the platform routes to whatever $PORT it injects.
EXPOSE 8000

# Single web worker keeps the on-boot Alembic upgrade race-free. The background
# scheduler's action jobs are Postgres-advisory-locked, so horizontal scaling is
# still safe; scale the web service, not in-process workers. Bind to $PORT
# (PaaS-provided) and fall back to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
