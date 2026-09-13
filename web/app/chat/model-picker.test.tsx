/**
 * @vitest-environment jsdom
 *
 * Per file, for the reason routes/workspace.test.tsx gives.
 *
 * The picker is the other half of the settings dialog: keys are added there,
 * models are chosen here. What is pinned is that it offers only what the key
 * actually reaches — a picker that let you name a model the provider has never
 * heard of would move the failure to the next thing you said.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import ModelPicker from "~/chat/model-picker";
import type { ProviderSettings } from "~/lib/types";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const settings: ProviderSettings = {
  available: [
    { id: "anthropic", label: "Anthropic", default_model: "claude-opus-5" },
    { id: "openrouter", label: "OpenRouter", default_model: "openai/gpt-5.1" },
  ],
  configured: [
    {
      provider: "anthropic",
      label: "Anthropic",
      key_hint: "9f2c",
      models: ["claude-opus-5", "claude-sonnet-5"],
      models_fetched_at: null,
    },
    {
      provider: "openrouter",
      label: "OpenRouter",
      key_hint: "4d1a",
      models: ["deepseek/deepseek-v4-flash", "openai/gpt-5.1"],
      models_fetched_at: null,
    },
  ],
  active: { provider: "anthropic", model: "claude-sonnet-5" },
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount(provider: ProviderSettings, onChoose = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  // A router only because the empty state links to /settings; nothing here
  // navigates.
  const router = createMemoryRouter(
    [{ path: "/", Component: () => <ModelPicker provider={provider} onChoose={onChoose} /> }],
    { initialEntries: ["/"] },
  );
  const root = createRoot(container);
  act(() => {
    root.render(<RouterProvider router={router} />);
  });
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return {
    onChoose,
    providers: () =>
      container.querySelector<HTMLSelectElement>('select[aria-label="Provider"]'),
    models: () => container.querySelector<HTMLSelectElement>('select[aria-label="Model"]'),
    options: (select: HTMLSelectElement) => [...select.options].map(o => o.value),
    text: () => container.textContent ?? "",
  };
}

test("only providers with a key on file are offered", () => {
  const one = {
    ...settings,
    configured: settings.configured.slice(0, 1),
    active: { provider: "anthropic", model: "claude-sonnet-5" },
  };
  const picker = mount(one);

  expect(picker.options(picker.providers()!)).toEqual(["anthropic"]);
});

test("the models offered are the ones that provider's key can reach", () => {
  const picker = mount(settings);

  expect(picker.options(picker.models()!)).toEqual([
    "claude-opus-5",
    "claude-sonnet-5",
  ]);
});

test("the active choice is what is shown", () => {
  const picker = mount(settings);

  expect(picker.models()!.value).toBe("claude-sonnet-5");
});

test("choosing a model reports both halves", async () => {
  const picker = mount(settings);
  const select = picker.models()!;

  await act(async () => {
    select.value = "claude-opus-5";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Both, always together: the backend has to check the model against the key
  // it belongs to, and a model alone does not say which key that is.
  expect(picker.onChoose).toHaveBeenCalledWith("anthropic", "claude-opus-5");
});

test("switching provider moves to a model that provider actually has", async () => {
  const picker = mount(settings);
  const select = picker.providers()!;

  await act(async () => {
    select.value = "openrouter";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  // Anthropic's model would be a 422 at the other provider, so the switch
  // carries a model from the new catalogue rather than the old selection.
  expect(picker.onChoose).toHaveBeenCalledWith(
    "openrouter",
    "deepseek/deepseek-v4-flash",
  );
});

test("with no key on file it points at settings instead of an empty picker", () => {
  const picker = mount({ ...settings, configured: [], active: null });

  expect(picker.models()).toBeNull();
  expect(picker.text()).toContain("Add a key");
});
