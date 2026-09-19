import datetime
import uuid

from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship

from .database import Base


def gen_id() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="clinician")  # clinician | admin
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, default=gen_id)
    mrn = Column(String, unique=True, index=True, nullable=False)  # Medical Record Number
    full_name = Column(String, nullable=False)
    date_of_birth = Column(String, nullable=True)  # ISO date string, patient-supplied
    gender = Column(String, nullable=True)
    known_allergies = Column(JSON, default=list)  # list[str], clinician-declared
    notes = Column(Text, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    documents = relationship("Document", back_populates="patient", cascade="all, delete-orphan")
    conflicts = relationship("ConflictFlag", back_populates="patient", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=gen_id)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    doc_type = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    storage_path = Column(String, nullable=False)

    # Best-effort extracted event date (may be null if extraction couldn't find one
    # and the uploader didn't supply one -> surfaces as a "missing info" conflict).
    document_date = Column(String, nullable=True)  # ISO date string
    date_source = Column(String, default="unknown")  # "provided" | "extracted" | "unknown"

    raw_text = Column(Text, nullable=True)
    structured_data = Column(JSON, default=dict)  # medications, diagnoses, allergies, labs...
    extraction_status = Column(String, default="pending")  # pending|ok|failed
    extraction_notes = Column(Text, nullable=True)

    uploaded_by = Column(String, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)

    patient = relationship("Patient", back_populates="documents")


class ConflictFlag(Base):
    __tablename__ = "conflict_flags"

    id = Column(String, primary_key=True, default=gen_id)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    kind = Column(String, nullable=False)  # allergy_conflict | dosage_conflict | missing_info | stale_followup
    severity = Column(String, nullable=False)  # high | medium | low
    description = Column(Text, nullable=False)
    related_document_ids = Column(JSON, default=list)
    resolved = Column(Boolean, default=False)
    resolved_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    patient = relationship("Patient", back_populates="conflicts")
