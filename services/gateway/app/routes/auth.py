from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User

from ..deps import create_access_token, get_db, hash_password, require_auth, verify_password

router = APIRouter()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    organization: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    is_active: bool = True
    is_superadmin: bool = False
    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    avatar_url: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=201,
    summary="Register a new user",
    description="Create a new user account with email, password, and full name.",
    responses={409: {"description": "Email already registered"}},
)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user. Returns the user profile and access token."""
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Authenticate user",
    description="Authenticate with email and password to receive a JWT access token.",
)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Validate credentials and return a JWT access token and user profile."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id)})
    return AuthResponse(access_token=token, user=UserOut.model_validate(user))


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current user profile",
    description="Return the authenticated user's profile information.",
)
async def get_me(user: User = Depends(require_auth)):
    """Return the profile of the currently authenticated user."""
    return user


@router.patch(
    "/profile",
    response_model=UserOut,
    summary="Update user profile",
    description="Update the authenticated user's display name or avatar URL.",
)
async def update_profile(
    data: UpdateProfileRequest,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Update mutable profile fields for the authenticated user."""
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.avatar_url is not None:
        user.avatar_url = data.avatar_url  # type: ignore[attr-defined]
    await db.commit()
    await db.refresh(user)
    return user


@router.post(
    "/change-password",
    status_code=204,
    summary="Change user password",
    description="Verify the current password then replace it with a new one.",
    responses={
        400: {"description": "Current password is incorrect"},
    },
)
async def change_password(
    data: ChangePasswordRequest,
    user: User = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Verify the current password and set a new one for the authenticated user."""
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    user.hashed_password = hash_password(data.new_password)
    await db.commit()
