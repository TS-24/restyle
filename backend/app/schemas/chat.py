from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

# Stripped *before* the length is checked, so a message of nothing but spaces
# is refused rather than stored as an empty turn the model then has to answer.
Content = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)
]


# Trimmed and length-checked the same way `Content` is, so a title of nothing
# but spaces is refused rather than stored as a blank name in the library. The
# ceiling matches the column, and `crud.chat.title_from` already cuts the
# auto-derived one well inside it.
Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]


class ChatMessageCreate(BaseModel):
    content: Content


class ChatUpdate(BaseModel):
    """What can be changed about a conversation from outside it: its name.

    Not its turns — those are appended by talking — and not its summary, which
    is written once when the chat is finished.
    """

    title: Title


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime


class ChatSummaryRead(BaseModel):
    """
    The three parts, as one object rather than four sibling fields.

    Nesting is what lets the frontend ask "is this chat finished" by testing one
    thing. Four nullable fields on the chat would let three of them be present
    and one absent, which is a state the writer refuses to create and the
    reader should not have to handle.
    """

    general: str
    topics: list[str]
    questions: str
    answers: str
    summarized_at: datetime
    # Which note this summary became. Null only for conversations finished
    # before that existed.
    note_id: int | None = None


class ChatRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageRead] = []
    # Null until the chat is finished. This is what "finished" means to a
    # caller — there is no status field to consult instead.
    summary: ChatSummaryRead | None = None
