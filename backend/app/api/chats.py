"""
AI chats: the conversation, and the summary that outlives it.

Ownership follows notes.py exactly — one `_owned_chat` helper, checked before
anything is written, and one shared 404 for "missing" and "not yours" alike.

The three refusals here are deliberately distinct, because the reader can do
something different about each:

    409  no usable key on file      → go to /settings and add one
    409  the chat is already done   → start a new one
    502  the provider would not     → try again; nothing was lost
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..crud import chat as crud_chat
from ..crud import note as crud_note
from ..crud import provider_credential as crud_credential
from ..db.database import get_db
from ..db.models import Chat, User
from ..schemas.chat import ChatMessageCreate, ChatRead, ChatSummaryRead, ChatUpdate
from ..services import conversation_summary, llm
from .deps import get_current_user

router = APIRouter(prefix="/chats", tags=["chats"])

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

NO_CREDENTIAL = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="Add a provider and API key in settings before starting a chat.",
)

# Leads every provider failure, so the first thing read is a sentence rather
# than an SDK's error repr. Check your key is the common case by a wide margin.
PROVIDER_REFUSED = "Your provider would not answer. Check the key and model in settings."

ALREADY_FINISHED = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="This conversation has been summarised and is closed. Start a new one.",
)


def _owned_chat(db: Session, chat_id: int, user: User) -> Chat:
    """This user's chat, or a 404. Called before any write, never after."""
    chat = crud_chat.get_chat(db, chat_id, user.id)
    if chat is None:
        raise NOT_FOUND
    return chat


def _credential(db: Session, user: User) -> tuple[str, str, str]:
    """
    The provider and model this account chats with, or the refusal that says
    where to get one. Which credential that is lives on the user — see
    crud/provider_credential.py's `active`.
    """
    usable = crud_credential.active(db, user)
    if usable is None:
        raise NO_CREDENTIAL
    return usable


def _read(chat: Chat) -> ChatRead:
    """A chat as the API describes it, with the summary nested when it exists.

    `summarized_at` is the single test for "finished". The four summary columns
    are written together and read together; none of them is consulted alone.
    """
    body = ChatRead.model_validate(chat)
    if chat.summarized_at is not None:
        body.summary = ChatSummaryRead(
            general=chat.summary_general or "",
            topics=chat.summary_topics or [],
            questions=chat.summary_questions or "",
            answers=chat.summary_answers or "",
            summarized_at=chat.summarized_at,
            note_id=chat.summary_note_id,
        )
    return body


@router.post("", response_model=ChatRead, status_code=status.HTTP_201_CREATED)
def create_chat(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> ChatRead:
    """Start an empty conversation.

    No credential check: a chat can be started before a key exists, and the
    refusal belongs on the first thing said rather than on the button that opens
    the page. Getting that backwards would mean the reader could not even see
    the surface they are being told to configure.
    """
    return _read(crud_chat.create_chat(db, user_id=current_user.id))


@router.get("", response_model=list[ChatRead])
def list_chats(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatRead]:
    return [
        _read(chat)
        for chat in crud_chat.list_chats(db, user_id=current_user.id, skip=skip, limit=limit)
    ]


@router.get("/{chat_id}", response_model=ChatRead)
def get_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatRead:
    return _read(_owned_chat(db, chat_id, current_user))


@router.patch("/{chat_id}", response_model=ChatRead)
def rename_chat(
    chat_id: int,
    payload: ChatUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatRead:
    """
    Correct a conversation's name.

    A chat is named from the first thing said in it, which is a guess, and that
    name is the whole of what stands for it in the library. So it is editable,
    like a note's.

    Deliberately not refused for a finished chat, unlike sending: renaming is
    not saying anything, and a summarised conversation is the one whose name you
    are most likely to want to fix, because it is the one you will come back to.
    """
    chat = crud_chat.rename_chat(db, chat_id, current_user.id, payload.title)
    if chat is None:
        raise NOT_FOUND
    return _read(chat)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not crud_chat.delete_chat(db, chat_id, current_user.id):
        raise NOT_FOUND


@router.post("/{chat_id}/messages", response_model=ChatRead)
def send_message(
    chat_id: int,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatRead:
    """
    Say something, and get the reply back with it.

    The whole chat comes back rather than just the new turns: the caller is
    rendering a transcript, and one shape for "here is the conversation now" is
    fewer states for it to be in than a delta the client has to splice.

    Order matters here. The reader's turn is *not* stored before the provider
    answers — a refusal would otherwise leave a question hanging in the
    transcript, which the next request would resend and the summary would have
    to describe. Both turns land together or neither does.
    """
    chat = _owned_chat(db, chat_id, current_user)
    if chat.summarized_at is not None:
        raise ALREADY_FINISHED

    provider, api_key, model = _credential(db, current_user)
    turns = [(m.role, m.content) for m in chat.messages] + [("user", payload.content)]

    try:
        answer = llm.reply(provider, api_key, model, turns)
    except llm.ProviderError as error:
        # A plain sentence first, then the provider's own words. Those words are
        # the only thing that distinguishes a wrong key from a rate limit from a
        # model name that no longer exists, so they are kept — but an SDK's raw
        # error repr is not a sentence, and it is what the reader sees first.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{PROVIDER_REFUSED} {llm.scrub(str(error), api_key)}",
        )
    except llm.UnknownProvider:
        # A provider that was in the registry when the key was saved and is not
        # now. Same remedy as no key at all: pick one that exists.
        raise NO_CREDENTIAL

    return _read(crud_chat.add_exchange(db, chat, payload.content, answer))


@router.post("/{chat_id}/summarize", response_model=ChatRead)
def summarize_chat(
    chat_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatRead:
    """
    Finish the conversation and write what it was about, in three parts.

    Summarising again is allowed, and is the retry path when the first attempt
    produced something poor. Adding turns afterwards is not — see
    ALREADY_FINISHED on the route above.
    """
    chat = _owned_chat(db, chat_id, current_user)
    if not chat.messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="There is nothing in this conversation to summarise yet.",
        )

    provider, api_key, model = _credential(db, current_user)
    turns = [(m.role, m.content) for m in chat.messages]
    summary = conversation_summary.summarize(provider, api_key, model, turns)

    if summary is None:
        # Nothing was written, so the transcript is intact and finishing can be
        # tried again. That is why the summariser returns None instead of
        # raising: a bad minute at the provider must not cost the conversation.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The provider could not summarise this conversation. Try again.",
        )

    # What the reader keeps is a note, not a card: the summary becomes the text
    # of a real one so it can be corrected, added to and pinned like anything
    # else they wrote. The transcript stays where it is.
    content = conversation_summary.as_note(summary)
    existing = (
        crud_note.get_note(db, chat.summary_note_id, current_user.id)
        if chat.summary_note_id is not None
        else None
    )
    if existing is not None:
        # Re-summarising is the retry path for a poor first attempt, so it
        # corrects the note already written. A second note would leave the
        # library holding two for one conversation — one of them the summary
        # the reader was retrying to be rid of.
        crud_note.update_note(
            db, existing.id, current_user.id, title=chat.title, content=content
        )
        note_id = existing.id
    else:
        note_id = crud_note.create_note(
            db, user_id=current_user.id, title=chat.title, content=content
        ).id

    return _read(crud_chat.store_summary(db, chat, summary, note_id))
