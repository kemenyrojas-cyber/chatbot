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
            accounts[existingIndex] = nextAccount;
        } else {
            accounts.push(nextAccount);
        }

        saveAccounts(accounts);
        return nextAccount;
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
        form.addEventListener("submit", event => {
            event.preventDefault();

            const formData = new FormData(form);
            const account = saveAccount({
                name: formData.get("name"),
                email: formData.get("email"),
                password: formData.get("password"),
                profile: formData.get("profile")
            });

            setSession(account, true);
            showStatus(status, "", "success");
            window.location.href = `/app?email=${encodeURIComponent(account.email)}`;
        });
    }

    function handleLoginForm() {
        const form = document.querySelector("[data-auth='login']");
        if (!form) return;

        const status = document.getElementById("authStatus");
        form.addEventListener("submit", event => {
            event.preventDefault();

            const formData = new FormData(form);
            const email = normalizeEmail(formData.get("email"));
            const password = String(formData.get("password") || "");
            const remember = formData.get("remember") === "on";
            const account = findAccount(email);

            if (!account) {
                showStatus(status, "Ese correo no está registrado.", "error");
                return;
            }

            if (account.password !== password) {
                showStatus(status, "La contraseña no coincide.", "error");
                return;
            }

            setSession(account, remember);
            showStatus(status, "", "success");
            window.location.href = `/app?email=${encodeURIComponent(account.email)}`;
        });
    }

    window.LexiaAuth = {
        clearSession,
        findAccount,
        getAccounts,
        getSession,
        normalizeEmail,
        saveAccount,
        setSession
    };

    document.addEventListener("DOMContentLoaded", () => {
        handleRegisterForm();
        handleLoginForm();
    });
})();
