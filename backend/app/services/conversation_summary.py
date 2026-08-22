"""
What a finished conversation was about, in three parts.

A chat is a long thing you will not reread. What survives it is a short account
of what was covered, what you kept asking, and what you were told — so the
summary is written once, when the chat is finished, and it is what the chat's
card in the library shows afterwards.

Three parts, because they answer three different questions:

    general + topics   what the conversation was about at all
    questions          what *you* kept circling back to
    answers            what the replies actually concentrated on

Parts two and three only exist because the transcript says who spoke. A
summariser handed an unlabelled block of text cannot separate the asking from
the answering, so `transcript` below labels every turn and that labelling is
what the two prompts point at.

The shape comes back through `with_structured_output`, which is the one place
LangChain genuinely earns its keep here: it turns each provider's tool-calling
into the same typed object, so Anthropic and OpenAI need no separate parsing and
there is no JSON to coax out of prose.

Every failure returns None, the same contract as `ranker.py`. A chat that could
not be summarised keeps its transcript and can be finished again later.
"""

from typing import Sequence

from pydantic import BaseModel, Field, ValidationError

from . import llm

INSTRUCTION = (
    "Below is a finished conversation between a reader and an assistant. "
    "Give it a short title, then summarise it in three parts:\n"
    "1. What the conversation was about overall, plus the distinct topics it "
    "covered.\n"
    "2. The main focus of the reader's questions — what they were trying to "
    "find out, taken across all of their turns.\n"
    "3. The main focus of the answers — what the assistant's replies actually "
    "concentrated on.\n"
    "Write parts 1 to 3 as prose of a few sentences each. Describe the "
    "conversation; do not continue it."
)


class ConversationSummary(BaseModel):
    """The three parts. Field docs are the prompt the provider actually sees."""

    title: str = Field(
        description="A short name for the conversation, five words at most."
    )
    general: str = Field(description="What the conversation was about overall.")
    topics: list[str] = Field(description="The distinct topics it covered.")
    questions: str = Field(
        description="The main focus of the reader's questions across all their turns."
    )
    answers: str = Field(
        description="The main focus of the assistant's answers."
    )


def transcript(turns: Sequence[tuple[str, str]]) -> str:
    """The conversation with its speakers named, in order.

    "You" rather than "User" because the reader is the one being described back
    to themselves, and the labels are what parts two and three are pointed at.
    """
    lines = []
    for role, content in turns:
        if role == "user":
            lines.append(f"You: {content}")
        elif role == "assistant":
            lines.append(f"Assistant: {content}")
        elif role == "system":
            # What the conversation was started from — the note it belongs to.
            # Labelled rather than dropped: it is often the only statement of
            # the subject, and a summary that has not seen it describes the
            # replies without knowing what they were replying about.
            lines.append(f"From your note: {content}")
        else:
            raise ValueError(f"Unknown role: {role}")
    return "\n\n".join(lines)


def summarize(
    provider: str, api_key: str, model: str | None, turns: Sequence[tuple[str, str]]
) -> ConversationSummary | None:
    """The three parts, or None when they cannot be had.

    None rather than an exception so a provider having a bad minute costs the
    summary and not the conversation: the route refuses, and finishing the chat
    can be tried again.
    """
    if not turns:
        return None

    try:
        structured = llm.chat_model(provider, api_key, model).with_structured_output(
            ConversationSummary
        )
        answer = structured.invoke(f"{INSTRUCTION}\n\n{transcript(turns)}")
    except Exception:
        # No key, no network, a refusal, a model that cannot do tool calls —
        # all the same answer, because the remedy is the same: try later.
        return None

    if isinstance(answer, ConversationSummary):
        return answer
    # Some integrations hand back the parsed dict rather than the model. A
    # partial one is not a summary — three parts is the whole contract — so it
    # fails the same way a refusal does rather than becoming a third of one.
    try:
        return ConversationSummary.model_validate(answer)
    except (ValidationError, TypeError):
        return None


# The headings a summary becomes, paired with the field each one introduces.
# Same words the chat surface used when it showed the summary in place, so a
# conversation reads the same before and after it is finished.
NOTE_SECTIONS = (
    ("What this was about", "general"),
    ("What you were asking", "questions"),
    ("What the answers covered", "answers"),
)


def as_note(summary: ConversationSummary) -> str:
    """
    The summary as the text of a note.

    Finishing a conversation leaves a note behind rather than a card that only
    looks like one, so the three parts have to survive as prose the reader can
    edit. A heading is a line of text with a blank line under it: the note body
    is an unstyled textarea and there is no markdown renderer to make it more.

    Topics are appended only when the summariser found any — an empty heading
    would be the note claiming a section it does not have.
    """
    parts = [
        f"{heading}\n\n{getattr(summary, field)}" for heading, field in NOTE_SECTIONS
    ]
    if summary.topics:
        parts.append("Topics\n\n" + ", ".join(summary.topics))
    return "\n\n".join(parts)
