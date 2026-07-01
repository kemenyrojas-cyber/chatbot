(() => {
    if (localStorage.getItem("lexiaVoiceAssist") !== "true") return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

    const speech = window.speechSynthesis;
    const controlSelector = "a, button, input, select, textarea, [role='button'], [role='switch'], [tabindex]:not([tabindex='-1'])";
    let activeUtterance = null;
    let lastLabel = "";
    let lastSpokenAt = 0;

    function normalize(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function getVoice() {
        const voices = speech.getVoices?.() || [];
        return voices.find(voice => voice.lang?.toLowerCase().startsWith("es-pe"))
            || voices.find(voice => voice.lang?.toLowerCase().startsWith("es"))
            || null;
    }

    function getControlLabel(control) {
        const explicit = normalize(control.getAttribute("aria-label") || control.getAttribute("title"));
        if (explicit) return explicit;

        if (control.id) {
            const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
            const labelText = normalize(label?.textContent);
            if (labelText) return labelText;
        }

        const parentLabelText = normalize(control.closest("label")?.textContent);
        if (parentLabelText) return parentLabelText;

        const visibleText = normalize(control.textContent);
        if (visibleText) return visibleText;

        return normalize(control.getAttribute("placeholder") || control.getAttribute("name"));
    }

    function describeControl(control) {
        const label = getControlLabel(control);
        if (!label) return "";

        let type = "";
        if (control.matches("a")) type = "enlace";
        if (control.matches("button, [role='button']")) type = "botón";
        if (control.matches("input[type='email']")) type = "campo de correo electrónico";
        if (control.matches("input[type='password']")) type = "campo de contraseña";
        if (control.matches("input[type='text'], input:not([type]), textarea")) type = "campo de texto";
        if (control.matches("input[type='checkbox'], [role='switch']")) {
            type = control.checked ? "casilla marcada" : "casilla no marcada";
        }
        if (control.matches("select")) type = "lista desplegable";

        return normalize(`${label}${type ? `, ${type}` : ""}`);
    }

    function stopSpeaking() {
        speech.cancel();
        activeUtterance = null;
    }

    function speakControl(target, force = false) {
        const control = target?.closest?.(controlSelector);
        if (!control) return;

        const label = describeControl(control);
        const now = Date.now();
        if (!label || (!force && label === lastLabel && now - lastSpokenAt < 900)) return;

        stopSpeaking();
        lastLabel = label;
        lastSpokenAt = now;

        const utterance = new SpeechSynthesisUtterance(label);
        const voice = getVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || "es-PE";
        utterance.rate = 0.95;
        activeUtterance = utterance;
        utterance.addEventListener("end", () => {
            if (activeUtterance === utterance) activeUtterance = null;
        }, { once: true });
        utterance.addEventListener("error", () => {
            if (activeUtterance === utterance) activeUtterance = null;
        }, { once: true });
        speech.resume?.();
        speech.speak(utterance);
    }

    document.addEventListener("pointerdown", event => speakControl(event.target, true), true);
    document.addEventListener("pointerover", event => speakControl(event.target));
    document.addEventListener("focusin", event => speakControl(event.target, true));
    document.addEventListener("pointerout", event => {
        const currentControl = event.target?.closest?.(controlSelector);
        if (!currentControl || currentControl.contains(event.relatedTarget)) return;
        stopSpeaking();
        lastLabel = "";
        lastSpokenAt = 0;
    });
})();
