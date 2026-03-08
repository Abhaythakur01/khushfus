from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User

from ..deps import create_access_token, get_db, hash_password, require_auth, verify_password

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    organization: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    organization: str | None
    is_admin: bool
    model_config = {"from_attributes": True}


@router.post(
    "/register",
    response_model=UserOut,
    status_code=201,
    summary="Register a new user",
    description="Create a new user account with email, password, and full name.",
)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user. Returns the created user profile."""
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        organization=data.organization,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user",
    description="Authenticate with email and password to receive a JWT access token.",
)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Validate credentials and return a JWT access token."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token)


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current user profile",
    description="Return the authenticated user's profile information.",
)
async def get_me(user: User = Depends(require_auth)):
    """Return the profile of the currently authenticated user."""
    return user
