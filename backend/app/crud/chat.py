"""
Chats and their turns.

Same ownership discipline as crud/note.py: `user_id` is a required argument, not
an optional filter, so a forgotten one is a TypeError rather than a query that
quietly means "any user". Every lookup goes through `get_chat`, so there is one
place where ownership is decided.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db.models import Chat, ChatMessage

# What a chat is called before anything has been said in it — the same
# placeholder a new note gets, so the two read alike in the library.
UNTITLED = "Untitled"


def create_chat(db: Session, user_id: int) -> Chat:
    """Start an empty conversation owned by this user."""
    chat = Chat(user_id=user_id, title=UNTITLED)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


def get_chat(db: Session, chat_id: int, user_id: int) -> Chat | None:
    """One of this user's chats, with its turns. None if missing or not theirs.

    The two are not distinguished, for the reason notes give: a different answer
    would confirm that a chat exists and belongs to somebody else, turning the
    id space into a directory of other people's conversations.
    """
    stmt = (
        select(Chat)
        .where(Chat.id == chat_id, Chat.user_id == user_id)
        .options(selectinload(Chat.messages))
    )
    return db.scalars(stmt).first()


def list_chats(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> list[Chat]:
    """A page of one user's chats, most recently touched first."""
    stmt = (
        select(Chat)
        .options(selectinload(Chat.messages))
        .where(Chat.user_id == user_id)
        # Same ordering as notes, and id breaks ties between rows written in the
        # same transaction.
        .order_by(Chat.updated_at.desc(), Chat.id.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(db.scalars(stmt))


def rename_chat(db: Session, chat_id: int, user_id: int, title: str) -> Chat | None:
    """Give one of this user's chats a new name. None if it is not theirs.

    `updated_at` is left alone deliberately. It orders the library by what you
    were working on, and correcting a name is not working on the conversation —
    a rename that moved a year-old chat to the head of the grid would be the
    ordering lying about what you had been doing.
    """
    chat = get_chat(db, chat_id, user_id)
    if chat is None:
        return None

    chat.title = title
    db.commit()
    db.refresh(chat)
    return chat


def delete_chat(db: Session, chat_id: int, user_id: int) -> bool:
    """Delete one of this user's chats and its turns; True if a row went."""
    chat = get_chat(db, chat_id, user_id)
    if chat is None:
        return False

    db.delete(chat)
    db.commit()
    return True


def add_exchange(db: Session, chat: Chat, question: str, answer: str) -> Chat:
    """
    Store a question and its answer together, in one transaction.

    Together on purpose. If the reader's turn were committed before the provider
    was called, a provider that refused would leave a transcript ending on an
    unanswered question — which the next request would resend and the summary
    would have to describe. The caller therefore gets the answer first and only
    then arrives here.
    """
    chat.messages.append(ChatMessage(role="user", content=question))
    chat.messages.append(ChatMessage(role="assistant", content=answer))

    if chat.title == UNTITLED:
        chat.title = title_from(question)

    # Explicitly, for the reason touch_note gives: appending to a relationship
    # does not dirty the parent's own columns, so `onupdate` would not fire and
    # the chat would never move to the head of the library.
    chat.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(chat)
    return chat


def title_from(question: str) -> str:
    """A chat's name, taken from the first thing said in it.

    Trimmed to fit the column with room to spare. Cut at a word boundary where
    there is one near the end, because a title severed mid-word reads as a bug
    rather than as an abbreviation.
    """
    text = " ".join(question.split())
    if len(text) <= 80:
        return text

    cut = text[:80]
    spaced = cut.rsplit(" ", 1)[0]
    return f"{spaced if len(spaced) > 40 else cut}…"


def store_summary(db: Session, chat: Chat, summary, note_id: int | None = None) -> Chat:
    """
    Write all three parts of the summary, or none of them.

    One assignment block and one commit: a chat with a general summary and no
    questions section is a state the schema permits and nothing should create.

    `note_id` joins the note the summary was written into, which is what the
    library shows in this conversation's place.
    """
    chat.summary_general = summary.general
    chat.summary_topics = list(summary.topics)
    chat.summary_questions = summary.questions
    chat.summary_answers = summary.answers
    chat.summary_note_id = note_id
    chat.summarized_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(chat)
    return chat
