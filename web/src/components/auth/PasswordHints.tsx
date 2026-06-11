import { Check, Circle } from "lucide-react";

// Mirrors backend/app/schemas.py::_validate_password_strength EXACTLY:
// 8–128 characters, and at least two of: lowercase, uppercase, number, symbol.
// Keep these in sync - the hints must never pass what the backend rejects.
const CLASSES = [
  { label: "lowercase", re: /[a-z]/ },
  { label: "uppercase", re: /[A-Z]/ },
  { label: "number", re: /\d/ },
  { label: "symbol", re: /[^A-Za-z0-9]/ },
] as const;

export function classesPassed(pw: string): number {
  return CLASSES.filter((c) => c.re.test(pw)).length;
}

export function passwordOk(pw: string): boolean {
  return pw.length >= 8 && pw.length <= 128 && classesPassed(pw) >= 2;
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-start gap-1.5 ${ok ? "text-moss" : "text-ink-soft"}`}>
      {ok ? (
        <Check aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      ) : (
        <Circle aria-hidden className="mt-0.5 size-3.5 shrink-0 opacity-50" />
      )}
      <span>{children}</span>
    </li>
  );
}

/** Live password-policy checklist; updates as the user types. */
export function PasswordHints({ password }: { password: string }) {
  const lengthOk = password.length >= 8 && password.length <= 128;
  return (
    <ul className="space-y-1 text-xs">
      <Rule ok={lengthOk}>8–128 characters</Rule>
      <Rule ok={classesPassed(password) >= 2}>
        at least two of:{" "}
        {CLASSES.map((c, i) => (
          <span key={c.label} className={c.re.test(password) ? "font-medium text-moss" : ""}>
            {c.label}
            {i < CLASSES.length - 1 ? ", " : ""}
          </span>
        ))}
      </Rule>
    </ul>
  );
}
