"""
Tests for AI chats (app/api/chats.py).

No provider is called: `app.services.llm.reply` and the summariser are stubbed,
because what these tests are for is the plumbing around a model — that turns are
stored in order and scoped to their owner, that a missing key is a refusal
rather than a crash, and that finishing a chat writes all three parts of the
summary or none of it.
"""

import pytest

from app.services import conversation_summary as summary

KEY = "not-a-real-key-for-the-suite"


MODELS = ["some-small-model", "some-large-model"]


@pytest.fixture
def configured(client, monkeypatch):
    """
    An account with a provider key on file, which most of this needs.

    Saving a key now calls the provider to list its models, so that call is
    faked here too — see tests/test_provider_credentials.py, where it is the
    thing under test rather than a fixture.
    """
    monkeypatch.setattr("app.api.settings.llm.check_key", lambda *a: list(MODELS))
    client.put("/api/settings/providers/anthropic", json={"api_key": KEY})
    return client


@pytest.fixture
def answering(monkeypatch):
    """A provider that replies, recording what it was asked."""
    seen = []

    def fake_reply(provider, api_key, model, turns):
        seen.append({"provider": provider, "api_key": api_key, "model": model, "turns": list(turns)})
        return "a verb acting as a noun"

    monkeypatch.setattr("app.api.chats.llm.reply", fake_reply)
    return seen


def new_chat(client) -> int:
    return client.post("/api/chats", json={}).json()["id"]


def send(client, chat_id, content="what is a gerund?"):
    return client.post(f"/api/chats/{chat_id}/messages", json={"content": content})


class TestTheChatItself:
    def test_a_chat_can_be_started(self, client):
        assert client.post("/api/chats", json={}).status_code == 201

    def test_a_new_chat_is_empty_and_unfinished(self, client):
        body = client.post("/api/chats", json={}).json()

        assert body["messages"] == [] and body["summary"] is None

    def test_chats_are_listed_most_recent_first(self, client):
        first, second = new_chat(client), new_chat(client)

        listed = [c["id"] for c in client.get("/api/chats").json()]
        assert listed.index(second) < listed.index(first)

    def test_a_chat_can_be_deleted(self, client):
        chat = new_chat(client)
        client.delete(f"/api/chats/{chat}")

        assert client.get(f"/api/chats/{chat}").status_code == 404

    def test_deleting_a_chat_takes_its_messages_with_it(self, client, configured, answering, db):
        from app.db.models import ChatMessage

        chat = new_chat(client)
        send(client, chat)
        client.delete(f"/api/chats/{chat}")

        assert db.query(ChatMessage).filter_by(chat_id=chat).count() == 0


class TestTalking:
    def test_both_turns_are_stored(self, configured, answering):
        chat = new_chat(configured)

        messages = send(configured, chat).json()["messages"]
        assert [m["role"] for m in messages] == ["user", "assistant"]

    def test_the_reply_is_the_providers(self, configured, answering):
        chat = new_chat(configured)

        assert send(configured, chat).json()["messages"][1]["content"] == "a verb acting as a noun"

    def test_the_transcript_so_far_is_sent_with_each_turn(self, configured, answering):
        chat = new_chat(configured)
        send(configured, chat, "first")
        send(configured, chat, "second")

        # Four turns are on the table by the second call: it has to see the
        # first exchange or the model has no conversation to continue.
        assert [role for role, _ in answering[-1]["turns"]] == ["user", "assistant", "user"]

    def test_the_chosen_model_is_what_gets_used(self, configured, answering):
        """
        The picker in the chat window writes one pair of columns on the account,
        and this is the only place that pair means anything.
        """
        configured.put(
            "/api/settings/active-model",
            json={"provider": "anthropic", "model": MODELS[1]},
        )
        send(configured, new_chat(configured))

        assert answering[0]["model"] == MODELS[1]

    def test_the_reader_s_own_key_is_what_gets_used(self, configured, answering):
        send(configured, new_chat(configured))

        assert answering[-1]["api_key"] == KEY

    def test_the_chat_is_titled_from_the_first_thing_said(self, configured, answering):
        chat = new_chat(configured)

        assert send(configured, chat, "how do gerunds work?").json()["title"] == "how do gerunds work?"

    def test_a_long_first_message_is_trimmed_into_a_title(self, configured, answering):
        chat = new_chat(configured)

        title = send(configured, chat, "why " * 200).json()["title"]
        assert 0 < len(title) <= 255

    def test_the_title_does_not_change_on_later_turns(self, configured, answering):
        chat = new_chat(configured)
        send(configured, chat, "the first question")

        assert send(configured, chat, "a later one").json()["title"] == "the first question"

    def test_an_empty_message_is_refused(self, configured, answering):
        assert send(configured, new_chat(configured), "   ").status_code == 422


