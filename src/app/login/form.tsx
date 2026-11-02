"use client";

import { useActionState } from "react";
import { login } from "@/app/actions";

export function LoginForm({ labels }: { labels: { email: string; password: string; submit: string; error: string } }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email">{labels.email}</label>
        <input id="email" name="email" type="email" autoComplete="username" required dir="ltr" defaultValue={state?.email ?? ""} key={state?.email} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password">{labels.password}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </div>
      {state?.error && <p className="text-sm text-danger">{labels.error}</p>}
      <button disabled={pending} className="rounded-md bg-primary px-4 py-2 font-medium text-white disabled:opacity-50">
        {labels.submit}
      </button>
    </form>
  );
}
