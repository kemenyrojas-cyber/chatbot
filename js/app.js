document.addEventListener("DOMContentLoaded", () => {

    const sendBtn =
        document.getElementById("sendBtn");

    const input =
        document.getElementById("messageInput");

    const messages =
        document.getElementById("chatMessages");

    function addMessage(text, type) {

        const msg =
            document.createElement("div");

        msg.className =
            `message ${type}`;

        msg.textContent = text;

        messages.appendChild(msg);

        messages.scrollTop =
            messages.scrollHeight;
    }

    function getBotResponse(text) {

        const q =
            text.toLowerCase();

        if (q.includes("hola")) {
            return "Hola. Soy LexIA. ¿Cómo puedo ayudarte?";
        }

        if (q.includes("contrato")) {
            return "Puedo ayudarte a revisar contratos y explicar cláusulas.";
        }

        if (q.includes("demanda")) {
            return "Una demanda debe cumplir requisitos legales específicos según el país.";
        }

        if (q.includes("laboral")) {
            return "Puedo orientarte sobre temas laborales generales.";
        }

        return "He recibido tu consulta. Estoy listo para ser conectado a una IA real.";
    }

    function sendMessage() {

        const text =
            input.value.trim();

        if (text === "") {
            return;
        }

        addMessage(text, "user");

        input.value = "";

        setTimeout(() => {

            addMessage(
                getBotResponse(text),
                "bot"
            );

        }, 500);
    }

    sendBtn.addEventListener(
        "click",
        sendMessage
    );

    input.addEventListener(
        "keydown",
        (e) => {

            if (e.key === "Enter") {
                sendMessage();
            }
        }
    );

    document
        .querySelectorAll(".quick-btn")
        .forEach(btn => {

            btn.addEventListener(
                "click",
                () => {

                    input.value =
                        btn.textContent;

                    sendMessage();
                }
            );

        });

});