from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import numpy as np

# Compatibility shim for libraries that still reference removed NumPy 2.x aliases.
if not hasattr(np, "float_"):
    np.float_ = np.float64

from routers import easy, medium, hard, complex_router

app = FastAPI(title="GenAI Workshop API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(easy.router, prefix="/api/easy", tags=["Easy"])
app.include_router(medium.router, prefix="/api/medium", tags=["Medium"])
app.include_router(hard.router, prefix="/api/hard", tags=["Hard"])
app.include_router(complex_router.router, prefix="/api/complex", tags=["Complex"])

@app.get("/")
async def root():
    return {"status": "ok", "message": "GenAI Workshop API running"}
