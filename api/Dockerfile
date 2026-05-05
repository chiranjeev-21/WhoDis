FROM python:3.10-slim-bookworm

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import onnxruntime; print(onnxruntime.__version__)"

# Copy application code
COPY . .

# Create local runtime directory
RUN mkdir -p /app/local_data/temp

# Expose port
EXPOSE 8000

# Run application locally.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
