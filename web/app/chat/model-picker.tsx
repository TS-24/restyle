import { Link } from "react-router";

import type { ProviderSettings } from "~/lib/types";

/**
 * Which provider and model this conversation runs on, above the composer.
 *
 * Here rather than on the settings page because this is where the choice is
 * made — you notice a model is too slow, or too dear, or wrong for what you are
 * asking, in the middle of asking it, and walking to another page and back to
 * act on that is enough friction to stop anyone bothering.
 *
 * Two native `<select>`s, for the reason the palette picker gives: a list that
 * can be two entries or two hundred stays usable at any length, on a phone, and
 * by keyboard, without any of that being written here. Some providers list
 * hundreds of models.
 *
 * The lists are the account's own: only providers it holds a key for, and only
 * models that key actually reached when it was last checked. Offering anything
 * else would be offering a refusal.
 */
export default function ModelPicker({
  provider,
  onChoose,
}: {
  provider: ProviderSettings;
  /** Both halves, always together — the backend checks the model against its key. */
  onChoose: (provider: string, model: string) => void;
}) {
  const { configured, active } = provider;

  if (!active || configured.length === 0) {
    return (
      <p className="mb-3 text-sm italic text-ink/40">
        No provider key yet.{" "}
        <Link to="/settings" className="text-accent-ink transition-opacity hover:opacity-80">
          Add a key
        </Link>{" "}
        to start a conversation.
      </p>
    );
  }

  const current = configured.find(c => c.provider === active.provider);

  return (
    <div className="mb-3 flex items-center justify-end gap-3">
      <select
        aria-label="Provider"
        value={active.provider}
        onChange={event => {
          const next = configured.find(c => c.provider === event.target.value);
          if (!next) return;
          // The model that was selected belongs to the provider being left, and
          // naming it at the new one would be a refusal. Keep it only if the
          // new catalogue happens to have it — gateways do carry the same
          // model ids as the services behind them.
          const model = next.models.includes(active.model)
            ? active.model
            : next.models[0];
          if (model) onChoose(next.provider, model);
        }}
        className="cursor-pointer border-b border-transparent bg-transparent py-1 text-xs text-ink/50 outline-none transition-colors hover:text-ink focus:border-accent-ink"
      >
        {configured.map(credential => (
          <option key={credential.provider} value={credential.provider}>
            {credential.label}
          </option>
        ))}
      </select>

      <select
        aria-label="Model"
        value={active.model}
        onChange={event => onChoose(active.provider, event.target.value)}
        className="max-w-[16rem] cursor-pointer border-b border-transparent bg-transparent py-1 text-xs text-ink/50 outline-none transition-colors hover:text-ink focus:border-accent-ink"
      >
        {/*
          The active model is included even when the catalogue does not name it:
          a value a `<select>` has no option for renders as blank, and a picker
          showing nothing while a chat runs on something would be a worse lie
          than showing the something. Refreshing on /settings is the remedy.
        */}
        {(current?.models.includes(active.model)
          ? current.models
          : [active.model, ...(current?.models ?? [])]
        ).map(model => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>
    </div>
  );
}
