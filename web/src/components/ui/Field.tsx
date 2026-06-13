// Form primitives. React 19: `ref` is a normal prop, so React.ComponentProps<"input">
// (which includes ref) + spread replaces forwardRef.
//
// Field contract: pass `htmlFor` AND give the control a matching `id` to wire the
// label. When showing `error`, also set `aria-invalid` (and `aria-describedby` if
// you give the error an id) on the control - Field renders the text only.

const control =
  "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-ink/60 disabled:opacity-50";

export function Label({ className = "", ...rest }: React.ComponentProps<"label">) {
  return <label className={`block text-sm font-medium text-ink ${className}`} {...rest} />;
}

export function Input({ className = "", ...rest }: React.ComponentProps<"input">) {
  return <input className={`${control} ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: React.ComponentProps<"textarea">) {
  return <textarea className={`${control} ${className}`} {...rest} />;
}

export function Select({ className = "", ...rest }: React.ComponentProps<"select">) {
  return <select className={`${control} ${className}`} {...rest} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  warn,
  required = false,
  className = "",
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  warn?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`group/field space-y-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-terracotta">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-rust">{error}</p>
      ) : (
        <>
          {/* Max-reached note: only while the field is focused (hidden on blur). */}
          {warn && (
            <p className="hidden text-xs text-amber-deep group-focus-within/field:block">
              {warn}
            </p>
          )}
          {hint && (
            <p
              className={`text-xs text-ink-soft ${warn ? "group-focus-within/field:hidden" : ""}`}
            >
              {hint}
            </p>
          )}
        </>
      )}
    </div>
  );
}
