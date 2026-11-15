FROM python:3.14.6-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && useradd -r -u 10001 -m app
COPY backend backend
COPY frontend frontend
COPY scripts scripts
COPY data/registry.json data/registry.json
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN mkdir -p data/raw data/cache frontend/textures && chown -R app /app && chmod +x /docker-entrypoint.sh
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/api/meta', timeout=4)"
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
