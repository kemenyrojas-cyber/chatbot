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

        const q = text.toLowerCase();

        const legalKeywords = {
            contrato: "Los contratos requieren un objeto lícito, consentimiento válido y precio cierto; en bienes inmuebles se recomienda escritura pública.",
            compraventa: "Un contrato de compraventa debe describir el bien, indicar las partes, establecer el precio y definir la entrega.",
            demanda: "Una demanda debe incluir hechos, derecho invocado y petitorio, y debe presentarse ante el órgano competente.",
            laboral: "En materia laboral conviene revisar jornada, salario, registro del contrato y protección frente a despidos injustificados.",
            despido: "El despido sin causa puede generar indemnización. Es importante revisar el contrato y la legislación laboral local.",
            divorcio: "El divorcio puede ser voluntario o contencioso. La guarda, alimentos y bienes se resuelven según el interés del menor y el régimen patrimonial.",
            custodia: "Las decisiones sobre custodia y visitas se basan en el interés superior del menor; se suelen requerir pruebas y audiencias.",
            herencia: "La sucesión hereditaria se rige por testamento o la ley de sucesiones si no hay testamento válido.",
            alimentos: "La obligación de alimentos alcanza a cónyuges y descendientes; su fijación depende de la necesidad del receptor y la capacidad del obligado.",
            inmueble: "La venta de inmuebles suele requerir escritura pública y registro; conviene verificar cargas y gravámenes.",
            prueba: "La prueba documental, pericial y testimonial es clave en juicios civiles y laborales para respaldar tus reclamaciones.",
            sentencia: "Una sentencia firme pone fin al juicio, pero puede admitirse recurso según los plazos y causales previstos por la ley.",
            abogado: "Consultar con un abogado ayuda a redactar documentos y a elegir la estrategia legal adecuada para tu caso."
        };

        for (const keyword in legalKeywords) {
            if (q.includes(keyword)) {
                return legalKeywords[keyword];
            }
        }

        if (q.includes("hola") || q.includes("buenas") || q.includes("buenos")) {
            return "Hola. Soy LexIA. Estoy aquí para ayudarte con temas de derecho.";
        }

        return "Por favor, hazme una consulta específica sobre derecho civil, laboral, penal, familiar o contractual.";
    }

    async function sendMessage() {

        const text = input.value.trim();

        if (text === "") {
            return;
        }

        addMessage(text, "user");
        input.value = "";

        const loadingMessage = document.createElement("div");
        loadingMessage.className = "message bot loading";
        loadingMessage.textContent = "Consultando a LexIA...";
        messages.appendChild(loadingMessage);
        messages.scrollTop = messages.scrollHeight;

        const backendUrl = (window.BACKEND_URL || "").replace(/\/$/, "");
        const useBackend = backendUrl !== "";

        if (!useBackend) {
            const botAnswer = getBotResponse(text);
            loadingMessage.remove();
            addMessage(botAnswer, "bot");
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ prompt: text })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Error en la solicitud");
            }

            const data = await response.json();
            const botAnswer = data.answer || getBotResponse(text);
            loadingMessage.remove();
            addMessage(botAnswer, "bot");
        } catch (error) {
            console.error(error);
            loadingMessage.remove();
            const botAnswer = getBotResponse(text);
            addMessage(botAnswer, "bot");
        }
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