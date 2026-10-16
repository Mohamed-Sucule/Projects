FROM python:3.11.15-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TALLY_DATA_DIR=/data

WORKDIR /srv/tally
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY data ./data
COPY web ./web
COPY reports ./reports

# Run as an unprivileged user that can write only its data directory.
RUN useradd --system --uid 10001 --home /srv/tally tally && mkdir -p /data && chown tally /data
USER tally

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/healthz', timeout=4)"

# One worker: rate limits and in-flight question slots are kept in memory.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --no-server-header"]
