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
    <div className="min-h-screen bg-black text-cyan-400 font-mono flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Cyberpunk header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 text-cyan-400 glitch-text">
            CMD_EXECUTOR
          </h1>
          <div className="text-sm text-cyan-600">
            &gt;&gt; DISTRIBUTED COMMAND EXECUTION SYSTEM &lt;&lt;
          </div>
        </div>

        {/* Auth form */}
        <div className="bg-gray-900 border-2 border-cyan-500 rounded-lg p-8 shadow-lg shadow-cyan-500/20">
          <div className="flex mb-6 border-b border-cyan-800">
            <button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setError("");
                setConfirmPassword("");
              }}
              className={`flex-1 pb-2 text-center transition-colors ${
                isLogin
                  ? "border-b-2 border-cyan-400 text-cyan-400"
                  : "text-cyan-700 hover:text-cyan-500"
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
              className={`flex-1 pb-2 text-center transition-colors ${
                !isLogin
                  ? "border-b-2 border-cyan-400 text-cyan-400"
                  : "text-cyan-700 hover:text-cyan-500"
              }`}
            >
              REGISTER
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-900/30 border border-red-500 text-red-400 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm mb-2 text-cyan-400">
                USERNAME
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black border-2 border-cyan-700 rounded px-4 py-2 text-cyan-400 focus:outline-none focus:border-cyan-400 transition-colors"
                placeholder="Enter username"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm mb-2 text-cyan-400">
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border-2 border-cyan-700 rounded px-4 py-2 text-cyan-400 focus:outline-none focus:border-cyan-400 transition-colors"
                placeholder="Enter password"
                disabled={loading}
              />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm mb-2 text-cyan-400">
                  CONFIRM PASSWORD
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-black border-2 border-cyan-700 rounded px-4 py-2 text-cyan-400 focus:outline-none focus:border-cyan-400 transition-colors"
                  placeholder="Confirm password"
                  disabled={loading}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-black font-bold py-3 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "PROCESSING..." : isLogin ? "LOGIN" : "REGISTER"}
            </button>
          </form>
        </div>

        {/* System info */}
        <div className="mt-6 text-center text-xs text-cyan-800">
          <div>&gt; SECURE AUTHENTICATION REQUIRED</div>
          <div>&gt; ALL CONNECTIONS ENCRYPTED</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes glitch {
          0% {
            text-shadow:
              2px 2px #ff00de,
              -2px -2px #00fff9;
          }
          25% {
            text-shadow:
              -2px 2px #ff00de,
              2px -2px #00fff9;
          }
          50% {
            text-shadow:
              2px -2px #ff00de,
              -2px 2px #00fff9;
          }
          75% {
            text-shadow:
              -2px -2px #ff00de,
              2px 2px #00fff9;
          }
          100% {
            text-shadow:
              2px 2px #ff00de,
              -2px -2px #00fff9;
          }
        }
        .glitch-text {
          animation: glitch 0.5s infinite;
        }
      `}</style>
    </div>
  );
}
