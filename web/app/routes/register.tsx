import { Form, Link, redirect, useNavigation } from "react-router";

import { ApiError, api } from "~/lib/api.server";
import { commitToken, getToken } from "~/lib/session.server";
import type { Route } from "./+types/register";

export function meta() {
  return [{ title: "Create an account — Restyle" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  if (await getToken(request)) throw redirect("/");
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const inviteCode = String(formData.get("invite_code") ?? "").trim();

  // Checked here as well as by the backend so the reader is told before the
  // round trip, and told the same thing either way.
  if (password.length < 12) {
    return { error: "Password must be at least 12 characters." };
  }

  try {
    const { access_token } = await api.register({
      username: username || email.split("@")[0],
      email,
      password,
      invite_code: inviteCode,
    });
    return redirect("/", { headers: { "Set-Cookie": await commitToken(access_token) } });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: error.detail };
    }
    throw error;
  }
}

const field =
  "mt-1 w-full border-b border-ink/15 bg-transparent py-2 outline-none focus:border-ink/40";

export default function Register({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.formAction === "/register";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-4xl">Restyle</h1>
      <p className="mt-2 text-sm text-ink/60">
        Registration is invite-only. You will need a code.
      </p>

      <Form method="post" className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm text-ink/60">Invite code</span>
          <input name="invite_code" required autoFocus className={field} />
        </label>

        <label className="block">
          <span className="text-sm text-ink/60">Email</span>
          <input type="email" name="email" autoComplete="username" required className={field} />
        </label>

        <label className="block">
          <span className="text-sm text-ink/60">
            Name <span className="text-ink/40">(optional)</span>
          </span>
          <input name="username" autoComplete="nickname" className={field} />
        </label>

        <label className="block">
          <span className="text-sm text-ink/60">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={12}
            className={field}
          />
          <span className="mt-1 block text-xs text-ink/40">
            At least 12 characters. A phrase beats a short word with a symbol in it.
          </span>
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
          {submitting ? "Creating your account…" : "Create account"}
        </button>
      </Form>

      <Link to="/login" className="mt-6 text-sm text-ink/60 underline">
        Already have an account? Sign in
      </Link>
    </main>
  );
}
