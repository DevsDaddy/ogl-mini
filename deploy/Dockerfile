FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
COPY api ./api
COPY models ./models
RUN pip install --no-cache-dir -e . && pip install --no-cache-dir fastapi uvicorn onnxruntime scikit-learn numpy slowapi
EXPOSE 8000
ENV PYTHONPATH=/app/src:/app
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
