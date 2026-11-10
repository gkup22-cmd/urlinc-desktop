// Desktop shim — always authenticated as the local user. No login/logout needed.
import { useState, useEffect } from "react";

export interface AuthUser {
  id: string;
  name: string;
  username?: string;
  profileImageUrl?: string | null;
  role?: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

const LOCAL_USER: AuthUser = {
  id: "local",
  name: "You",
  username: "local",
  profileImageUrl: null,
  role: "admin",
};

export function useAuth(): AuthState {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Brief tick so components see a loading flash then settle
    const t = setTimeout(() => setIsLoading(false), 50);
    return () => clearTimeout(t);
  }, []);

  return {
    user: isLoading ? null : LOCAL_USER,
    isLoading,
    isAuthenticated: !isLoading,
    login: () => {},
    logout: () => {},
  };
}
