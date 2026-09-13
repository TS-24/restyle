import { Form, Link, redirect, useNavigation } from "react-router";

import { ApiError, api } from "~/lib/api.server";
import { commitToken } from "~/lib/session.server";
import type { Route } from "./+types/reset-password";

export function meta() {
  return [{ title: "Set a new password — Restyle" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // The token rides in the query string of the link the superuser handed over.
  // No session check on purpose: the whole point is that whoever opens this
  // cannot sign in, and someone still signed in elsewhere may reset from here
  // too.
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return { token };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  // Checked here as well as by the backend so the reader is told before the
  // round trip, and told the same thing either way — as register.tsx does.
  if (password.length < 12) {
    return { error: "Password must be at least 12 characters." };
  }
  if (password !== confirm) {
    return { error: "Those two passwords don't match." };
  }

  try {
    const { access_token } = await api.resetPassword(token, password);
    return redirect("/", { headers: { "Set-Cookie": await commitToken(access_token) } });
  } catch (error) {
    // A 400 for a spent or expired link lands here. It is not a 401, precisely
    // so that it does, rather than becoming a redirect to /login.
    if (error instanceof ApiError) return { error: error.detail };
    throw error;
  }
}

const FIELD =
  "mt-1 w-full border-b border-ink/15 bg-transparent py-2 outline-none focus:border-ink/40";

export default function ResetPassword({ loaderData, actionData }: Route.ComponentProps) {
  const { token } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-4xl">Restyle</h1>

      {token ? (
        <>
          <p className="mt-2 text-sm text-ink/60">Choose a new password.</p>

          <Form method="post" className="mt-8 space-y-4">
            <input type="hidden" name="token" value={token} />

            <label className="block">
              <span className="text-sm text-ink/60">New password</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={12}
                autoFocus
                className={FIELD}
              />
              <span className="mt-1 block text-xs text-ink/40">
                At least 12 characters. A phrase beats a short word with a symbol in it.
              </span>
            </label>

            <label className="block">
              <span className="text-sm text-ink/60">Confirm password</span>
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                required
                minLength={12}
                className={FIELD}
              />
            </label>

            {actionData?.error ? (
              <p role="alert" className="text-sm text-danger">
                {actionData.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full border border-ink/15 py-2 text-sm transition-colors hover:bg-ink/5 disabled:opacity-50"
            >
              {submitting ? "Setting…" : "Set new password"}
            </button>
          </Form>

          <Link to="/login" className="mt-6 text-sm text-ink/60 underline">
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm text-ink/70" role="alert">
            This link is missing its token. Ask for a new one.
          </p>
          <Link to="/login" className="mt-6 text-sm text-ink/60 underline">
            Back to sign in
          </Link>
        </>
      )}
    </main>
  );
}