class TestWhenItCannotTalk:
    def test_no_key_on_file_is_a_refusal_not_a_crash(self, client):
        """
        The state every account is in before visiting /settings, so it is the
        first thing anyone will hit.
        """
        assert send(client, new_chat(client)).status_code == 409

    def test_the_refusal_says_what_to_do(self, client):
        detail = send(client, new_chat(client)).json()["detail"]

        assert "settings" in detail.lower()

    def test_a_provider_failure_is_a_bad_gateway(self, configured, monkeypatch):
        from app.services.llm import ProviderError

        def refuse(*_):
            raise ProviderError("401 invalid x-api-key")

        monkeypatch.setattr("app.api.chats.llm.reply", refuse)

        assert send(configured, new_chat(configured)).status_code == 502

    def test_a_provider_failure_keeps_the_readers_turn_out_of_the_transcript(
        self, configured, monkeypatch
    ):
        """
        A half-stored exchange is worse than none: the next request would send
        a transcript ending on the reader, and the summary would describe a
        question that was never answered.
        """
        from app.services.llm import ProviderError

        monkeypatch.setattr(
            "app.api.chats.llm.reply", lambda *a: (_ for _ in ()).throw(ProviderError("nope"))
        )
        chat = new_chat(configured)
        send(configured, chat)

        assert configured.get(f"/api/chats/{chat}").json()["messages"] == []


class TestFinishing:
    @pytest.fixture
    def summarising(self, monkeypatch):
        answer = summary.ConversationSummary(
            general="A conversation about gerunds.",
            topics=["gerunds", "verb forms"],
            questions="The reader asked what a gerund is.",
            answers="The replies defined it and gave examples.",
        )
        monkeypatch.setattr("app.api.chats.conversation_summary.summarize", lambda *a: answer)
        return answer

    def test_finishing_writes_all_three_parts(self, configured, answering, summarising):
        chat = new_chat(configured)
        send(configured, chat)

        got = configured.post(f"/api/chats/{chat}/summarize").json()["summary"]
        assert got["general"] and got["topics"] and got["questions"] and got["answers"]

    def test_the_summary_survives_a_reload(self, configured, answering, summarising):
        chat = new_chat(configured)
        send(configured, chat)
        configured.post(f"/api/chats/{chat}/summarize")

        assert configured.get(f"/api/chats/{chat}").json()["summary"]["topics"] == summarising.topics

    def test_an_empty_chat_has_nothing_to_summarise(self, configured, summarising):
        assert configured.post(f"/api/chats/{new_chat(configured)}/summarize").status_code == 400

    def test_a_provider_that_will_not_summarise_leaves_the_transcript_alone(
        self, configured, answering, monkeypatch
    ):
        monkeypatch.setattr("app.api.chats.conversation_summary.summarize", lambda *a: None)
        chat = new_chat(configured)
        send(configured, chat)

        assert configured.post(f"/api/chats/{chat}/summarize").status_code == 502
        assert len(configured.get(f"/api/chats/{chat}").json()["messages"]) == 2

    def test_a_finished_chat_takes_no_more_turns(self, configured, answering, summarising):
        """
        Finishing is a real transition, not a label: another turn would leave
        the summary describing a conversation that has moved on since.
        """
        chat = new_chat(configured)
        send(configured, chat)
        configured.post(f"/api/chats/{chat}/summarize")

        assert send(configured, chat, "one more thing").status_code == 409

    def test_summarising_without_a_key_is_the_same_refusal_as_chatting(
        self, client, configured, answering, summarising
    ):
        chat = new_chat(configured)
        send(configured, chat)
        configured.delete("/api/settings/providers/anthropic")

        assert configured.post(f"/api/chats/{chat}/summarize").status_code == 409


