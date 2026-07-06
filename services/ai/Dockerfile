# CaseLens AI service (FastAPI). Build context is the repo root.

FROM python:3.11-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000
RUN groupadd --system app && useradd --system --gid app app

# Install deps first for better layer caching.
COPY services/ai/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY services/ai/pyproject.toml ./pyproject.toml
COPY services/ai/app ./app

USER app
EXPOSE 8000
# Render (and compose) inject PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
