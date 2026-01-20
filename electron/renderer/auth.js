/**
 * Simple authentication service for Electron app
 */

class AuthService {
    constructor() {
        this.token = null;
        this.user = null;
    }

    /**
     * Login with username and password
     */
    async login(serverUrl, username, password) {
        try {
            console.log('[AUTH] Attempting login to:', `${serverUrl}/api/auth/login`);
            const response = await fetch(`${serverUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            console.log('[AUTH] Login response status:', response.status);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Login failed');
            }

            const data = await response.json();
            console.log('[AUTH] Login response data:', { ...data, token: '***' });

            this.token = data.token;
            this.user = data.user;

            // Store in localStorage for persistence
            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('auth_user', JSON.stringify(this.user));

            console.log('[AUTH] Token and user stored in localStorage');

            return { success: true, user: this.user };
        } catch (error) {
            console.error('[AUTH] Login error:', error);
            throw error;
        }
    }

    /**
     * Register new user
     */
    async register(serverUrl, username, password, email) {
        try {
            const response = await fetch(`${serverUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password, email }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Registration failed');
            }

            const data = await response.json();
            return { success: true, message: data.message };
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    /**
     * Logout
     */
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
    }

    /**
     * Check if authenticated
     */
    isAuthenticated() {
        return !!this.token;
    }

    /**
     * Get authorization header
     */
    getAuthHeader() {
        return this.token ? `Bearer ${this.token}` : '';
    }

    /**
     * Load token from localStorage
     */
    loadFromStorage() {
        const token = localStorage.getItem('auth_token');
        const user = localStorage.getItem('auth_user');

        console.log('[AUTH] Loading from storage:', { hasToken: !!token, hasUser: !!user });

        if (token && user) {
            this.token = token;
            this.user = JSON.parse(user);
            console.log('[AUTH] Loaded user from storage:', this.user);
            return true;
        }
        console.log('[AUTH] No stored credentials found');
        return false;
    }

    /**
     * Fetch with authentication
     */
    async authenticatedFetch(url, options = {}) {
        const headers = {
            ...options.headers,
            'Authorization': this.getAuthHeader(),
        };

        return fetch(url, {
            ...options,
            headers,
        });
    }
}

// Export singleton instance
const authService = new AuthService();
