import { create } from "zustand";
import { axiosInstance, setUnauthorizedHandler } from "../lib/axios";

const ORG_KEY = "clinsync-org";
const TOKEN_KEY = "clinsync-token";

// Restore the session on page load; without this a refresh logged the user out.
const storedOrg = () => {
    try {
        const raw = localStorage.getItem(ORG_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const persist = (org, token) => {
    if (org && token) {
        localStorage.setItem(ORG_KEY, JSON.stringify(org));
        localStorage.setItem(TOKEN_KEY, token);
    } else {
        localStorage.removeItem(ORG_KEY);
        localStorage.removeItem(TOKEN_KEY);
    }
};

const readError = (error) =>
    error.response?.data?.detail ??
    (error.response ? "Something went wrong. Please try again." : "Cannot reach the server.");

export const useAuthStore = create((set, get) => ({
    authOrg: storedOrg(),
    authError: null,
    isAuthLoading: false,

    logout: () => {
        persist(null, null);
        set({ authOrg: null, authError: null });
    },

    authenticate: async (endpoint, data) => {
        set({ isAuthLoading: true, authError: null });
        try {
            const response = await axiosInstance.post(endpoint, data);
            const { access_token: token, ...org } = response.data;
            persist(org, token);
            set({ authOrg: org, isAuthLoading: false });
            return true;
        } catch (error) {
            // Surface the reason instead of only logging it, so the form can
            // tell the user why the attempt failed.
            set({ authError: readError(error), isAuthLoading: false });
            return false;
        }
    },

    login: async (data) => get().authenticate("/login-org", data),

    signup: async (data) => get().authenticate("/signup-org", data),
}));

// An expired or invalid token clears the session.
setUnauthorizedHandler(() => useAuthStore.getState().logout());
