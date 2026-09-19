import datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, EmailStr, Field


# ---------- Auth ----------
class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8)
    role: str = "clinician"


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Patients ----------
class PatientCreate(BaseModel):
    mrn: str
    full_name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    known_allergies: List[str] = []
    notes: Optional[str] = None


class PatientUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    known_allergies: Optional[List[str]] = None
    notes: Optional[str] = None


class PatientOut(BaseModel):
    id: str
    mrn: str
    full_name: str
    date_of_birth: Optional[str]
    gender: Optional[str]
    known_allergies: List[str]
    notes: Optional[str]
    created_at: datetime.datetime
    document_count: int = 0
    open_conflict_count: int = 0

    class Config:
        from_attributes = True


# ---------- Documents ----------
class DocumentOut(BaseModel):
    id: str
    patient_id: str
    doc_type: str
    original_filename: str
    document_date: Optional[str]
    date_source: str
    structured_data: Dict[str, Any]
    extraction_status: str
    extraction_notes: Optional[str]
    uploaded_at: datetime.datetime

    class Config:
        from_attributes = True


class DocumentDetailOut(DocumentOut):
    raw_text: Optional[str]


# ---------- Timeline ----------
class TimelineEvent(BaseModel):
    date: Optional[str]
    date_is_estimated: bool
    document_id: str
    doc_type: str
    title: str
    summary: str
    structured_data: Dict[str, Any]


# ---------- Conflicts ----------
class ConflictOut(BaseModel):
    id: str
    patient_id: str
    kind: str
    severity: str
    description: str
    related_document_ids: List[str]
    resolved: bool
    resolved_note: Optional[str]
    created_at: datetime.datetime

    class Config:
        from_attributes = True


class ConflictResolve(BaseModel):
    resolved_note: Optional[str] = None