class TestOwnership:
    def test_another_account_cannot_read_this_one_s_chat(self, client, other_client):
        assert other_client.get(f"/api/chats/{new_chat(client)}").status_code == 404

    def test_another_account_cannot_write_into_it(self, configured, other_client, answering):
        assert send(other_client, new_chat(configured)).status_code == 404

    def test_another_account_cannot_delete_it(self, client, other_client):
        chat = new_chat(client)
        other_client.delete(f"/api/chats/{chat}")

        assert client.get(f"/api/chats/{chat}").status_code == 200

    def test_another_account_cannot_summarise_it(self, configured, other_client, answering):
        chat = new_chat(configured)
        send(configured, chat)

        assert other_client.post(f"/api/chats/{chat}/summarize").status_code == 404

    def test_a_chat_that_is_not_yours_answers_like_one_that_does_not_exist(
        self, client, other_client
    ):
        """
        404 rather than 403, as with notes: a different answer would turn the
        id space into a directory of other people's conversations.
        """
        mine = new_chat(client)

        assert other_client.get(f"/api/chats/{mine}").status_code == 404
        assert other_client.get("/api/chats/999999").status_code == 404

    def test_only_this_account_s_chats_are_listed(self, client, other_client):
        new_chat(client)

        assert other_client.get("/api/chats").json() == []

    def test_a_stranger_is_refused(self, anon_client):
        assert anon_client.get("/api/chats").status_code == 401


class TestWhatTheRefusalSays:
    """
    The error path is most of what this feature does before a key is on file,
    so what it says is part of the feature rather than a detail of it.
    """

    def test_a_provider_failure_leads_with_a_sentence(self, configured, monkeypatch):
        from app.api.chats import PROVIDER_REFUSED
        from app.services.llm import ProviderError

        monkeypatch.setattr(
            "app.api.chats.llm.reply",
            lambda *a: (_ for _ in ()).throw(
                ProviderError("Error code: 401 - {'type': 'error', 'error': {...}}")
            ),
        )

        detail = send(configured, new_chat(configured)).json()["detail"]
        assert detail.startswith(PROVIDER_REFUSED)

    def test_it_still_carries_the_providers_own_words(self, configured, monkeypatch):
        # Without them there is no way to tell a bad key from a rate limit.
        from app.services.llm import ProviderError

        monkeypatch.setattr(
            "app.api.chats.llm.reply",
            lambda *a: (_ for _ in ()).throw(ProviderError("rate_limit_error")),
        )

        assert "rate_limit_error" in send(configured, new_chat(configured)).json()["detail"]

    def test_no_refusal_can_echo_the_key(self, configured, monkeypatch):
        """
        A provider that quotes the offending credential back in its error would
        otherwise put it on screen and into any log that records the response.
        """
        from app.services.llm import ProviderError

        monkeypatch.setattr(
            "app.api.chats.llm.reply",
            lambda *a: (_ for _ in ()).throw(ProviderError(f"bad key: {KEY}")),
        )

        assert KEY not in send(configured, new_chat(configured)).text


