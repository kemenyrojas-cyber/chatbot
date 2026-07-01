(() => {
    if (localStorage.getItem("lexiaVoiceAssist") !== "true") return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

    const speech = window.speechSynthesis;
    const controlSelector = "a, button, input, select, textarea, [role='button'], [role='switch'], [tabindex]:not([tabindex='-1'])";
    let activeUtterance = null;
    let speechStartTimer = null;
    let characterQueue = [];
    let speakingCharacter = false;
    let lastLabel = "";
    let lastSpokenAt = 0;
    let validationAnnouncementTimer = null;
    const validationStatus = document.createElement("div");
    validationStatus.setAttribute("role", "alert");
    validationStatus.setAttribute("aria-live", "assertive");
    validationStatus.setAttribute("aria-atomic", "true");
    Object.assign(validationStatus.style, {
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: "0",
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: "0"
    });
    document.body.appendChild(validationStatus);

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
        if (speechStartTimer) {
            window.clearTimeout(speechStartTimer);
            speechStartTimer = null;
        }
        characterQueue = [];
        speakingCharacter = false;
        speech.cancel();
        activeUtterance = null;
    }

    function configureUtterance(utterance) {
        const voice = getVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || "es-PE";
        utterance.rate = 0.95;
    }

    function speakMessage(message) {
        const text = normalize(message);
        if (!text) return;
        const shouldDelay = speech.speaking || speech.pending;
        stopSpeaking();
        const startSpeech = () => {
            speechStartTimer = null;
            const utterance = new SpeechSynthesisUtterance(text);
            configureUtterance(utterance);
            activeUtterance = utterance;
            utterance.addEventListener("end", () => {
                if (activeUtterance === utterance) activeUtterance = null;
            }, { once: true });
            utterance.addEventListener("error", () => {
                if (activeUtterance === utterance) activeUtterance = null;
            }, { once: true });
            speech.resume?.();
            speech.speak(utterance);
        };
        if (shouldDelay) {
            speechStartTimer = window.setTimeout(startSpeech, 60);
        } else {
            startSpeech();
        }
    }

    function speakNextCharacter() {
        const text = characterQueue.shift();
        if (!text) {
            speakingCharacter = false;
            activeUtterance = null;
            return;
        }

        speakingCharacter = true;
        const utterance = new SpeechSynthesisUtterance(text);
        configureUtterance(utterance);
        utterance.rate = 1.15;
        activeUtterance = utterance;
        const continueQueue = () => {
            if (activeUtterance === utterance) activeUtterance = null;
            speakNextCharacter();
        };
        utterance.addEventListener("end", continueQueue, { once: true });
        utterance.addEventListener("error", continueQueue, { once: true });
        speech.resume?.();
        speech.speak(utterance);
    }

    function speakTypedCharacter(text) {
        if (!speakingCharacter) {
            stopSpeaking();
            speakingCharacter = true;
            characterQueue.push(text);
            speechStartTimer = window.setTimeout(() => {
                speechStartTimer = null;
                speakNextCharacter();
            }, 80);
            return;
        }
        characterQueue.push(text);
    }

    function describeCharacter(character) {
        const names = {
            " ": "espacio",
            "@": "arroba",
            ".": "punto",
            ",": "coma",
            "-": "guion",
            "_": "guion bajo",
            "/": "barra",
            "\\": "barra invertida",
            ":": "dos puntos",
            ";": "punto y coma"
        };
        return names[character] || character;
    }

    function speakControl(target, force = false) {
        const control = target?.closest?.(controlSelector);
        if (!control) return;

        const label = describeControl(control);
        const now = Date.now();
        if (!label || (!force && label === lastLabel && now - lastSpokenAt < 900)) return;

        lastLabel = label;
        lastSpokenAt = now;
        speakMessage(label);
    }

    function getValidationMessage(control) {
        const label = getControlLabel(control) || "Este campo";
        if (control.validity?.valueMissing) return `${label} es obligatorio. Completa este campo.`;
        if (control.validity?.typeMismatch) return `Ingresa un dato válido en ${label}.`;
        if (control.validity?.tooShort) return `${label} debe tener al menos ${control.minLength} caracteres.`;
        if (control.validity?.patternMismatch) return `${label} no tiene el formato requerido.`;
        return control.validationMessage || `${label} contiene un error. Revisa este campo.`;
    }

    document.addEventListener("pointerdown", event => speakControl(event.target, true), true);
    document.addEventListener("pointerover", event => speakControl(event.target));
    document.addEventListener("focusin", event => speakControl(event.target, true));
    document.addEventListener("input", event => {
        const control = event.target;
        if (!control.matches?.("input[type='text'], input[type='email'], input[type='password'], input:not([type]), textarea")) return;

        if (event.inputType?.startsWith("delete")) {
            speakTypedCharacter("borrado");
            return;
        }
        if (event.inputType === "insertFromPaste") {
            speakTypedCharacter("texto pegado");
            return;
        }
        if (!event.data) return;

        Array.from(event.data).forEach(character => {
            speakTypedCharacter(control.matches("input[type='password']") ? "carácter" : describeCharacter(character));
        });
    });
    document.addEventListener("invalid", event => {
        if (validationAnnouncementTimer) return;
        const control = event.target;
        const message = getValidationMessage(control);
        validationAnnouncementTimer = window.setTimeout(() => {
            validationAnnouncementTimer = null;
            validationStatus.textContent = "";
            window.setTimeout(() => {
                validationStatus.textContent = message;
            }, 30);
            lastLabel = message;
            lastSpokenAt = Date.now();
            speakMessage(message);
        }, 250);
    }, true);
    document.addEventListener("pointerout", event => {
        const currentControl = event.target?.closest?.(controlSelector);
        if (!currentControl || currentControl.contains(event.relatedTarget)) return;
        stopSpeaking();
        lastLabel = "";
        lastSpokenAt = 0;
    });
})();
