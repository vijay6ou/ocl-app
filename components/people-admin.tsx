"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { api } from "@/lib/api";
import type { PublicUser, Role } from "@/lib/types";

export function PeopleAdmin() {
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("technician");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ users: PublicUser[] }>("/api/users");
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load people.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ username, name, role, password, pin }),
      });
      toast.success(`${name} can now sign in.`);
      setUsername("");
      setName("");
      setPassword("");
      setPin("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add this person.");
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
      return false;
    }
  }

  async function remove(user: PublicUser) {
    if (!confirm(`Remove ${user.name} (${user.username})?`)) return;
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      toast.success("Account removed.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove this account.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">People</h1>
        <p className="text-sm text-muted-foreground">
          One account per person. The name on the account is printed on every report. Each person
          needs a 4-digit PIN to submit a round.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a person</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={create}>
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="technician">Technician</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Temporary password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin">4-digit PIN</Label>
              <Input
                id="pin"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                required
                placeholder="Required for submit"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Create account</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading ? <LoadingState label="Loading accounts…" /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && users && users.length === 0 ? (
        <EmptyState title="No accounts" message="Add an admin or technician to start logging." />
      ) : null}

      <div className="space-y-2">
        {users?.map((person) => (
          <div
            key={person.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{person.name}</span>
                <Badge variant="outline">{person.role}</Badge>
                <Badge variant={person.pinSet ? "secondary" : "destructive"}>
                  {person.pinSet ? "PIN set" : "No PIN"}
                </Badge>
                {!person.active ? <Badge variant="destructive">Inactive</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">{person.username}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void patch(person.id, { active: !person.active })}
              >
                {person.active ? "Deactivate" : "Reactivate"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = prompt("New password (min 8 characters)");
                  if (next) void patch(person.id, { password: next });
                }}
              >
                Reset password
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = prompt("New 4-digit PIN");
                  const pin = (next ?? "").replace(/\D/g, "").slice(0, 4);
                  if (pin.length !== 4) {
                    if (next) toast.error("PIN must be exactly 4 digits.");
                    return;
                  }
                  void patch(person.id, { pin }).then((ok) => {
                    if (ok) toast.success("PIN updated.");
                  });
                }}
              >
                Reset PIN
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void remove(person)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
