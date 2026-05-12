from typing import Optional
from datetime import datetime
from sqlmodel import SQLModel, Field


class UserFriendLink(SQLModel, table=True):
    """Many-to-many self-referencing link table for the friends feature."""
    user_id: Optional[int] = Field(
        default=None, foreign_key="user.id", primary_key=True
    )
    friend_id: Optional[int] = Field(
        default=None, foreign_key="user.id", primary_key=True
    )


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    wins: int = Field(default=0)
    losses: int = Field(default=0)
    total_match_count: int = Field(default=0)


class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    player1: str
    player2: str
    winner: str
    played_at: str = Field(default_factory=lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M"))
