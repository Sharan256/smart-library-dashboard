import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);

const DEMO_USERS = {
  student: {
    username: 'student',
    password: 'student123',
    role: 'student',
    name: 'Student User',
  },
  assistant: {
    username: 'assistant',
    password: 'assistant123',
    role: 'assistant',
    name: 'Library Assistant',
  },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('smart-library-auth');
    if (saved) {
      setUser(JSON.parse(saved));
    }
  }, []);

  const login = (username, password, role) => {
    const match = Object.values(DEMO_USERS).find(
      (item) => item.username === username && item.password === password && item.role === role
    );

    if (!match) {
      throw new Error('Invalid credentials for the selected role.');
    }

    localStorage.setItem('smart-library-auth', JSON.stringify(match));
    setUser(match);
    return match;
  };

  const logout = () => {
    localStorage.removeItem('smart-library-auth');
    setUser(null);
  };

  const value = useMemo(() => ({ user, login, logout, demoUsers: DEMO_USERS }), [user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
