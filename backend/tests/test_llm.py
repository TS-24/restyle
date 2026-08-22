"""
Tests for the LangChain provider layer (app/services/llm.py).

No provider is ever called here. What matters is not whether a model gives good
answers — that is not a judgement a test can make — but that the registry names
real classes, that a transcript is converted into the message types LangChain
expects, and that a provider failure arrives as one recognisable exception
rather than as whichever SDK error happened to escape.
"""

import pytest

from app.services import llm

TURNS = [("user", "what is a gerund?"), ("assistant", "a verb acting as a noun")]


PROVIDER_IDS = ["anthropic", "openai", "openrouter", "opencode-zen"]


class TestRegistry:
    def test_every_provider_is_offered(self):
        assert set(llm.PROVIDERS) == set(PROVIDER_IDS)

    @pytest.mark.parametrize("provider", PROVIDER_IDS)
    def test_every_provider_names_an_importable_class(self, provider):
        """
        The registry is a table of import paths, so a typo in it is invisible
        until someone with a key tries to chat. This is the check that a
        renamed class is caught here instead.
        """
        assert llm.provider_class(provider) is not None

    @pytest.mark.parametrize("provider", PROVIDER_IDS)
    def test_every_provider_has_a_default_model(self, provider):
        assert llm.PROVIDERS[provider].default_model

    @pytest.mark.parametrize("provider", ["openrouter", "opencode-zen"])
    def test_the_gateways_list_their_models_to_anybody(self, provider):
        """
        Both gateways answer /v1/models with no credential at all — checked by
        hand against the live endpoints, which returned 418 and 64 models for a
        key made of nonsense. So listing cannot be the proof that a key works
        there, and `check_key` sends a real one-token request instead.
        """
        assert llm.PROVIDERS[provider].lists_publicly is True

    @pytest.mark.parametrize("provider", ["anthropic", "openai"])
    def test_the_first_party_providers_do_not(self, provider):
        # Their model lists are 401s without a key, so listing is the check.
        assert llm.PROVIDERS[provider].lists_publicly is False

    @pytest.mark.parametrize("provider", ["openrouter", "opencode-zen"])
    def test_the_gateways_reuse_the_openai_client(self, provider):
        """
        OpenRouter and OpenCode Zen both speak OpenAI's API. That is the whole
        reason they cost one registry row each rather than a client of their
        own, so it is worth a test: the day one of them stops being
        OpenAI-shaped, this says so instead of the first chat saying it.
        """
        assert llm.PROVIDERS[provider].api_style == "openai"
        assert llm.PROVIDERS[provider].base_url

    @pytest.mark.parametrize("provider", ["anthropic", "openai"])
    def test_the_first_party_providers_need_no_base_url(self, provider):
        # Their SDKs already know where they live; setting one here would be a
        # second place for the address to be wrong.
        assert llm.PROVIDERS[provider].base_url is None

    def test_a_gateway_is_told_where_to_send_the_call(self, monkeypatch):
        """
        Without this the OpenAI client happily accepts an OpenRouter key and
        sends it to OpenAI, which is both a wrong answer and a credential
        posted to the wrong company.
        """
        built = {}

        def fake(provider):
            def cls(**kwargs):
                built.update(kwargs)
                return object()

            return cls

        monkeypatch.setattr(llm, "provider_class", fake)
        llm.chat_model("openrouter", "secret-key", None)

        assert built["base_url"] == llm.PROVIDERS["openrouter"].base_url

    def test_a_first_party_provider_is_not_given_a_base_url(self, monkeypatch):
        built = {}

        def fake(provider):
            def cls(**kwargs):
                built.update(kwargs)
                return object()

            return cls

        monkeypatch.setattr(llm, "provider_class", fake)
        llm.chat_model("anthropic", "secret-key", None)

        assert "base_url" not in built

    def test_an_unknown_provider_is_refused(self):
        with pytest.raises(llm.UnknownProvider):
            llm.chat_model("hal9000", "k", None)

    def test_the_default_model_is_used_when_none_is_given(self, monkeypatch):
        built = {}

        def fake(provider):
            def cls(**kwargs):
                built.update(kwargs)
                return object()

            return cls

        monkeypatch.setattr(llm, "provider_class", fake)
        llm.chat_model("anthropic", "secret-key", None)

        assert built["model"] == llm.PROVIDERS["anthropic"].default_model

    def test_the_call_is_given_a_timeout(self, monkeypatch):
        """
        Every chat route is a sync `def`, so it runs in FastAPI's threadpool. A
        provider that accepts the connection and then stalls holds that slot for
        as long as the SDK's own default allows, and enough of those stop the
        app serving anything at all.
        """
        built = {}

        def fake(provider):
            def cls(**kwargs):
                built.update(kwargs)
                return object()

            return cls

        monkeypatch.setattr(llm, "provider_class", fake)
        llm.chat_model("anthropic", "secret-key", None)

        assert built["timeout"] == llm.TIMEOUT_SECONDS
        assert built["max_retries"] == llm.MAX_RETRIES

    def test_an_explicit_model_overrides_the_default(self, monkeypatch):
        built = {}

        def fake(provider):
            def cls(**kwargs):
                built.update(kwargs)
                return object()

            return cls

        monkeypatch.setattr(llm, "provider_class", fake)
        llm.chat_model("openai", "secret-key", "some-other-model")

        assert built["model"] == "some-other-model"


