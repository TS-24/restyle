from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db.models import Chat, Note

# A note's owner is fixed at creation time, so user_id is intentionally not updatable.
# archived_at is missing on purpose: update_note skips None values, so the one
# thing restoring has to do — clear the column — could never travel through it.
UPDATABLE_FIELDS = {"title", "content", "is_pinned"}


def is_blank(note: Note) -> bool:
    """Nothing was ever written here: no title, no body.

    Deliberately no special case for the string "Untitled". That used to be
    written into the column as a real title, so notes still carrying it are
    named notes as far as this is concerned — and a reader who types the word
    has named theirs. New notes hold "", which is what makes this answerable.
    """
    return not note.title.strip() and not (note.content or "").strip()


# Every lookup below takes the owner as a required argument rather than an
# optional filter. That is deliberate: an optional one defaults to "any user"
# when a caller forgets it, which is silent and wrong, while a required one
# makes the same mistake a TypeError the first time the tests run.


def create_note(db: Session, user_id: int, title: str, content: str | None = None) -> Note:
    """Insert a new note owned by the given user and return it."""
    note = Note(user_id=user_id, title=title, content=content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_note(db: Session, note_id: int, user_id: int) -> Note | None:
    """Fetch one of this user's notes. None if it is missing or is not theirs.

    Those two cases are not distinguished on purpose: the caller turns both
    into the same 404, because a different answer would confirm that a note
    exists and belongs to someone else.
    """
    stmt = (
        select(Note)
        .where(Note.id == note_id, Note.user_id == user_id)
    )
    return db.scalars(stmt).first()


def list_notes(
    db: Session,
    user_id: int,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
    archived: bool = False,
) -> list[Note]:
    """Return a page of one user's notes, optionally narrowed by a title search.

    The library and the archive are the same list under two filters, which is
    why this is a flag rather than a second function: a search that reached
    into the archive, or a listing that quietly included it, would be the same
    bug in opposite directions.
    """
    stmt = select(Note).where(Note.user_id == user_id)
    if search:
        stmt = stmt.where(Note.title.ilike(f"%{search}%"))

    if archived:
        # Most recently put away first — the one you are most likely to have
        # changed your mind about.
        stmt = stmt.where(Note.archived_at.is_not(None)).order_by(
            Note.archived_at.desc(), Note.id.desc()
        )
    else:
        # Most recently touched first, so the head of the list is the note the
        # user was last in. id breaks ties between rows written in the same
        # transaction.
        stmt = stmt.where(Note.archived_at.is_(None)).order_by(
            Note.updated_at.desc(), Note.id.desc()
        )

    stmt = stmt.offset(skip).limit(limit)
    return list(db.scalars(stmt))


def update_note(db: Session, note_id: int, user_id: int, **fields) -> Note | None:
    """Update the given fields on one of this user's notes."""
    note = get_note(db, note_id, user_id)
    if note is None:
        return None

    for key, value in fields.items():
        if key in UPDATABLE_FIELDS and value is not None:
            setattr(note, key, value)

    db.commit()
    db.refresh(note)
    return note


def touch_note(db: Session, note_id: int, user_id: int) -> Note | None:
    """Mark a note as just-used without changing its content.

    Opening a note counts as an update for "where you left off", but an empty
    PATCH changes no attributes, so SQLAlchemy would not issue an UPDATE and
    `onupdate` would never fire. Setting the column explicitly forces it.
    """
    note = get_note(db, note_id, user_id)
    if note is None:
        return None

    note.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(note)
    return note


def archive_note(db: Session, note_id: int, user_id: int) -> Note | None:
    """Put one of this user's notes away. Idempotent: re-archiving does not
    move the timestamp, so the archive keeps the order it was filled in."""
    note = get_note(db, note_id, user_id)
    if note is None:
        return None

    if note.archived_at is None:
        note.archived_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(note)
    return note


def unarchive_note(db: Session, note_id: int, user_id: int) -> Note | None:
    """Bring one of this user's notes back into the library."""
    note = get_note(db, note_id, user_id)
    if note is None:
        return None

    note.archived_at = None
    db.commit()
    db.refresh(note)
    return note


def close_note(db: Session, note: Note) -> bool:
    """The reader has left this note. Delete it if it was never written in.

    Takes the note rather than an id and an owner because the caller has
    already proved ownership to get one — see api/notes.py::_owned_note.

    Leaving is the moment to judge, not arriving: a note is created blank and
    opened, so deleting on creation would delete what "New note" just made.

    Three things have to hold, and the last two are the interesting ones:

    - it is blank;
    - it is not the only note left, because the app has no empty state —
      web/app/routes/workspace.tsx creates a note when the list comes back
      empty, so deleting into that just makes it make another;
    - its conversation, if it has one, never got anywhere. A transcript is the
      note's content even when the body is empty.
    """
    if not is_blank(note):
        return False

    remaining = db.scalar(
        select(func.count())
        .select_from(Note)
        .where(
            Note.user_id == note.user_id,
            Note.id != note.id,
            Note.archived_at.is_(None),
        )
    )
    if not remaining:
        return False

    chat = _bound_chat(db, note)
    if chat is not None and chat.messages:
        return False

    _delete(db, note, chat)
    return True


def delete_note(db: Session, note_id: int, user_id: int) -> bool:
    """Delete one of this user's notes; return True if a row was removed."""
    note = get_note(db, note_id, user_id)
    if note is None:
        return False

    _delete(db, note, _bound_chat(db, note))
    return True


def _bound_chat(db: Session, note: Note) -> Chat | None:
    """The conversation this note is two faces of, if it has one.

    Scoped by owner as well as by note, for the reason every lookup here is:
    an unscoped filter is one forgotten argument away from meaning "any user".
    """
    stmt = select(Chat).where(Chat.note_id == note.id, Chat.user_id == note.user_id)
    return db.scalars(stmt).first()


def _delete(db: Session, note: Note, chat: Chat | None) -> None:
    """Remove a note, and the conversation bound to it.

    The chat has to go first and has to go at all. `Chat.note_id` is a foreign
    key with no `ondelete` and `Note` has no relationship back, so deleting the
    note alone raised an IntegrityError on Postgres — the Trash button on any
    note you had talked about.

    Releasing the chat instead of deleting it is not the fix. The library holds
    notes only and a conversation is reached by opening the note it belongs to,
    so a chat with no note is a chat with no way in: exactly the unreachable
    row migration f3a90c5d61b7 was written to get rid of.
    """
    if chat is not None:
        db.delete(chat)
    db.delete(note)
    db.commit()
