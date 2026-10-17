import type { FormEvent, FormHTMLAttributes, KeyboardEvent } from "react";

type Props = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit" | "noValidate" | "onKeyDown"> & {
  onSubmit: () => void;
};

/** The app's form: never the browser's validation bubbles. Each field says what's wrong in its own words. */
export function Form({ onSubmit, children, ...rest }: Props) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit();
  }
  // Enter sends a one-line field by itself; in a box of several lines it makes a new line, so Ctrl+Enter (⌘ on a Mac)
  // sends the form, and it does so from any field, as in every chat app.
  function handleKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.currentTarget.requestSubmit();
  }
  return (
    <form noValidate onSubmit={handleSubmit} onKeyDown={handleKeyDown} {...rest}>
      {children}
    </form>
  );
}
