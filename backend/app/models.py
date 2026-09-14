import re

from pydantic import BaseModel, field_validator

ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class ChallengeRequest(BaseModel):
    pubkey: str


class ChallengeResponse(BaseModel):
    challenge: str
    expires_at: int


class VerifyRequest(BaseModel):
    pubkey: str
    challenge: str
    signature: str


class VerifyResponse(BaseModel):
    token: str
    expires_at: int


class MessageIn(BaseModel):
    id: str
    to: str
    ts: int
    nonce: str
    ct: str
    sig: str

    @field_validator("id")
    @classmethod
    def _valid_id(cls, v: str) -> str:
        if not ID_RE.match(v):
            raise ValueError("id must match [A-Za-z0-9_-]{1,64}")
        return v
class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: dict


class PushSubscribeIn(BaseModel):
    subscription: PushSubscriptionIn
class ProfileIn(BaseModel):
    name: str
    updated_at: int
    sig: str

    @field_validator("name")
    @classmethod
    def _name_len(cls, v: str) -> str:
        v = v.strip()
        if not (1 <= len(v) <= 32):
            raise ValueError("name must be 1..32 chars")
        return v

