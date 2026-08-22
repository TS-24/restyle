"""
The chat itself — LangChain, talking to whichever provider the reader configured.

Unlike the word ladder's ranker, which calls a hosted model with the
deployment's own token, everything here runs on a credential the reader supplied
on /settings. So the provider is data, not a deployment decision, and this
module's job is to turn a row in `provider_credentials` plus a transcript into
one reply.

Two design notes:

**A registry, not `init_chat_model`.** LangChain will resolve a provider from a
string, but a table of import paths is greppable, fails at the point of the typo
rather than at the first request with a real key, and can be checked by a test
that has no credentials — which is the only kind of test this can have. Adding a
provider is one row here plus one package in requirements.txt.

**One exception out.** Anthropic and OpenAI raise entirely unrelated types for
the same "your key is wrong", and the route above cannot branch on both. They
leave here as `ProviderError`, carrying the provider's own words, because those
words are the only thing that distinguishes a bad key from a rate limit from a
model name that does not exist.

The provider packages are imported lazily, like `ranker._client`, so an install
where nobody ever chats never pays for them.
"""

from dataclasses import dataclass
from importlib import import_module
from typing import Literal, Sequence

# What the assistant is, in the app it lives in. Deliberately short: a long
# persona would be a prompt to maintain, and this one exists only so the model
# knows it is answering inside a notes app rather than nowhere in particular.
SYSTEM_PROMPT = (
    "You are a thoughtful companion inside a personal notes and vocabulary app. "
    "Answer plainly and concretely, in prose rather than bullet lists unless a "
    "list is genuinely the clearer form. Prefer a short precise answer to a long "
    "hedged one, and say when you are unsure."
)


# A stalled provider is worse here than a slow one. The chat routes are sync
# `def`, so each in-flight call holds a FastAPI threadpool slot, and the slot is
# shared with every other route in the app. Generous enough for a long
# summarisation, short enough that a hung provider cannot take the app down.
TIMEOUT_SECONDS = 60.0

# One retry past the first attempt. The SDK defaults retry more than this, which
# multiplies the worst case by the timeout above; a reader watching a spinner
# would rather be told it failed.
MAX_RETRIES = 1


class UnknownProvider(ValueError):
    """A provider name that is not in the registry."""


class ProviderError(RuntimeError):
    """The provider was reached and would not answer — bad key, limit, model."""


@dataclass(frozen=True)
class Provider:
    """One row of the registry: where the class lives and what to call by default."""

    label: str
    module: str
    class_name: str
    default_model: str
    # Which company's HTTP API this speaks, which is a different question from
    # whose service it is. It decides the SDK used to list models below, and it
    # is why a gateway costs one row here rather than a client of its own.
    api_style: Literal["openai", "anthropic"]
    # Only the gateways set this. Anthropic's and OpenAI's own SDKs already know
    # where they live, and repeating the address here would be a second place
    # for it to be wrong.
    base_url: str | None = None
    # Whether this provider hands out its model list to anybody who asks.
    # Checked by hand against the live endpoints: both gateways do, and both
    # first-party APIs answer 401. It decides whether listing models proves a
    # key works, or whether `check_key` has to spend a request finding out.
    lists_publicly: bool = False


