"use client";

import { FormEvent, useState } from "react";

type Profile = {
  id: number;
  name: string;
  is_admin: boolean;
  password_set: boolean;
};

export function ProfileLogin({
  users,
  error,
  onLogin,
  name,
  password,
  onNameChange,
  onPasswordChange,
  onCreate
}: {
  users: Profile[];
  error: string;
  onLogin: (userId: number, password: string) => Promise<void>;
  name: string;
  password: string;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onCreate: (event: FormEvent) => Promise<void>;
}) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [passcode, setPasscode] = useState("");
  const selectedUser = users.find((user) => user.id === selectedUserId) || null;

  if (users.length === 0) {
    return (
      <section className="loginScreen panel">
        <p className="eyebrow">First-time setup</p>
        <h2>Create the parent profile</h2>
        <p>This first profile will manage learners, backups and settings.</p>
        <form className="loginForm" onSubmit={onCreate}>
          <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Parent name" autoComplete="name" />
          <input value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="Admin passcode (6+ characters)" type="password" autoComplete="new-password" minLength={6} required />
          <button type="submit">Create profile</button>
        </form>
      </section>
    );
  }

  return (
    <section className="loginScreen panel">
      <p className="eyebrow">Choose profile</p>
      <h2>Who is practising?</h2>
      <div className="profileChoices">
        {users.map((user) => (
          <button
            type="button"
            key={user.id}
            className={selectedUserId === user.id ? "active" : ""}
            onClick={() => {
              setSelectedUserId(user.id);
              setPasscode("");
            }}
          >
            <strong>{user.name}</strong>
            <span>{user.is_admin ? "Parent" : "Learner"}</span>
          </button>
        ))}
      </div>
      {selectedUser && (
        <form
          className="loginForm"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(selectedUser.id, passcode);
          }}
        >
          {selectedUser.password_set && (
            <input
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="Passcode"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
            />
          )}
          <button type="submit">Continue as {selectedUser.name}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