class TestTranscriptConversion:
    def test_the_system_prompt_leads(self):
        from langchain_core.messages import SystemMessage

        assert isinstance(llm.to_messages(TURNS)[0], SystemMessage)

    def test_roles_map_to_their_message_types(self):
        from langchain_core.messages import AIMessage, HumanMessage

        human, ai = llm.to_messages(TURNS)[1:]

        assert isinstance(human, HumanMessage) and human.content == TURNS[0][1]
        assert isinstance(ai, AIMessage) and ai.content == TURNS[1][1]

    def test_an_empty_transcript_is_still_addressable(self):
        # Only the system message; a chat with no turns is not an error.
        assert len(llm.to_messages([])) == 1

    def test_a_system_turn_is_folded_into_the_leading_message(self):
        """
        The note a conversation was started from is context, not a turn.

        Providers do not all take a system message part-way through an
        exchange — Anthropic takes system as a top-level argument and has
        nowhere to put a second one — so it goes into the one at the front,
        which is also where it honestly belongs: the ground the exchange
        stands on, not something somebody said in the middle of it.
        """
        from langchain_core.messages import HumanMessage

        messages = llm.to_messages(
            [("system", "The moon pulls."), *TURNS]
        )

        assert len(messages) == 1 + len(TURNS)
        assert "The moon pulls." in messages[0].content
        assert llm.SYSTEM_PROMPT in messages[0].content
        assert isinstance(messages[1], HumanMessage)

    def test_an_unknown_role_is_refused(self):
        # A role the database should never hold. Guessing at it would put words
        # in one speaker's mouth as the other's.
        with pytest.raises(ValueError):
            llm.to_messages([("narrator", "meanwhile")])


class TestReply:
    def test_it_returns_the_models_text(self, monkeypatch):
        monkeypatch.setattr(llm, "chat_model", lambda *a: _stub("a verb acting as a noun"))

        assert llm.reply("anthropic", "k", None, TURNS) == "a verb acting as a noun"

    def test_content_arriving_in_blocks_is_flattened(self, monkeypatch):
        """
        A chat model may answer with a list of content blocks rather than a
        string. Storing the repr of a list is the kind of thing that only shows
        up on screen, so it is settled here.
        """
        monkeypatch.setattr(
            llm,
            "chat_model",
            lambda *a: _stub([{"type": "text", "text": "a verb "}, {"type": "text", "text": "as a noun"}]),
        )

        assert llm.reply("anthropic", "k", None, TURNS) == "a verb as a noun"

    def test_a_provider_failure_becomes_one_exception(self, monkeypatch):
        """
        Anthropic and OpenAI raise entirely different types for the same "your
        key is wrong". The route above cannot branch on both, so they arrive
        here as one.
        """

        def explode(*_):
            raise RuntimeError("401 invalid x-api-key")

        monkeypatch.setattr(llm, "chat_model", lambda *a: _stub(raises=explode))

        with pytest.raises(llm.ProviderError) as caught:
            llm.reply("anthropic", "k", None, TURNS)

        # The provider's own words, because they are the only thing that says
        # which of the many ways this can fail actually happened.
        assert "invalid x-api-key" in str(caught.value)

    def test_an_empty_answer_is_refused(self, monkeypatch):
        # Storing an empty assistant turn leaves a chat that looks broken and a
        # transcript the summary would have to describe as nothing.
        monkeypatch.setattr(llm, "chat_model", lambda *a: _stub("   "))

        with pytest.raises(llm.ProviderError):
            llm.reply("anthropic", "k", None, TURNS)


