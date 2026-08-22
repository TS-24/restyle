"""a finished chat leaves a note behind

Revision ID: d8c25a71f3b0
Revises: a9d3c17b52f4
Create Date: 2026-08-20

Finishing a conversation used to leave a summary readable only on its card:
three paragraphs you could not correct, add to, or pin. It now writes the
summary into a real note, and the library shows that note in the chat's place.

This column is the join. It also does a second job: re-summarising is the retry
path for a poor first attempt, and without a record of which note was written
the retry would add another one — leaving two notes for one conversation, one of
them the summary the reader was retrying to be rid of.

Nullable, and no backfill. Conversations summarised before this have no note,
and inventing one here would mean writing user-visible content from a migration
on the strength of a guess about how it should read. They keep their card
instead: the frontend tests `note_id`, not `summary`, for exactly that reason.

The downgrade is real rather than a stub, because CI round-trips
upgrade -> downgrade -> upgrade and it is the only place a migration runs at all
(the test suite builds its schema with create_all).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8c25a71f3b0"
down_revision: Union[str, Sequence[str], None] = "a9d3c17b52f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Named rather than left to the dialect, so the downgrade can drop it by name
# instead of guessing what the database called it.
FK = "fk_chats_summary_note_id_notes"


# batch_alter_table because SQLite cannot ALTER a constraint at all, and the
# desktop build ships SQLite. Written without it first, which nothing caught:
# the suite builds its schema with create_all and CI only runs migrations
# against Postgres, so `alembic upgrade head` on SQLite failed here and nowhere
# else. On Postgres batch mode issues the same direct DDL, so this changes
# nothing there.


def upgrade() -> None:
    with op.batch_alter_table("chats") as batch:
        batch.add_column(sa.Column("summary_note_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(FK, "notes", ["summary_note_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("chats") as batch:
        batch.drop_constraint(FK, type_="foreignkey")
        batch.drop_column("summary_note_id")
