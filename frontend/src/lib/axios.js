import axios from "axios"

export const axiosInstance = axios.create({
    // 127.0.0.1 rather than localhost: Vite serves the page over IPv6 (::1), so
    // "localhost" resolves to ::1 first and the IPv4-only backend refuses it.
    baseURL: import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api",
    withCredentials: true
})

// Attach the bearer token to every request. Read from storage rather than the
// store so this module does not import the store that imports it.
axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem("clinsync-token")
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// A rejected token means the stored session is no longer usable; clear it so
// the app falls back to the login screen instead of retrying forever.
let onUnauthorized = () => {}
export const setUnauthorizedHandler = (handler) => {
    onUnauthorized = handler
}

axiosInstance.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            onUnauthorized()
        }
        return Promise.reject(error)
    }
)
