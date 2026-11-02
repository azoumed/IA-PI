import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { switchLocale } from "@/app/actions";
import { LOCALE_COOKIE } from "@/lib/i18n";

async function switchAnonymous(form: FormData) {
  "use server";
  const locale = form.get("locale") === "ar" ? "ar" : "fr";
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 3600 });
  revalidatePath("/", "layout");
}

export function LangToggle({ locale, label, anonymous }: { locale: "fr" | "ar"; label: string; anonymous?: boolean }) {
  return (
    <form action={anonymous ? switchAnonymous : switchLocale}>
      <input type="hidden" name="locale" value={locale === "ar" ? "fr" : "ar"} />
      <button className="rounded-md border border-border px-2 py-1 text-sm hover:bg-primary-soft" lang={locale === "ar" ? "fr" : "ar"}>
        {label}
      </button>
    </form>
  );
}
