import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Self-service registration is not available. User accounts are created by an
 * administrator, so any attempt to reach the sign-up page is redirected to
 * sign-in.
 */
export const Route = createFileRoute("/auth/sign-up")({
  component: SignUp,
});

function SignUp() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/auth/sign-in", replace: true });
  }, [navigate]);

  return null;
}
