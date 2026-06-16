(() => {
    const ACCOUNTS_KEY = "lexiaAccounts";
    const SESSION_KEY = "lexiaSession";

    function normalizeEmail(email) {
        return String(email || "").trim().toLowerCase();
    }

    function readJson(storage, key, fallback) {
        try {
            const value = storage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch {
            return fallback;
        }
    }

    function writeJson(storage, key, value) {
        storage.setItem(key, JSON.stringify(value));
    }

    function getAccounts() {
        return readJson(window.localStorage, ACCOUNTS_KEY, []);
    }

    function saveAccounts(accounts) {
        writeJson(window.localStorage, ACCOUNTS_KEY, accounts);
    }

    async function apiRequest(path, payload, method = "POST") {
        const response = await fetch(path, {
            method,
            headers: { "Content-Type": "application/json" },
            body: method === "GET" ? undefined : JSON.stringify(payload || {})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || "No se pudo completar la solicitud.");
            error.status = response.status;
            error.field = data.field || "";
            throw error;
        }
        return data;
    }

    function findAccount(email) {
        const normalizedEmail = normalizeEmail(email);
        return getAccounts().find(account => normalizeEmail(account.email) === normalizedEmail) || null;
    }

    function saveAccount(account) {
        const accounts = getAccounts();
        const normalizedEmail = normalizeEmail(account.email);
        const nextAccount = {
            email: normalizedEmail,
            name: String(account.name || "").trim(),
            password: String(account.password || ""),
            profile: String(account.profile || "")
        };
        const existingIndex = accounts.findIndex(item => normalizeEmail(item.email) === normalizedEmail);

        if (existingIndex >= 0) {
            if (!nextAccount.password && accounts[existingIndex]?.password) {
                nextAccount.password = String(accounts[existingIndex].password || "");
            }
            accounts[existingIndex] = nextAccount;
        } else {
            accounts.push(nextAccount);
        }

        saveAccounts(accounts);
        return nextAccount;
    }

    async function fetchAccount(email) {
        const normalizedEmail = normalizeEmail(email);
        if (!normalizedEmail) return null;

        const response = await fetch(`/api/auth/account?email=${encodeURIComponent(normalizedEmail)}`);
        if (response.status === 404) {
            return null;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "No se pudo consultar la cuenta.");
        }

        if (data.account) {
            return saveAccount(data.account);
        }

        return null;
    }

    async function syncLegacyAccounts() {
        const accounts = getAccounts();
        if (!accounts.length) return;

        for (const account of accounts) {
            if (!account?.email || !account?.password || !account?.profile) continue;
            try {
                await apiRequest("/api/auth/register", {
                    name: account.name,
                    email: account.email,
                    password: account.password,
                    profile: account.profile
                });
            } catch (error) {
                if (error.status !== 409) {
                    break;
                }
            }
        }
    }

    function getSession() {
        return readJson(window.sessionStorage, SESSION_KEY, null)
            || readJson(window.localStorage, SESSION_KEY, null);
    }

    function setSession(session, remember) {
        const payload = {
            email: normalizeEmail(session.email),
            name: String(session.name || "").trim(),
            profile: String(session.profile || "")
        };

        window.sessionStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(SESSION_KEY);
        writeJson(remember ? window.localStorage : window.sessionStorage, SESSION_KEY, payload);
        return payload;
    }

    function clearSession() {
        window.sessionStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(SESSION_KEY);
    }

    function showStatus(element, message, type) {
        if (!element) return;
        element.textContent = message;
        element.hidden = !message;
        element.className = `auth-status ${type}`;
    }

    function handleRegisterForm() {
        const form = document.querySelector("[data-auth='register']");
        if (!form) return;

        const status = document.getElementById("authStatus");
        form.addEventListener("submit", async event => {
            event.preventDefault();

            const formData = new FormData(form);
            try {
                const data = await apiRequest("/api/auth/register", {
                    name: formData.get("name"),
                    email: formData.get("email"),
                    password: formData.get("password"),
                    profile: formData.get("profile")
                });
                const account = saveAccount(data.account);
                setSession(account, true);
                showStatus(status, "", "success");
                window.location.href = `/app?email=${encodeURIComponent(account.email)}`;
            } catch (error) {
                showStatus(status, error.message || "No se pudo registrar la cuenta.", "error");
            }
        });
    }

    function handleLoginForm() {
        const form = document.querySelector("[data-auth='login']");
        if (!form) return;

        const status = document.getElementById("authStatus");
        form.addEventListener("submit", async event => {
            event.preventDefault();

            const formData = new FormData(form);
            const email = normalizeEmail(formData.get("email"));
            const password = String(formData.get("password") || "");
            const remember = formData.get("remember") === "on";
            try {
                const data = await apiRequest("/api/auth/login", { email, password });
                const account = saveAccount(data.account);
                setSession(account, remember);
                showStatus(status, "", "success");
                window.location.href = `/app?email=${encodeURIComponent(account.email)}`;
            } catch (error) {
                if (error.field === "email") {
                    showStatus(status, "Ese correo no está registrado.", "error");
                    return;
                }
                if (error.field === "password") {
                    showStatus(status, "La contraseña es incorrecta.", "error");
                    return;
                }

                try {
                    const fallbackAccount = findAccount(email) || await fetchAccount(email);
                    if (!fallbackAccount) {
                        showStatus(status, "Ese correo no está registrado.", "error");
                        return;
                    }
                    showStatus(status, "La contraseña es incorrecta.", "error");
                } catch {
                    showStatus(status, error.message || "No se pudo iniciar sesión.", "error");
                }
            }
        });
    }

    window.LexiaAuth = {
        clearSession,
        fetchAccount,
        findAccount,
        getAccounts,
        getSession,
        normalizeEmail,
        saveAccount,
        setSession
    };

    document.addEventListener("DOMContentLoaded", () => {
        void syncLegacyAccounts();
        handleRegisterForm();
        handleLoginForm();
    });
})();
