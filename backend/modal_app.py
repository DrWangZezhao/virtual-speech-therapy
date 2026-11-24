"""Deploy the container-backed API to Modal with one on-demand CPU replica."""

from pathlib import Path

import modal

ROOT = Path(__file__).resolve().parents[1]
image = modal.Image.from_dockerfile(ROOT / 'backend' / 'Dockerfile', context_dir=ROOT)
app = modal.App('virtual-speech-therapy-analysis')


@app.function(image=image, cpu=2, memory=6144, region='eu', routing_region='eu-west',
              min_containers=0, max_containers=1, scaledown_window=30, timeout=90)
@modal.concurrent(max_inputs=4)
@modal.asgi_app(label='speech-analysis')
def analysis():
    import sys

    sys.path.insert(0, '/app/backend')
    from service import app as api

    return api
