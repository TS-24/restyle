from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

# Stripped *before* the length is checked, so a message of nothing but spaces
# is refused rather than stored as an empty turn the model then has to answer.
Content = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000)
]


class ChatMessageCreate(BaseModel):
    content: Content


class ChatCreate(BaseModel):
    """Which note the conversation is about, when the reader started from one.

    Omitted when the conversation is started from the library instead — the
    route makes a note for it, because a chat without one is a state this app
    does not have.
    """

    note_id: int | None = None


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    # "system" is the note's text as it stood when the conversation began. It is
    # a turn nobody took, which is why it is a role of its own rather than a
    # user message: the transcript shows it as where the conversation started,
    # not as something the reader said.
    role: Literal["user", "assistant", "system"]
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
    # Kept alongside `ChatRead.note_id`, which is now where the binding lives.
    # A client mid-deploy may still be reading it, and the two are the same
    # number — the note a summary is written into is the note the conversation
    # was bound to all along.
    note_id: int | None = None


class ChatRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    created_at: datetime
    updated_at: datetime
    # The note this conversation is two faces of. Set from the moment the chat
    # exists; null only for conversations from before the binding, which are not
    # backfilled.
    note_id: int | None = None
    messages: list[ChatMessageRead] = []
    # Null until the chat is finished. This is what "finished" means to a
    # caller — there is no status field to consult instead.
    summary: ChatSummaryRead | None = None
