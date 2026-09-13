import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";

import { ApiError, api } from "~/lib/api.server";
import { commitToken, getToken, safeRedirect } from "~/lib/session.server";
import type { Route } from "./+types/login";

export function meta() {
  return [{ title: "Sign in — Restyle" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Already signed in: there is nothing to do here.
  if (await getToken(request)) throw redirect("/");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeRedirect(String(formData.get("next") ?? ""), "/");

  try {
    const { access_token } = await api.login(email, password);
    return redirect(next, { headers: { "Set-Cookie": await commitToken(access_token) } });
  } catch (error) {
    if (error instanceof ApiError) {
      // The backend already answers identically for an unknown email and a
      // wrong password. Repeating its message keeps that true here.
      return { error: error.detail };
    }
    throw error;
  }
}

export default function Login({ actionData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const signingIn = navigation.formAction === "/login";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-4xl">Restyle</h1>
      <p className="mt-2 text-sm text-ink/60">Sign in to your notes.</p>

      {/*
        A real Form rather than the useFetcher pattern the rest of the app uses.
        Everything else is an in-place edit of something already on screen; this
        is a navigation, and it has to work before the page has hydrated.
      */}
      <Form method="post" className="mt-8 space-y-4">
        <input type="hidden" name="next" value={params.get("next") ?? "/"} />

        <label className="block">
          <span className="text-sm text-ink/60">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            autoFocus
            className="mt-1 w-full border-b border-ink/15 bg-transparent py-2 outline-none focus:border-ink/40"
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink/60">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full border-b border-ink/15 bg-transparent py-2 outline-none focus:border-ink/40"
          />
        </label>

        {actionData?.error ? (
          <p role="alert" className="text-sm text-danger">
            {actionData.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={signingIn}
          className="w-full border border-ink/15 py-2 text-sm transition-colors hover:bg-ink/5 disabled:opacity-50"
        >
          {signingIn ? "Signing in…" : "Sign in"}
        </button>
      </Form>

      <Link to="/register" className="mt-6 text-sm text-ink/60 underline">
        Have an invite code? Create an account
      </Link>
    </main>
  );
}
