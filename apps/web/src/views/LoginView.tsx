import { useState } from "react";
import { Login } from "@panki/contracts";
import { api, type Me } from "../api";
import { Button } from "../components/Button";
import { Form } from "../components/Form";
import { Icon } from "../components/Icon";
import { TextField } from "../components/TextField";

/** What a field says when it's wrong. One home. */
const MESSAGES = {
  name: "Type your name.",
  nameLong: "Keep the name under 40 characters.",
  nameChars: "Letters, digits, dots, dashes and underscores only.",
  password: "Type your password.",
};

type Props = {
  onSignedIn: (me: Me) => void;
};

/** The sign-in screen: a name and a password, the API's answer in the app's words. The browser's password manager may fill it. */
export function LoginView({ onSignedIn }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = Login.safeParse({ name, password });
    if (!parsed.success) {
      let nameProblem: string | undefined;
      let passwordProblem: string | undefined;
      for (const issue of parsed.error.issues) {
        const [head] = issue.path;
        if (head === "name") nameProblem ??= issue.code === "too_small" ? MESSAGES.name : issue.code === "too_big" ? MESSAGES.nameLong : MESSAGES.nameChars;
        else if (head === "password") passwordProblem ??= MESSAGES.password;
      }
      setNameError(nameProblem);
      setPasswordError(passwordProblem);
      document.getElementById(nameProblem ? "login-name" : "login-password")?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      onSignedIn(await api.login(parsed.data));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel signin" aria-labelledby="signin-title">
      <h1 id="signin-title" className="signin-title">
        Sign in
      </h1>
      <Form onSubmit={submit} className="add-form">
        <TextField
          id="login-name"
          label="Name"
          autoComplete="username"
          autoFocus
          value={name}
          onChange={(value) => {
            setName(value);
            if (nameError) setNameError(undefined);
          }}
          error={nameError}
        />
        <TextField
          id="login-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            if (passwordError) setPasswordError(undefined);
          }}
          error={passwordError}
        />
        <div className="add-actions">
          {failure ? (
            <span className="form-failure" role="alert">
              {failure}
            </span>
          ) : null}
          <Button id="login-go" type="submit" variant="primary" disabled={busy}>
            <Icon name="signIn" />
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </Form>
    </section>
  );
}
