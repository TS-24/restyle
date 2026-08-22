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
from ..schemas.chat import ChatCreate, ChatMessageCreate, ChatRead, ChatSummaryRead
from ..services import conversation_summary, llm
from .deps import get_current_user

router = APIRouter(prefix="/chats", tags=["chats"])

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

# Same shape and same reason as NOT_FOUND: a different answer for "that note is
# somebody else's" would turn the id space into a directory of other people's
# notes.
NOTE_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND, detail="Note not found"
)

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
            note_id=chat.note_id,
        )
    return body


def _seed_from(note) -> str | None:
    """A note as the context its conversation starts from.

    The title is included because it is often the only statement of the subject
    — a note called "Tides" whose body is three fragments says more with its
    name than without it. A note with nothing in it seeds nothing: an empty
    message is not context, and the model would be answering a blank page.
    """
    parts = [part for part in (note.title, note.content) if part and part.strip()]
    if not parts or parts == [crud_chat.UNTITLED]:
        return None
    body = "\n\n".join(parts)
    return f"The reader started this conversation from a note of theirs:\n\n{body}"


@router.post("", response_model=ChatRead, status_code=status.HTTP_201_CREATED)
def create_chat(
    payload: ChatCreate | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatRead:
    """Start a conversation, bound to a note.

    Every chat has a note. This is the one place chats are born, so it is the
    one place that invariant can be enforced. Started from the library, a note
    is made for it; started from a note, that note is the one.

    Starting from a note a second time is not starting anything: the binding is
    one-to-one, so the conversation that already exists is handed back
    unchanged. That is what makes the note's text *context* rather than a
    preamble repeated on every visit — it was injected once, when there was no
    conversation to inject it into.

    No credential check: a chat can be started before a key exists, and the
    refusal belongs on the first thing said rather than on the button that opens
    the page. Getting that backwards would mean the reader could not even see
    the surface they are being told to configure.
    """
    note_id = payload.note_id if payload else None
    if note_id is None:
        # Nothing to be about yet, so it gets somewhere to end up. Untitled is
        # the placeholder a new note gets from the library too.
        note = crud_note.create_note(
            db, user_id=current_user.id, title=crud_chat.UNTITLED, content=""
        )
        return _read(crud_chat.create_chat(db, current_user.id, note.id))

    note = crud_note.get_note(db, note_id, current_user.id)
    if note is None:
        raise NOTE_NOT_FOUND

    existing = crud_chat.chat_for_note(db, note.id, current_user.id)
    if existing is not None:
        return _read(existing)

    return _read(
        crud_chat.create_chat(db, current_user.id, note.id, seed=_seed_from(note))
    )


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


def _named_by(summary, note) -> str:
    """The note's title after a summary: the suggestion, or the one it has.

    A name the reader typed is theirs and is not overwritten by a model's guess
    — even a better one. Only a note still carrying a placeholder takes the
    suggestion, which is exactly the case a chat started from the library
    produces: a note called "Untitled" with the conversation's text in it.
    """
    suggested = (summary.title or "").strip()
    if not suggested:
        return note.title
    return suggested if note.title.strip() in ("", crud_chat.UNTITLED) else note.title


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
    #
    # The note is the one this conversation has been bound to all along, so
    # there is nothing to decide here and no way to write a second. Only a chat
    # from before the binding has none, and those are left alone rather than
    # backfilled.
    note = (
        crud_note.get_note(db, chat.note_id, current_user.id)
        if chat.note_id is not None
        else None
    )
    if note is not None:
        crud_note.update_note(
            db,
            note.id,
            current_user.id,
            title=_named_by(summary, note),
            content=conversation_summary.as_note(summary),
        )

    return _read(crud_chat.store_summary(db, chat, summary))
