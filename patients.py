from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/patients", tags=["patients"])


def _to_out(db: Session, p: models.Patient) -> schemas.PatientOut:
    doc_count = db.query(models.Document).filter(models.Document.patient_id == p.id).count()
    open_conflicts = (
        db.query(models.ConflictFlag)
        .filter(models.ConflictFlag.patient_id == p.id, models.ConflictFlag.resolved == False)  # noqa: E712
        .count()
    )
    out = schemas.PatientOut.model_validate(p)
    out.document_count = doc_count
    out.open_conflict_count = open_conflicts
    return out


@router.get("", response_model=list[schemas.PatientOut])
def list_patients(
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Patient)
    if search:
        like = f"%{search}%"
        q = q.filter((models.Patient.full_name.ilike(like)) | (models.Patient.mrn.ilike(like)))
    patients = q.order_by(models.Patient.created_at.desc()).all()
    return [_to_out(db, p) for p in patients]


@router.post("", response_model=schemas.PatientOut, status_code=201)
def create_patient(
    payload: schemas.PatientCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = db.query(models.Patient).filter(models.Patient.mrn == payload.mrn).first()
    if existing:
        raise HTTPException(status_code=400, detail="A patient with this MRN already exists.")

    patient = models.Patient(
        mrn=payload.mrn,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        gender=payload.gender,
        known_allergies=payload.known_allergies,
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return _to_out(db, patient)


@router.get("/{patient_id}", response_model=schemas.PatientOut)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return _to_out(db, patient)


@router.patch("/{patient_id}", response_model=schemas.PatientOut)
def update_patient(
    patient_id: str,
    payload: schemas.PatientUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)

    db.commit()
    db.refresh(patient)

    # Allergy list changed -> re-check for allergy conflicts against existing prescriptions
    from ..services.conflicts import recompute_conflicts
    recompute_conflicts(db, patient)
    db.commit()

    return _to_out(db, patient)


@router.delete("/{patient_id}", status_code=204)
def delete_patient(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(patient)
    db.commit()
    return None