class TestWhatAFinishedChatLeavesBehind:
    """
    Finishing a conversation writes a note.

    A summary that can only be read on a card is a worse thing to own than a
    note: you cannot correct it, add to it, or pin it. So the summary becomes
    the text of a real note, and the library shows that note in the
    conversation's place. The transcript is kept — nothing here deletes it.
    """

    @pytest.fixture
    def summarising(self, monkeypatch):
        answer = summary.ConversationSummary(
            general="A conversation about gerunds.",
            topics=["gerunds"],
            questions="The reader asked what a gerund is.",
            answers="The replies defined it and gave examples.",
        )
        monkeypatch.setattr("app.api.chats.conversation_summary.summarize", lambda *a: answer)
        return answer

    def test_finishing_writes_a_note(self, configured, answering, summarising):
        before = len(configured.get("/api/notes").json())
        chat = new_chat(configured)
        send(configured, chat)

        configured.post(f"/api/chats/{chat}/summarize")

        assert len(configured.get("/api/notes").json()) == before + 1

    def test_the_note_holds_the_summary(self, configured, answering, summarising):
        chat = new_chat(configured)
        send(configured, chat)
        configured.post(f"/api/chats/{chat}/summarize")

        note = configured.get("/api/notes").json()[0]
        assert "A conversation about gerunds." in note["content"]
        assert "What this was about" in note["content"]

    def test_the_summary_says_which_note_it_became(self, configured, answering, summarising):
        chat = new_chat(configured)
        send(configured, chat)

        got = configured.post(f"/api/chats/{chat}/summarize").json()
        assert got["summary"]["note_id"] is not None

    def test_the_note_id_survives_a_reload(self, configured, answering, summarising):
        chat = new_chat(configured)
        send(configured, chat)
        written = configured.post(f"/api/chats/{chat}/summarize").json()["summary"]["note_id"]

        assert configured.get(f"/api/chats/{chat}").json()["summary"]["note_id"] == written

    def test_summarising_again_rewrites_the_same_note(self, configured, answering, summarising):
        """
        Re-summarising is the retry path for a poor first attempt. It has to
        correct the note it already wrote — a second one would leave the
        library holding two notes for one conversation, one of them the bad
        summary the reader was retrying to be rid of.
        """
        chat = new_chat(configured)
        send(configured, chat)
        first = configured.post(f"/api/chats/{chat}/summarize").json()["summary"]["note_id"]
        before = len(configured.get("/api/notes").json())

        again = configured.post(f"/api/chats/{chat}/summarize").json()["summary"]["note_id"]

        assert again == first
        assert len(configured.get("/api/notes").json()) == before

    def test_the_transcript_is_not_deleted(self, configured, answering, summarising):
        chat = new_chat(configured)
        send(configured, chat)
        configured.post(f"/api/chats/{chat}/summarize")

        assert len(configured.get(f"/api/chats/{chat}").json()["messages"]) == 2


class TestRenamingAConversation:
    """
    A chat's title is taken from the first thing said in it, which is a guess.

    It is the only thing standing for the conversation in the library, so the
    reader has to be able to correct it — the same way they can correct a note's
    title, and through the same kind of request.
    """

    def test_a_chat_can_be_renamed(self, client):
        chat = new_chat(client)

        body = client.patch(f"/api/chats/{chat}", json={"title": "Spring tides"}).json()

        assert body["title"] == "Spring tides"
        assert client.get(f"/api/chats/{chat}").json()["title"] == "Spring tides"

    def test_a_title_of_nothing_but_spaces_is_refused(self, client):
        chat = new_chat(client)

        assert client.patch(f"/api/chats/{chat}", json={"title": "   "}).status_code == 422

    def test_surrounding_space_is_trimmed(self, client):
        chat = new_chat(client)

        body = client.patch(f"/api/chats/{chat}", json={"title": "  Spring tides  "}).json()

        assert body["title"] == "Spring tides"

    def test_a_finished_chat_can_still_be_renamed(self, configured, answering, monkeypatch):
        """
        Renaming is not saying anything, so ALREADY_FINISHED does not apply.
        A summarised conversation is exactly the one whose name you are most
        likely to want to fix, because it is the one you will come back to.
        """
        monkeypatch.setattr(
            "app.api.chats.conversation_summary.summarize",
            lambda *a: summary.ConversationSummary(
                general="g", topics=["t"], questions="q", answers="a"
            ),
        )
        chat = new_chat(configured)
        send(configured, chat)
        configured.post(f"/api/chats/{chat}/summarize")

        assert (
            configured.patch(f"/api/chats/{chat}", json={"title": "Gerunds"}).status_code
            == 200
        )

    def test_renaming_a_missing_chat_is_a_404(self, client):
        assert client.patch("/api/chats/9999", json={"title": "x"}).status_code == 404

    def test_another_account_cannot_rename_it(self, client, other_client):
        chat = new_chat(client)

        assert (
            other_client.patch(f"/api/chats/{chat}", json={"title": "theirs"}).status_code
            == 404
        )