# Both classes take `api_key`, `model`, `timeout` and `max_retries` — verified
# against langchain-anthropic and langchain-openai 1.6.0, where several are
# aliases on the real field (`anthropic_api_key`, `model_name`, and on Anthropic
# `default_request_timeout`). That is what lets `chat_model` below be one code
# path rather than a per-provider keyword mapping.
PROVIDERS: dict[str, Provider] = {
    "anthropic": Provider(
        label="Anthropic",
        module="langchain_anthropic",
        class_name="ChatAnthropic",
        default_model="claude-opus-5",
        api_style="anthropic",
    ),
    "openai": Provider(
        label="OpenAI",
        module="langchain_openai",
        class_name="ChatOpenAI",
        default_model="gpt-5.1",
        api_style="openai",
    ),
    # The two gateways. Both speak OpenAI's API, so both reuse ChatOpenAI and
    # differ only by where the call is addressed — which is the one thing that
    # must not be forgotten, since the OpenAI client will otherwise take an
    # OpenRouter key and post it to OpenAI.
    "openrouter": Provider(
        label="OpenRouter",
        module="langchain_openai",
        class_name="ChatOpenAI",
        default_model="openai/gpt-5.1",
        api_style="openai",
        base_url="https://openrouter.ai/api/v1",
        lists_publicly=True,
    ),
    "opencode-zen": Provider(
        label="OpenCode Zen",
        module="langchain_openai",
        class_name="ChatOpenAI",
        default_model="claude-sonnet-4-5",
        api_style="openai",
        base_url="https://opencode.ai/zen/v1",
        lists_publicly=True,
    ),
}


def provider_class(provider: str):
    """The chat model class for a provider, imported on first use."""
    known = PROVIDERS.get(provider)
    if known is None:
        raise UnknownProvider(f"Unknown provider: {provider}")
    return getattr(import_module(known.module), known.class_name)


def chat_model(provider: str, api_key: str, model: str | None):
    """A configured chat model. The reader's key, never the environment's."""
    if provider not in PROVIDERS:
        raise UnknownProvider(f"Unknown provider: {provider}")
    known = PROVIDERS[provider]
    # Passed only when the registry sets one: ChatAnthropic and ChatOpenAI both
    # treat an explicit `base_url=None` differently from an absent argument in
    # at least one version, and the absent one is what the first-party
    # providers want.
    address = {"base_url": known.base_url} if known.base_url else {}
    return provider_class(provider)(
        model=model or known.default_model,
        api_key=api_key,
        timeout=TIMEOUT_SECONDS,
        max_retries=MAX_RETRIES,
        **address,
    )


def _models_client(known: Provider, api_key: str):
    """
    The provider's own SDK client, for the one call LangChain does not cover.

    LangChain models chat; it has no "what can this key reach". Both SDKs are
    already installed — they are what langchain-anthropic and langchain-openai
    are built on — so this is a lazy import rather than a new dependency, and
    `api_style` rather than the provider id is what picks between them, which is
    what lets a new gateway be one row of the registry.
    """
    if known.api_style == "anthropic":
        from anthropic import Anthropic

        return Anthropic(api_key=api_key, timeout=TIMEOUT_SECONDS, max_retries=MAX_RETRIES)

    from openai import OpenAI

    return OpenAI(
        api_key=api_key,
        base_url=known.base_url,
        timeout=TIMEOUT_SECONDS,
        max_retries=MAX_RETRIES,
    )


def list_models(provider: str, api_key: str) -> list[str]:
    """
    Every model id this key can reach, and — by asking — whether it can reach.

    Called when a key is saved, which makes it two things at once: the catalogue
    the picker is built from, and the proof that the credential works. A key
    that cannot list models cannot chat either, so failing here is failing
    early, on the dialog that just asked for it, rather than on someone's first
    question.

    Bounded by the same timeout as `reply`, and for the same reason: this runs
    inside a request on a sync route, holding a threadpool slot while it waits.
    """
    known = PROVIDERS.get(provider)
    if known is None:
        raise UnknownProvider(f"Unknown provider: {provider}")

    try:
        listed = _models_client(known, api_key).models.list()
        # A set first: OpenRouter has named the same model twice, and two
        # identical rows in the picker read as two different models.
        ids = sorted({str(model.id) for model in listed})
    except Exception as error:  # every SDK's own failure type, flattened
        raise ProviderError(str(error)) from error

    if not ids:
        # Authenticated and yet able to reach nothing. Storing this would leave
        # the picker with an empty list and no explanation for it.
        raise ProviderError("The provider listed no models for this key.")
    return ids


