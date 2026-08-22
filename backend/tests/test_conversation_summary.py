"""
Tests for the three-part conversation summary
(app/services/conversation_summary.py).

The model is never called. What is pinned is the shape of the request and the
shape of the refusal: the transcript has to say who said what, or "the focus of
the questions" and "the focus of the answers" are the same question asked twice;
and a provider that will not answer has to leave the chat summarisable later
rather than half-written.
"""

import pytest

from app.services import conversation_summary as summary

TURNS = [
    ("user", "how do I stop mixing up affect and effect?"),
    ("assistant", "affect is usually the verb, effect usually the noun."),
    ("user", "what about 'effect change'?"),
    ("assistant", "that is the rarer verb sense of effect, meaning to bring about."),
]

ANSWER = summary.ConversationSummary(
    title="Affect and effect",
    general="A conversation about two commonly confused words.",
    topics=["affect vs effect", "verb and noun senses"],
    questions="The reader asked how to tell two similar words apart.",
    answers="The replies gave the usual parts of speech and one exception.",
)


class TestTheTranscriptItSends:
    def test_it_names_the_note_a_conversation_started_from(self):
        """
        A summariser that has not seen the note describes the replies without
        knowing what they were replying about — and for a chat opened from a
        note, that context is often the only statement of the subject.
        """
        text = summary.transcript([("system", "The moon pulls."), *TURNS])

        assert "From your note: The moon pulls." in text

    def test_it_labels_both_speakers(self):
        transcript = summary.transcript(TURNS)

        # Not "does it contain the text" — whether the two sides are
        # distinguishable is the whole basis of parts two and three.
        assert "affect and effect" in transcript
        assert transcript.count("You:") == 2
        assert transcript.count("Assistant:") == 2

    def test_it_keeps_the_turns_in_order(self):
        transcript = summary.transcript(TURNS)

        assert transcript.index("affect and effect") < transcript.index("effect change")

    def test_an_unknown_role_is_refused(self):
        with pytest.raises(ValueError):
            summary.transcript([("narrator", "meanwhile")])


class TestTheAnswer:
    def test_it_returns_all_three_parts(self, monkeypatch):
        _answering(monkeypatch, ANSWER)

        got = summary.summarize("anthropic", "k", None, TURNS)

        assert got.general == ANSWER.general
        assert got.topics == ANSWER.topics
        assert got.questions == ANSWER.questions
        assert got.answers == ANSWER.answers

    def test_it_asks_for_the_schema_it_wants_back(self, monkeypatch):
        asked = {}

        class Model:
            def with_structured_output(self, schema):
                asked["schema"] = schema
                return _Invoker(ANSWER)

        monkeypatch.setattr(summary.llm, "chat_model", lambda *a: Model())
        summary.summarize("anthropic", "k", None, TURNS)

        assert asked["schema"] is summary.ConversationSummary

    def test_a_dict_answer_is_coerced(self, monkeypatch):
        # Not every integration returns the pydantic object; some hand back the
        # parsed dict. Both have to end up as one type at the call site.
        _answering(monkeypatch, ANSWER.model_dump())

        assert summary.summarize("anthropic", "k", None, TURNS).topics == ANSWER.topics


class TestWhenItCannot:
    def test_a_provider_failure_answers_none(self, monkeypatch):
        """
        None rather than an exception, the same contract as ranker.py: the
        route turns it into a refusal the reader can retry, and the transcript
        is untouched.
        """

        class Model:
            def with_structured_output(self, schema):
                raise RuntimeError("503 model overloaded")

        monkeypatch.setattr(summary.llm, "chat_model", lambda *a: Model())

        assert summary.summarize("anthropic", "k", None, TURNS) is None

    def test_an_unusable_answer_is_none_rather_than_a_half_summary(self, monkeypatch):
        _answering(monkeypatch, {"general": "only the first part"})

        assert summary.summarize("anthropic", "k", None, TURNS) is None

    def test_an_empty_conversation_has_nothing_to_summarise(self, monkeypatch):
        _answering(monkeypatch, ANSWER)

        assert summary.summarize("anthropic", "k", None, []) is None


class _Invoker:
    def __init__(self, answer):
        self.answer = answer

    def invoke(self, messages):
        return self.answer


def _answering(monkeypatch, answer):
    """A chat model whose structured output is `answer`."""

    class Model:
        def with_structured_output(self, schema):
            return _Invoker(answer)

    monkeypatch.setattr(summary.llm, "chat_model", lambda *a: Model())


class TestAsNote:
    """
    The summary, rendered as the text of a note.

    A finished conversation is kept as a note you can edit, so the three parts
    have to survive as prose rather than as fields. The note body is an
    unstyled textarea with no markdown renderer, so a heading here is a line of
    text with a blank line under it — nothing more is available.
    """

    def _summary(self, **over):
        base = dict(
            title="Gerunds",
            general="A conversation about gerunds.",
            topics=["gerunds", "verb forms"],
            questions="The reader asked what a gerund is.",
            answers="The replies defined it and gave examples.",
        )
        base.update(over)
        return summary.ConversationSummary(**base)

    def test_every_part_is_in_the_text(self):
        text = summary.as_note(self._summary())

        assert "A conversation about gerunds." in text
        assert "The reader asked what a gerund is." in text
        assert "The replies defined it and gave examples." in text

    def test_each_part_is_introduced_by_a_heading(self):
        text = summary.as_note(self._summary())

        for heading in ("What this was about", "What you were asking", "What the answers covered"):
            assert heading in text

    def test_a_heading_is_a_line_of_its_own(self):
        """Not "Heading: body" — the body is prose and starts its own line."""
        lines = summary.as_note(self._summary()).splitlines()

        assert "What this was about" in lines

    def test_topics_are_listed_when_there_are_any(self):
        text = summary.as_note(self._summary())

        assert "gerunds" in text and "verb forms" in text

    def test_no_empty_topics_heading_when_there_are_none(self):
        text = summary.as_note(self._summary(topics=[]))

        assert "Topics" not in text
