"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { User } from "../lib/types";
import { TableSelector } from "./TableSelector";

export function AdminPanel({
  adminUser,
  users,
  onRefresh,
  onViewDashboard,
}: {
  adminUser: User;
  users: User[];
  onRefresh: () => Promise<void>;
  onViewDashboard: (userId: number) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAdmin, setNewAdmin] = useState(false);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim() || creating) return;
    setCreating(true);
    setMessage("Creating profile...");
    try {
      await api<User>(`/admin/${adminUser.id}/users`, {
        method: "POST",
        body: JSON.stringify({ name: newName, password: newPassword || null, is_admin: newAdmin }),
      });
      setNewName("");
      setNewPassword("");
      setNewAdmin(false);
      await onRefresh();
      setMessage("Profile created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile could not be created.");
    } finally {
      setCreating(false);
    }
  }

  function downloadBackup() {
    window.open(`/backend-api/admin/${adminUser.id}/backup`, "_blank", "noopener,noreferrer");
  }

  function exportProgress() {
    window.open(`/backend-api/admin/${adminUser.id}/progress.csv`, "_blank", "noopener,noreferrer");
  }

  function exportEvaluation() {
    window.open(`/backend-api/admin/${adminUser.id}/evaluation.csv`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="adminPanel">
      <div className="adminHeader">
        <div><h2>User management</h2><p className="quiet">Create profiles, reset passcodes, and manage local access.</p></div>
        <span>{users.length} profiles</span>
      </div>
      <div className="adminExportActions">
        <button type="button" className="secondaryButton" onClick={downloadBackup}>Download backup</button>
        <button type="button" className="secondaryButton" onClick={exportProgress}>Export progress CSV</button>
        <button type="button" className="secondaryButton" onClick={exportEvaluation}>Export evaluation CSV</button>
      </div>
      <form className="adminCreate" onSubmit={createUser}>
        <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Profile name" />
        <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New passcode" type="password" />
        <label className="toggleRow"><input type="checkbox" checked={newAdmin} onChange={(event) => setNewAdmin(event.target.checked)} />Admin</label>
        <button type="submit" disabled={creating}>{creating ? "Creating..." : "Create"}</button>
      </form>
      <div className="adminUserList">
        {users.map((user) => <AdminUserRow key={user.id} adminUser={adminUser} user={user} onRefresh={onRefresh} onViewDashboard={onViewDashboard} />)}
      </div>
      {message && <p className="feedback">{message}</p>}
    </section>
  );
}

function AdminUserRow({
  adminUser,
  user,
  onRefresh,
  onViewDashboard,
}: {
  adminUser: User;
  user: User;
  onRefresh: () => Promise<void>;
  onViewDashboard: (userId: number) => void;
}) {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [requiredTables, setRequiredTables] = useState(user.required_tables || []);

  useEffect(() => {
    setName(user.name);
    setIsAdmin(user.is_admin);
    setRequiredTables(user.required_tables || []);
  }, [user]);

  async function save() {
    await api<User>(`/admin/${adminUser.id}/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, is_admin: isAdmin, password: password || undefined }),
    });
    await api<User>(`/admin/${adminUser.id}/users/${user.id}/required-tables`, {
      method: "PUT",
      body: JSON.stringify({ tables: requiredTables }),
    });
    setPassword("");
    await onRefresh();
  }

  async function resetProgress() {
    if (!window.confirm(`Reset progress for ${user.name}? Creature XP, energy, attempts, and dashboard history will restart.`)) return;
    await api(`/admin/${adminUser.id}/users/${user.id}/reset-progress`, { method: "POST" });
    await onRefresh();
  }

  async function deleteUser() {
    if (!window.confirm(`Delete ${user.name}? This removes the profile and all progress.`)) return;
    await api(`/admin/${adminUser.id}/users/${user.id}`, { method: "DELETE" });
    await onRefresh();
  }

  return (
    <div className="adminUserRow">
      <div className="adminUserMeta"><strong>{user.name}</strong><span>{user.is_admin ? "Admin" : "Learner"} · {user.password_set ? "Passcode set" : "No passcode"}</span></div>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} aria-label={`Rename ${user.name}`} /></label>
      <label>Passcode<input value={password} onChange={(event) => setPassword(event.target.value)} placeholder={user.password_set ? "Reset passcode" : "Set passcode"} type="password" /></label>
      <label className="toggleRow adminToggle"><input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />Admin</label>
      <div className="adminRequiredTables">
        <span>Required tables</span>
        <TableSelector selected={requiredTables} onChange={setRequiredTables} label={`Required tables for ${user.name}`} allowEmpty />
        <small>The learner can add other tables, but cannot remove these.</small>
      </div>
      <div className="adminRowActions">
        <button type="button" className="secondaryButton" onClick={() => onViewDashboard(user.id)}>View dashboard</button>
        <button type="button" onClick={save}>Save</button>
        <button type="button" className="secondaryButton" onClick={resetProgress}>Reset progress</button>
        <button type="button" className="dangerButton" onClick={deleteUser} disabled={user.id === adminUser.id}>Delete</button>
      </div>
    </div>
  );
}
