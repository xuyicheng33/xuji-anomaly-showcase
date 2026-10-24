"""Read-only presentation service for archived research results."""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .data import PUBLIC, catalog

app = FastAPI(title="Xuji Anomaly Explorer")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "xuji-anomaly-explorer", "mode": "official-archives"}


@app.get("/api/catalog")
def get_catalog():
    return catalog()


app.mount("/data", StaticFiles(directory=PUBLIC), name="data")