def _probe(known: Provider, api_key: str, model: str) -> None:
    """
    The smallest real request this key can make. Raises if it is not accepted.

    One token, because the answer is thrown away — what is being read is the
    status, not the reply. Only the gateways need this, and only because their
    model lists are public; the cost is a fraction of a request the reader was
    about to make anyway.
    """
    _models_client(known, api_key).chat.completions.create(
        model=model,
        max_tokens=1,
        messages=[{"role": "user", "content": "hi"}],
    )


def check_key(provider: str, api_key: str) -> list[str]:
    """
    Prove this key works, and come back with everything it can reach.

    Called when a key is saved, and the reason that save is a dialog rather than
    a field: the reader waits here, and if the provider will not have the key
    they are told so at the moment they pasted it rather than at their first
    question.

    Two calls or one, depending on the provider. Listing models is proof enough
    where the list is behind the key — Anthropic and OpenAI both answer 401
    without one. The gateways serve their catalogues to anybody, so a listing
    there says nothing about the credential and a real request has to be made.
    """
    known = PROVIDERS.get(provider)
    if known is None:
        raise UnknownProvider(f"Unknown provider: {provider}")

    models = list_models(provider, api_key)
    if not known.lists_publicly:
        return models

    try:
        # The registry's default may be months stale, so the probe goes to
        # something the provider has just said it has.
        _probe(known, api_key, _preferred_of(known, models))
    except Exception as error:  # every SDK's own failure type, flattened
        raise ProviderError(str(error)) from error
    return models


def _preferred_of(known: Provider, models: list[str]) -> str:
    """The registry's default if it is still offered, else the first real one."""
    return known.default_model if known.default_model in models else models[0]


def scrub(message: str, api_key: str) -> str:
    """
    A provider's error with the credential taken back out of it.

    Providers do quote the offending key in an authentication error, and that
    message is on its way to the screen and into any log that records a
    response. Everything else around this works to keep the key out of
    responses; it would be a poor place to hand it back.
    """
    return message.replace(api_key, "····") if api_key else message


def to_messages(turns: Sequence[tuple[str, str]]):
    """A stored transcript as LangChain messages, system prompt first.

    Takes role/content pairs rather than ORM rows so it stays a pure function
    with nothing to set up — the route unpacks `chat.messages` on the way in.

    A `system` turn is context the conversation was started from — the text of
    the note it belongs to — and it is folded into the leading system message
    rather than appended where it sits. Providers do not all accept a system
    message part-way through a conversation; Anthropic takes system as a
    top-level argument and has nowhere to put a second one. Folding also keeps
    the ordering honest: this is the ground the whole exchange stands on, not a
    turn somebody took in the middle of it.
    """
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

    context = [content for role, content in turns if role == "system"]
    messages = [SystemMessage(content="\n\n".join([SYSTEM_PROMPT, *context]))]
    for role, content in turns:
        if role == "system":
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
        else:
            # Guessing would put one speaker's words in the other's mouth,
            # which is worse than refusing a row that should not exist.
            raise ValueError(f"Unknown role: {role}")
    return messages


def text_of(content) -> str:
    """One string out of whatever a model put in `content`.

    A reply can arrive as a plain string or as a list of content blocks. Storing
    the repr of a list is the sort of thing that only shows up on screen, so it
    is flattened at the boundary rather than anywhere later.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )
    return str(content)


def reply(
    provider: str, api_key: str, model: str | None, turns: Sequence[tuple[str, str]]
) -> str:
    """The assistant's next turn, or ProviderError."""
    try:
        answer = chat_model(provider, api_key, model).invoke(to_messages(turns))
    except UnknownProvider:
        raise
    except Exception as error:  # every SDK's own failure type, flattened
        raise ProviderError(str(error)) from error

    text = text_of(answer.content).strip()
    if not text:
        # An empty assistant turn leaves a chat that reads as broken and a
        # transcript the summary would have to describe as nothing.
        raise ProviderError("The provider returned an empty reply.")
    return text
