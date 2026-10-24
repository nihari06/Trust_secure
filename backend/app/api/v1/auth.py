from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models import User, AuditOutcome, UserRole
from app.core.security import verify_password, create_access_token, get_password_hash
from app.core.deps import get_current_user
from app.core.config import settings
from app.schemas.schemas import TokenResponse, UserOut, UserCreate
from app.services import audit

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        audit.record_from_request(
            db,
            request,
            action="LOGIN_FAILED",
            outcome=AuditOutcome.failure,
            actor_email=form_data.username,
            details="Invalid credentials.",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    if not user.is_active:
        audit.record_from_request(
            db,
            request,
            action="LOGIN_DENIED",
            outcome=AuditOutcome.denied,
            actor=user,
            details="Account is inactive.",
        )
        raise HTTPException(status_code=403, detail="Account is inactive.")

    token = create_access_token({"sub": str(user.id), "ver": user.token_version or 1})
    audit.record_from_request(
        db,
        request,
        action="LOGIN_SUCCESS",
        outcome=AuditOutcome.success,
        actor=user,
    )
    return TokenResponse(access_token=token)


@router.post("/logout")
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audit.record_from_request(
        db,
        request,
        action="LOGOUT",
        outcome=AuditOutcome.success,
        actor=current_user,
    )
    return {"detail": "Logged out successfully."}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    body: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
):
    if not settings.ALLOW_PUBLIC_REGISTRATION:
        audit.record_from_request(
            db,
            request,
            action="REGISTRATION_DENIED",
            outcome=AuditOutcome.denied,
            actor_email=body.email,
            details="Public self-registration is disabled in company mode.",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public self-registration is disabled for this organization. Accounts must be provisioned by an administrator.",
        )

    # Reject attempts to self-assign Admin, Owner, or other privileged roles via public registration
    if body.role and body.role not in (UserRole.viewer,):
        audit.record_from_request(
            db,
            request,
            action="REGISTRATION_DENIED",
            outcome=AuditOutcome.denied,
            actor_email=body.email,
            details="Attempted to self-assign privileged role during registration.",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-assigning privileged roles is forbidden. New accounts are assigned the viewer role.",
        )

    # Validate password confirmation if provided
    if body.confirm_password and body.password != body.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match.",
        )

    existing = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered.",
        )

    # Assign safe default role: Viewer (can upload and manage own documents, zero privileged access)
    assigned_role = UserRole.viewer

    user = User(
        email=body.email.strip().lower(),
        full_name=body.full_name.strip(),
        hashed_password=get_password_hash(body.password),
        role=assigned_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    audit.record_from_request(
        db,
        request,
        action="USER_REGISTERED",
        outcome=AuditOutcome.success,
        actor=user,
        resource_type="user",
        resource_id=str(user.id),
        resource_name=user.email,
        details=f"Self-registered account with safe default role '{user.role.value}'",
    )
    return user
