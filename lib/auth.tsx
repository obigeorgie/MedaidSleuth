import React, { createContext, useContext, useMemo, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/query-client";

interface AuthUser {
  id: string;
  username: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loginError: string | null;
  registerError: string | null;
  isLoggingIn: boolean;
  isRegistering: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const userQuery = useQuery<AuthUser | null>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: Infinity,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/login", { username, password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/register", { username, password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.invalidateQueries();
    },
  });

  const login = async (username: string, password: string) => {
    loginMutation.reset();
    await loginMutation.mutateAsync({ username, password });
  };

  const register = async (username: string, password: string) => {
    registerMutation.reset();
    await registerMutation.mutateAsync({ username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const loginError = loginMutation.error
    ? (loginMutation.error as any)?.message?.includes("401")
      ? "Invalid username or password"
      : "Login failed. Please try again."
    : null;

  const registerError = registerMutation.error
    ? (registerMutation.error as any)?.message?.includes("409")
      ? "Username already taken"
      : (registerMutation.error as any)?.message?.includes("400")
      ? "Username (3+ chars) and password (6+ chars) required"
      : "Registration failed. Please try again."
    : null;

  const value = useMemo(
    () => ({
      user: userQuery.data ?? null,
      isLoading: userQuery.isLoading,
      login,
      register,
      logout,
      loginError,
      registerError,
      isLoggingIn: loginMutation.isPending,
      isRegistering: registerMutation.isPending,
    }),
    [
      userQuery.data,
      userQuery.isLoading,
      loginMutation.isPending,
      loginMutation.error,
      registerMutation.isPending,
      registerMutation.error,
      logoutMutation.isPending,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
