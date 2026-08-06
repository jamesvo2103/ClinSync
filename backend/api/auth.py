"""Token issuing and the dependency that guards organisation-only endpoints."""
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET

bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(org_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": org_id,
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_org(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """Resolve the caller's organisation from its bearer token.

    Endpoints depending on this can trust `org["id"]`; it comes from a signed
    token rather than from the request body, so a caller cannot claim to be a
    different organisation.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise unauthorized

    org_id = payload.get("sub")
    if not org_id:
        raise unauthorized
    return {"id": org_id, "email": payload.get("email")}
