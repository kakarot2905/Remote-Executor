"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MultiNodeTerminal from "./components/MultiNodeTerminal";
import { clientAuth } from "@/lib/client-auth";

export default function Home() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check authentication on mount
    if (!clientAuth.isAuthenticated()) {
      console.log("[HOME] Not authenticated, redirecting to login");
      router.push("/login");
    } else {
      console.log("[HOME] Authenticated user:", clientAuth.getUser());
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, [router]);

  // Show loading or nothing while checking auth
  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen  app-shell flex items-center justify-center font-mono">
        <div className="text-center">
          <div className="text-2xl mb-2 text-accent-strong">
            AUTHENTICATING...
          </div>
          <div className="text-sm text-secondary">Please wait...</div>
        </div>
      </div>
    );
  }

  return (
    <main>
      <MultiNodeTerminal />
    </main>
  );
}
