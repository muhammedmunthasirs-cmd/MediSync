"""
Creates a demo clinician account and one demo patient so you have something
to click around immediately after first install.

Usage (from the backend/ directory, with the venv active):
    python seed_demo.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, Base, engine
from app import models
from app.security import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()

DEMO_EMAIL = "demo@medisync.local"
DEMO_PASSWORD = "DemoPass123!"

existing = db.query(models.User).filter(models.User.email == DEMO_EMAIL).first()
if existing:
    print(f"Demo user already exists: {DEMO_EMAIL}")
else:
    user = models.User(
        email=DEMO_EMAIL,
        full_name="Dr. Demo Clinician",
        role="clinician",
        password_hash=hash_password(DEMO_PASSWORD),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"Created demo user -> email: {DEMO_EMAIL}  password: {DEMO_PASSWORD}")

    patient = models.Patient(
        mrn="MRN-0001",
        full_name="Asha Verma",
        date_of_birth="1985-03-12",
        gender="female",
        known_allergies=["Penicillin"],
        notes="Seeded demo patient. Upload a prescription, lab report, or note to see "
              "the timeline and conflict detection populate.",
        created_by=user.id,
    )
    db.add(patient)
    db.commit()
    print(f"Created demo patient -> {patient.full_name} (MRN {patient.mrn})")

db.close()
