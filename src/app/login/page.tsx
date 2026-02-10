"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clientAuth } from "@/lib/client-auth";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // If already authenticated, redirect to home
    if (clientAuth.isAuthenticated()) {
      router.push("/");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const result = isLogin
        ? await clientAuth.login(username, password)
        : await clientAuth.register(username, password);

      if (result.success) {
        console.log("[LOGIN PAGE] Authentication successful, redirecting...");
        router.push("/");
      } else {
        setError(result.message || "Authentication failed");
      }
    } catch (err) {
      console.error("[LOGIN PAGE] Error:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen app-shell font-mono flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Cyberpunk header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 text-accent-strong glitch-text">
            CMD_EXECUTOR
          </h1>
          <div className="text-sm text-secondary">
            &gt;&gt; DISTRIBUTED COMMAND EXECUTION SYSTEM &lt;&lt;
          </div>
        </div>

        {/* Auth form */}
        <div className="auth-card p-8">
          <div className="flex mb-6">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError("");
                setConfirmPassword("");
              }}
              className={`auth-tab auth-tab-inactive flex-1 pb-2 text-center transition-colors ${
                isLogin ? "auth-tab-active" : ""
              }`}
            >
              LOGIN
            </button>
            <button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setError("");
              }}
              className={`auth-tab auth-tab-inactive flex-1 pb-2 text-center transition-colors ${
                !isLogin ? "auth-tab-active" : ""
              }`}
            >
              REGISTER
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="status status-error px-4 py-3">{error}</div>
            )}

            <div>
              <label className="block text-sm mb-2 text-silver">USERNAME</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full input-surface px-4 py-2"
                placeholder="Enter username"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm mb-2 text-silver">PASSWORD</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full input-surface px-4 py-2"
                placeholder="Enter password"
                disabled={loading}
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm mb-2 text-silver">
                  CONFIRM PASSWORD
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full input-surface px-4 py-2"
                  placeholder="Confirm password"
                  disabled={loading}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full glaze-button py-3 font-semibold"
            >
              {loading ? "PROCESSING..." : isLogin ? "LOGIN" : "REGISTER"}
            </button>
          </form>
        </div>

        {/* System info */}
        <div className="mt-6 text-center text-xs text-secondary">
          <div>&gt; SECURE AUTHENTICATION REQUIRED</div>
          <div>&gt; ALL CONNECTIONS ENCRYPTED</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes glitch {
          0% {
            text-shadow:
              2px 2px #9fc7ff,
              -2px -2px #c5cedb;
          }
          25% {
            text-shadow:
              -2px 2px #9fc7ff,
              2px -2px #c5cedb;
          }
          50% {
            text-shadow:
              2px -2px #9fc7ff,
              -2px 2px #c5cedb;
          }
          75% {
            text-shadow:
              -2px -2px #9fc7ff,
              2px 2px #c5cedb;
          }
          100% {
            text-shadow:
              2px 2px #9fc7ff,
              -2px -2px #c5cedb;
          }
        }
        .glitch-text {
          animation: glitch 0.5s infinite;
        }
      `}</style>
    </div>
  );
}
