import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Email OTP sign-in is no longer available. Kaneo only supports username +
 * password login, so this legacy page redirects to sign-in.
 */
export const Route = createFileRoute("/auth/verify-otp")({
  component: VerifyOtp,
});

function VerifyOtp() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/auth/sign-in", replace: true });
  }, [navigate]);

  return null;
}
