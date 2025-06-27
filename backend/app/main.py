from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.attendance import router as attendance_router

app = FastAPI(title="Employee Attendance API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(attendance_router)

@app.get("/health")
def health(): return {"ok": True}