class TestListingModels:
    """
    The model list is fetched the moment a key is saved, which makes it the
    connectivity test as well: a key that cannot list models cannot chat, and
    finding that out on the settings dialog is the whole point of the change.
    """

    def test_it_returns_the_ids_the_provider_names(self, monkeypatch):
        monkeypatch.setattr(llm, "_models_client", lambda *a: _catalogue("b", "a"))

        assert llm.list_models("openai", "k") == ["a", "b"]

    def test_duplicates_are_dropped(self, monkeypatch):
        # OpenRouter has listed the same id twice under different routes. The
        # picker would show it twice, and the second one would look like a
        # different model.
        monkeypatch.setattr(llm, "_models_client", lambda *a: _catalogue("a", "a"))

        assert llm.list_models("openrouter", "k") == ["a"]

    def test_a_refusal_becomes_one_exception(self, monkeypatch):
        def explode(*_):
            raise RuntimeError("401 Incorrect API key provided")

        monkeypatch.setattr(llm, "_models_client", explode)

        with pytest.raises(llm.ProviderError) as caught:
            llm.list_models("openai", "k")

        # The provider's own words: they are what tells a wrong key apart from
        # a network that is down, and the dialog shows them.
        assert "Incorrect API key" in str(caught.value)

    def test_an_empty_catalogue_is_refused(self, monkeypatch):
        # A key that authenticates but can reach nothing is not a working key,
        # and storing it would leave the picker with nothing to offer.
        monkeypatch.setattr(llm, "_models_client", lambda *a: _catalogue())

        with pytest.raises(llm.ProviderError):
            llm.list_models("openai", "k")

    def test_an_unknown_provider_is_refused(self):
        with pytest.raises(llm.UnknownProvider):
            llm.list_models("hal9000", "k")


class TestCheckingAKey:
    """
    What the settings dialog waits for. The catalogue and the proof arrive
    together, and which call is the proof depends on the provider — see
    `lists_publicly`.
    """

    def test_a_first_party_key_is_proved_by_the_listing(self, monkeypatch):
        probed = []
        monkeypatch.setattr(llm, "_models_client", lambda *a: _catalogue("a"))
        monkeypatch.setattr(llm, "_probe", lambda *a: probed.append(a))

        llm.check_key("openai", "k")

        # A second call would be a request the reader pays for, to learn
        # something the first call already established.
        assert probed == []

    def test_a_gateway_key_is_proved_by_a_real_request(self, monkeypatch):
        probed = []
        monkeypatch.setattr(llm, "_models_client", lambda *a: _catalogue("a"))
        monkeypatch.setattr(llm, "_probe", lambda *a: probed.append(a))

        llm.check_key("openrouter", "k")

        assert len(probed) == 1

    def test_the_probe_uses_a_model_the_gateway_actually_offers(self, monkeypatch):
        # The registry's default can be months stale, and a probe against a
        # retired model fails as loudly as a bad key while meaning nothing.
        probed = []
        monkeypatch.setattr(llm, "_models_client", lambda *a: _catalogue("some-model"))
        monkeypatch.setattr(llm, "_probe", lambda known, key, model: probed.append(model))

        llm.check_key("openrouter", "k")

        assert probed == ["some-model"]

    def test_a_gateway_key_the_probe_rejects_is_refused(self, monkeypatch):
        """
        The case that makes this worth the extra call: the listing succeeded,
        so without the probe a nonsense key would have been stored as working.
        """

        def explode(*_):
            raise RuntimeError("401 Invalid API key.")

        monkeypatch.setattr(llm, "_models_client", lambda *a: _catalogue("a"))
        monkeypatch.setattr(llm, "_probe", explode)

        with pytest.raises(llm.ProviderError) as caught:
            llm.check_key("openrouter", "k")

        assert "Invalid API key" in str(caught.value)

    def test_it_returns_the_catalogue(self, monkeypatch):
        monkeypatch.setattr(llm, "_models_client", lambda *a: _catalogue("b", "a"))

        assert llm.check_key("openai", "k") == ["a", "b"]


def _catalogue(*ids: str):
    """A provider SDK client whose `models.list()` names `ids`."""

    class Client:
        models = type(
            "Models",
            (),
            {"list": staticmethod(lambda: [type("M", (), {"id": i})() for i in ids])},
        )

    return Client()


def _stub(content: object = "", raises=None):
    """A chat model that answers with `content`, or fails."""

    class Stub:
        def invoke(self, messages):
            if raises is not None:
                raises(messages)
            return type("Response", (), {"content": content})()

    return Stub()
