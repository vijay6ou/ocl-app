"use client";

import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/states";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Checking admin access…" />;
  if (!user) return <ErrorState title="Sign in required" message="This screen is only for signed-in electrical staff." />;
  if (user.role !== "admin") {
    return (
      <ErrorState
        title="Admin only"
        message="Technicians can log rounds and search their own records. Catalogue and people are managed by an electrical admin."
      />
    );
  }
  return <>{children}</>;
}
