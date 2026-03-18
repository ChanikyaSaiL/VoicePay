import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

const API_BASE = 'http://127.0.0.1:5005';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('vp_token'));
    const [isLoading, setIsLoading] = useState(true); // loading state while re-hydrating

    // On mount: if we have a stored token, re-fetch user data from the API 
    // This ensures balance and transactions are always fresh from MongoDB
    useEffect(() => {
        const restoreSession = async () => {
            const storedToken = localStorage.getItem('vp_token');
            if (!storedToken) {
                setIsLoading(false);
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/api/auth/me`, {
                    headers: { 'x-auth-token': storedToken }
                });
                if (res.ok) {
                    const userData = await res.json();
                    setUser(userData);
                } else {
                    // Token is expired or invalid – clear it
                    localStorage.removeItem('vp_token');
                    setUser(null);
                }
            } catch {
                // Server unreachable, clear stale session
                localStorage.removeItem('vp_token');
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };
        restoreSession();
    }, []);

    const login = (userData, newToken) => {
        setUser(userData);
        if (newToken) {
            localStorage.setItem('vp_token', newToken);
            setToken(newToken);
        } else {
            // Called for in-memory updates (e.g., after payment) – just update the user object
            setUser(userData);
        }
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('vp_token');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, token, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
