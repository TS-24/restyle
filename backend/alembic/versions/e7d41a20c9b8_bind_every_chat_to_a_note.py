"""a chat is bound to a note, and a note may have a parent

Revision ID: e7d41a20c9b8
Revises: d8c25a71f3b0
Create Date: 2026-08-21

Two changes to the same idea: what a note is related to.

`chats.summary_note_id` becomes `chats.note_id`. That is not a rename for
tidiness — it is a different fact. The old column meant "the note this summary
was written into", set at the end and only if a summary happened. The new one
means "the note this conversation is about", true from the moment the
conversation exists. A note and a chat are two faces of one thing: the note is
what a finished conversation is summarised into, and the note's text is what an
unfinished one was started from.

One column rather than two, because two facts about the same relationship
eventually disagree. Unique, so a note can never end up with two threads
disagreeing about it.

Still nullable and still no backfill. Conversations from before this have no
note, and inventing one here would mean writing user-visible content from a
migration on the strength of a guess. They keep their card.

`notes.parent_id` is reserved for the hierarchy and read by nothing. Adding a
self-reference to a table this central is the expensive half of that work, so it
happens once, here, rather than later under a feature that also has to ship a UI.

The downgrade is real rather than a stub, because CI round-trips
upgrade -> downgrade -> upgrade and it is the only place a migration runs at all
(the test suite builds its schema with create_all).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7d41a20c9b8"
down_revision: Union[str, Sequence[str], None] = "d8c25a71f3b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Named rather than left to the dialect, so the downgrade drops them by name
# instead of guessing what the database called them.
UQ = "uq_chats_note_id"
# The column's own foreign key, renamed with it. The old name spells out a
# column that no longer exists, and a constraint whose name describes something
# absent is the next reader's wasted ten minutes.
FK_OLD = "fk_chats_summary_note_id_notes"
FK = "fk_chats_note_id_notes"
FK_PARENT = "fk_notes_parent_id_notes"
IX_PARENT = "ix_notes_parent_id"

# batch_alter_table on purpose: SQLite cannot ALTER a column in place, and the
# desktop build ships SQLite. On Postgres batch mode issues the direct DDL, so
# this costs nothing there.


def upgrade() -> None:
    # Two passes, not one. SQLite's batch mode recreates the table from what it
    # reflects, and a constraint added in the same pass as the rename is
    # written against a column the reflected schema does not have yet — it goes
    # missing without complaint, and only the downgrade finds out.
    with op.batch_alter_table("chats") as batch:
        batch.drop_constraint(FK_OLD, type_="foreignkey")
        batch.alter_column("summary_note_id", new_column_name="note_id")
    with op.batch_alter_table("chats") as batch:
        batch.create_foreign_key(FK, "notes", ["note_id"], ["id"])
        batch.create_unique_constraint(UQ, ["note_id"])

    with op.batch_alter_table("notes") as batch:
        batch.add_column(sa.Column("parent_id", sa.Integer(), nullable=True))
        batch.create_index(IX_PARENT, ["parent_id"])
        batch.create_foreign_key(FK_PARENT, "notes", ["parent_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("notes") as batch:
        batch.drop_constraint(FK_PARENT, type_="foreignkey")
        batch.drop_index(IX_PARENT)
        batch.drop_column("parent_id")

    with op.batch_alter_table("chats") as batch:
        batch.drop_constraint(UQ, type_="unique")
        batch.drop_constraint(FK, type_="foreignkey")
    with op.batch_alter_table("chats") as batch:
        batch.alter_column("note_id", new_column_name="summary_note_id")
    with op.batch_alter_table("chats") as batch:
        batch.create_foreign_key(FK_OLD, "notes", ["summary_note_id"], ["id"])
