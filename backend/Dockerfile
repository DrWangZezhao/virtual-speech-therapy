FROM mambaorg/micromamba:2.3.2 AS micromamba
FROM python:3.12-slim-bookworm

COPY --from=micromamba /bin/micromamba /usr/local/bin/micromamba
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*
RUN MAMBA_ROOT_PREFIX=/tmp/mamba micromamba create --yes --prefix /opt/mfa --override-channels \
    --channel conda-forge python=3.12 montreal-forced-aligner=3.4.4 \
    && rm -rf /tmp/mamba

ENV VST_MODELS=/opt/vst-models \
    VST_MFA=/opt/mfa/bin/mfa \
    VST_MFA_MODELS=/opt/mfa-models/pretrained_models \
    HF_HUB_DISABLE_XET=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
RUN export PATH="/opt/mfa/bin:$PATH" MFA_ROOT_DIR=/opt/mfa-models \
    && mfa model download acoustic mandarin_mfa --version 3.0.0 \
    && mfa model download dictionary mandarin_china_mfa --version 3.0.0 \
    && test -s "$VST_MFA_MODELS/acoustic/mandarin_mfa.zip" \
    && test -s "$VST_MFA_MODELS/dictionary/mandarin_china_mfa.dict"

WORKDIR /app
COPY backend/requirements.txt backend/download_models.py /app/backend/
RUN python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu 'torch==2.15.0+cpu' \
    && python -m pip install --no-cache-dir -r backend/requirements.txt
RUN python backend/download_models.py

COPY backend/service.py backend/mandarin.py backend/pitch.py /app/backend/
COPY public/data/curriculum.zh-CN.json public/data/curriculum.other.json /app/public/data/
EXPOSE 8787
CMD ["python", "-m", "uvicorn", "--app-dir", "/app/backend", "service:app", "--host", "0.0.0.0", "--port", "8787", "--no-access-log"]
