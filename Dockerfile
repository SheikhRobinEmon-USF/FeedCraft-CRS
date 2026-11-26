FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=secret,id=pip_ca \
    if [ -f /run/secrets/pip_ca ]; then export PIP_CERT=/run/secrets/pip_ca; fi \
    && pip install --no-cache-dir -r requirements.txt
COPY --chown=10001:10001 services services
COPY --chown=10001:10001 fixtures fixtures
COPY --chown=10001:10001 apps/web/public/demo/evaluation.json apps/web/public/demo/evaluation.json
ENV FEEDCRAFT_DB=/state/demo.db OPENBLAS_NUM_THREADS=1
RUN mkdir /state && chown 10001 /state
USER 10001
CMD ["python", "-m", "uvicorn", "services.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
