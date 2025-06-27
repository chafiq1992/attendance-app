from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import pathlib

from app.attendance import router as attendance_router

app = FastAPI(title="Employee Attendance API")

# serve /static/*
BASE_DIR   = pathlib.Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR.parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(attendance_router)

@app.get("/health")
def health():
    return {"ok": True}
