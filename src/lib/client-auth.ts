/**
 * Client-side authentication utility for Next.js frontend
 */

export interface User {
  id: string;
  username: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  message?: string;
}

class ClientAuthService {
  private token: string | null = null;
  private user: User | null = null;
  private tokenKey = "auth_token";
  private userKey = "auth_user";

  constructor() {
    if (typeof window !== "undefined") {
      this.loadFromStorage();
    }
  }

  private loadFromStorage(): void {
    try {
      this.token = localStorage.getItem(this.tokenKey);
      const userStr = localStorage.getItem(this.userKey);
      if (userStr) {
        this.user = JSON.parse(userStr);
      }
      console.log("[CLIENT-AUTH] Loaded from storage:", {
        hasToken: !!this.token,
        user: this.user,
      });
    } catch (error) {
      console.error("[CLIENT-AUTH] Error loading from storage:", error);
    }
  }

  async register(username: string, password: string): Promise<AuthResponse> {
    try {
      console.log("[CLIENT-AUTH] Registering user:", username);
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      console.log("[CLIENT-AUTH] Register response:", {
        status: response.status,
        success: data.success,
      });

      if (data.success && data.token) {
        this.setAuth(data.token, data.user);
      }

      return data;
    } catch (error) {
      console.error("[CLIENT-AUTH] Register error:", error);
      return { success: false, message: "Network error" };
    }
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    try {
      console.log("[CLIENT-AUTH] Logging in user:", username);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      console.log("[CLIENT-AUTH] Login response:", {
        status: response.status,
        success: data.success,
      });

      if (data.success && data.token) {
        this.setAuth(data.token, data.user);
      }

      return data;
    } catch (error) {
      console.error("[CLIENT-AUTH] Login error:", error);
      return { success: false, message: "Network error" };
    }
  }

  async logout(): Promise<void> {
    try {
      console.log("[CLIENT-AUTH] Logging out");
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: this.getAuthHeaders(),
      });
    } catch (error) {
      console.error("[CLIENT-AUTH] Logout error:", error);
    } finally {
      this.clearAuth();
    }
  }

  private setAuth(token: string, user: User): void {
    this.token = token;
    this.user = user;
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
    console.log("[CLIENT-AUTH] Auth saved to storage");
  }

  private clearAuth(): void {
    this.token = null;
    this.user = null;
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    console.log("[CLIENT-AUTH] Auth cleared from storage");
  }

  getAuthHeaders(): Record<string, string> {
    if (this.token) {
      return {
        Authorization: `Bearer ${this.token}`,
      };
    }
    return {};
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getToken(): string | null {
    return this.token;
  }

  getUser(): User | null {
    return this.user;
  }
}

// Create singleton instance
export const clientAuth = new ClientAuthService();
