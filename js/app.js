document.addEventListener("DOMContentLoaded", () => {

    const sendBtn = document.getElementById("sendBtn");
    const input = document.getElementById("messageInput");
    const messages = document.getElementById("chatMessages");
    const roleQuickGrid = document.getElementById("roleQuickGrid");
    const roleResourceList = document.getElementById("roleResourceList");
    const roleToolsGrid = document.getElementById("roleToolsGrid");
    const roleStats = document.getElementById("roleStats");
    const notificationButton = document.getElementById("notificationButton");
    const notificationBadge = document.getElementById("notificationBadge");
    const notificationPanel = document.getElementById("notificationPanel");
    const notificationList = document.getElementById("notificationList");
    const markNotificationsRead = document.getElementById("markNotificationsRead");
    const accountButton = document.getElementById("accountButton");
    const accountMenu = document.getElementById("accountMenu");
    const logoutButton = document.getElementById("logoutButton");
    const clearHistoryButton = document.getElementById("clearHistoryButton");
    const greeting = document.getElementById("dashboardGreeting");
    const dashboardSubtitle = document.getElementById("dashboardSubtitle");
    const accountLabel = document.getElementById("accountLabel");
    const accountPlan = document.getElementById("accountPlan");
    const heroTitle = document.getElementById("heroTitle");
    const heroSubtitle = document.getElementById("heroSubtitle");
    const activityTitle = document.getElementById("activityTitle");
    const resourceTitle = document.getElementById("resourceTitle");
    const planTitle = document.getElementById("planTitle");
    const planDescription = document.getElementById("planDescription");
    const planFeatures = document.getElementById("planFeatures");
    const dashboardView = document.getElementById("dashboardView");
    const legalChatView = document.getElementById("legalChatView");
    const chatSessionList = document.getElementById("chatSessionList");
    const chatThread = document.getElementById("chatThread");
    const chatComposerInput = document.getElementById("chatComposerInput");
    const chatComposerSend = document.getElementById("chatComposerSend");
    const chatViewTitle = document.getElementById("chatViewTitle");
    const chatViewSubtitle = document.getElementById("chatViewSubtitle");
    const chatSuggestions = document.getElementById("chatSuggestions");
    const newChatSessionButton = document.getElementById("newChatSessionButton");

    const roleAliases = {
        "abogado independiente": "abogado-independiente",
        "abogado/a": "abogado-independiente",
        "abogado": "abogado-independiente",
        "estudio juridico": "estudio-juridico",
        "estudio jurídico": "estudio-juridico",
        "equipo legal": "estudio-juridico",
        "estudiante de derecho": "estudiante-derecho",
        "estudiante": "estudiante-derecho",
        "entidad publica": "entidad-publica",
        "entidad pública": "entidad-publica",
        "empresa / corporativo": "empresa-corporativo",
        "empresa": "empresa-corporativo",
        "corporativo": "empresa-corporativo"
    };

    const roleDashboards = {
        "abogado-independiente": {
            label: "Abogado Independiente",
            greeting: "¡Hola, Abogado Independiente!",
            subtitle: "Gestiona clientes, consultas, expedientes y vencimientos desde tu propio panel.",
            plan: "Cuenta profesional",
            heroTitle: "Dashboard para práctica legal independiente",
            heroSubtitle: "Consulta normas, prepara escritos, controla plazos y organiza tu cartera de clientes.",
            activityTitle: "Casos y consultas recientes",
            resourceTitle: "Normas y jurisprudencia clave",
            quick: [
                ["fa-regular fa-square-plus", "Nueva consulta", "Haz tu pregunta legal"],
                ["fa-regular fa-user", "Nuevo cliente", "Registra datos y caso"],
                ["fa-regular fa-calendar-days", "Controlar plazo", "Calcula vencimientos procesales"],
                ["fa-solid fa-upload", "Analizar documento", "Contratos, demandas o anexos"],
                ["fa-regular fa-clipboard", "Generar escrito", "Modelos listos para editar"]
            ],
            resources: [
                ["Código Civil", "Contratos, obligaciones y familia"],
                ["Código Procesal Civil", "Etapas, plazos y recursos"],
                ["Código Penal", "Delitos y criterios de defensa"],
                ["Jurisprudencia relevante", "Criterios para argumentación"]
            ],
            tools: [
                ["fa-solid fa-calculator", "Calculadora de intereses", "Intereses legales y moratorios"],
                ["fa-regular fa-calendar-days", "Plazos procesales", "Controla vencimientos"],
                ["fa-regular fa-file-lines", "Resumen de expediente", "Sintetiza hechos y anexos"],
                ["fa-solid fa-scale-balanced", "Matriz de argumentos", "Ordena pretensiones y pruebas"]
            ],
            features: ["Consultas ilimitadas", "Gestión de clientes", "Control de vencimientos", "Generación de escritos"]
        },
        "estudio-juridico": {
            label: "Estudio Jurídico",
            greeting: "¡Hola, Estudio Jurídico!",
            subtitle: "Coordina equipo, expedientes, revisiones y productividad de la firma.",
            plan: "Cuenta de estudio",
            heroTitle: "Centro operativo para estudios jurídicos",
            heroSubtitle: "Asigna consultas, revisa documentos en equipo y estandariza entregables legales.",
            activityTitle: "Actividad del estudio",
            resourceTitle: "Base interna destacada",
            quick: [
                ["fa-solid fa-users", "Asignar consulta", "Distribuye trabajo por abogado"],
                ["fa-solid fa-upload", "Revisión compartida", "Analiza documentos en equipo"],
                ["fa-solid fa-briefcase", "Nuevo expediente", "Organiza cliente, materia y estado"],
                ["fa-regular fa-clipboard", "Plantilla del estudio", "Estandariza documentos"],
                ["fa-regular fa-bell", "Alertas del equipo", "Seguimiento de pendientes"]
            ],
            resources: [
                ["Protocolos internos", "Criterios de atención"],
                ["Plantillas aprobadas", "Formatos vigentes"],
                ["Matriz de expedientes", "Casos y prioridades"],
                ["Repositorio contractual", "Cláusulas frecuentes"]
            ],
            tools: [
                ["fa-solid fa-users", "Bandeja de equipo", "Asignaciones y responsables"],
                ["fa-regular fa-bell", "Alertas legales", "Cambios y vencimientos"],
                ["fa-regular fa-clipboard", "Checklist de revisión", "Control de calidad"],
                ["fa-solid fa-magnifying-glass", "Buscador interno", "Criterios reutilizables"]
            ],
            features: ["Roles y permisos", "Bandeja compartida", "Plantillas del estudio", "Trazabilidad de revisiones"]
        },
        "estudiante-derecho": {
            label: "Estudiante de Derecho",
            greeting: "¡Hola, Estudiante de Derecho!",
            subtitle: "Aprende, practica casos y resume normas con una ruta de estudio guiada.",
            plan: "Cuenta académica",
            heroTitle: "Tutor legal para estudiar y practicar",
            heroSubtitle: "Convierte normas complejas en explicaciones claras, esquemas y ejemplos.",
            activityTitle: "Avance de estudio",
            resourceTitle: "Material recomendado",
            quick: [
                ["fa-regular fa-file-lines", "Resumir tema", "Explicación clara por materia"],
                ["fa-solid fa-scale-balanced", "Practicar caso", "Analiza hechos y fundamentos"],
                ["fa-regular fa-clipboard", "Crear esquema", "Mapa de conceptos"],
                ["fa-solid fa-magnifying-glass", "Buscar artículos", "Ubica base legal"],
                ["fa-regular fa-star", "Guardar apunte", "Favoritos de estudio"]
            ],
            resources: [
                ["Introducción al Derecho Civil", "Conceptos esenciales"],
                ["Guía de Derecho Penal", "Tipos penales frecuentes"],
                ["Proceso Civil básico", "Etapas y recursos"],
                ["Modelos de examen", "Preguntas para practicar"]
            ],
            tools: [
                ["fa-regular fa-file-lines", "Fichas de estudio", "Resumen por tema"],
                ["fa-regular fa-clipboard", "Casos prácticos", "Hechos, problema y solución"],
                ["fa-solid fa-magnifying-glass", "Glosario jurídico", "Términos explicados"],
                ["fa-regular fa-star", "Repaso rápido", "Preguntas frecuentes"]
            ],
            features: ["Resúmenes por materia", "Casos prácticos guiados", "Glosario jurídico", "Ruta de aprendizaje"]
        },
        "entidad-publica": {
            label: "Entidad Pública",
            greeting: "¡Hola, Entidad Pública!",
            subtitle: "Gestiona normativa, informes, expedientes administrativos y atención ciudadana.",
            plan: "Cuenta institucional",
            heroTitle: "Panel jurídico para entidades públicas",
            heroSubtitle: "Centraliza consultas normativas, informes legales, procedimientos y obligaciones públicas.",
            activityTitle: "Trámites e informes recientes",
            resourceTitle: "Normativa institucional",
            quick: [
                ["fa-solid fa-landmark", "Consulta normativa", "Interpreta leyes y directivas"],
                ["fa-regular fa-clipboard", "Generar informe", "Base legal y conclusiones"],
                ["fa-solid fa-magnifying-glass", "Revisar expediente", "Hechos, actos y riesgos"],
                ["fa-regular fa-calendar-days", "Plazo administrativo", "Controla vencimientos"],
                ["fa-regular fa-bell", "Alerta regulatoria", "Cambios normativos"]
            ],
            resources: [
                ["Ley del Procedimiento Administrativo General", "Actos, recursos y plazos"],
                ["Contrataciones del Estado", "Bases, consultas y ejecución"],
                ["Transparencia y acceso a información", "Obligaciones públicas"],
                ["Responsabilidad administrativa", "Riesgos y criterios"]
            ],
            tools: [
                ["fa-regular fa-clipboard", "Borrador de informe", "Estructura institucional"],
                ["fa-regular fa-calendar-days", "Plazos administrativos", "Cómputo y alertas"],
                ["fa-solid fa-magnifying-glass", "Análisis de expediente", "Resumen y observaciones"],
                ["fa-solid fa-shield-halved", "Control normativo", "Cumplimiento y riesgos"]
            ],
            features: ["Informes legales", "Seguimiento de expedientes", "Normativa pública", "Alertas administrativas"]
        },
        "empresa-corporativo": {
            label: "Empresa / Corporativo",
            greeting: "¡Hola, Empresa / Corporativo!",
            subtitle: "Supervisa contratos, riesgos, obligaciones y consultas legales operativas.",
            plan: "Cuenta empresarial",
            heroTitle: "Dashboard legal para operaciones empresariales",
            heroSubtitle: "Centraliza consultas, contratos, compliance y gestión de riesgos.",
            activityTitle: "Riesgos y operaciones recientes",
            resourceTitle: "Documentos empresariales",
            quick: [
                ["fa-solid fa-upload", "Revisar contrato", "Detecta riesgos y cláusulas"],
                ["fa-solid fa-shield-halved", "Compliance", "Evalúa obligaciones"],
                ["fa-solid fa-briefcase", "Consulta laboral", "Casos de personal"],
                ["fa-solid fa-calculator", "Impacto económico", "Multas, intereses y costos"],
                ["fa-regular fa-bell", "Obligaciones", "Alertas regulatorias"]
            ],
            resources: [
                ["Contratos comerciales", "Compra, venta y servicios"],
                ["Políticas laborales", "Gestión de personal"],
                ["Matriz de compliance", "Obligaciones por área"],
                ["Cláusulas de riesgo", "Revisión preventiva"]
            ],
            tools: [
                ["fa-solid fa-shield-halved", "Mapa de riesgos", "Prioriza contingencias"],
                ["fa-solid fa-magnifying-glass", "Auditoría contractual", "Hallazgos por contrato"],
                ["fa-regular fa-calendar-days", "Calendario legal", "Obligaciones y renovaciones"],
                ["fa-solid fa-briefcase", "Consultas internas", "Soporte para áreas"]
            ],
            features: ["Revisión contractual", "Alertas de compliance", "Soporte laboral", "Reporte de riesgos"]
        }
    };

    const storageKeys = {
        history: "lexiaHistory",
        chats: "lexiaChats",
        notifications: "lexiaNotifications",
        documents: "lexiaDocuments",
        deadlines: "lexiaDeadlines",
        favorites: "lexiaFavorites"
    };

    let currentRole = "abogado-independiente";
    let currentView = "dashboard";
    let activeChatSessionId = null;
    let isSending = false;

    function loadList(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "[]");
            return Array.isArray(value) ? value : [];
        } catch {
            return [];
        }
    }

    function saveList(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function formatDate(value) {
        return new Intl.DateTimeFormat("es-PE", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value));
    }

    function textOnly(html) {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return tmp.textContent.replace(/\s+/g, " ").trim();
    }

    function escapeHtml(value) {
        const tmp = document.createElement("div");
        tmp.textContent = value || "";
        return tmp.innerHTML;
    }

    function createId() {
        return window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now() + Math.random());
    }

    function normalizeRole(value) {
        if (!value) return "";
        return roleAliases[value.trim().toLowerCase()] || value.trim().toLowerCase();
    }

    function renderIconArticle(item, className) {
        const [icon, title, text] = item;
        return `<article class="${className}"><span><i class="${icon} icon" aria-hidden="true"></i></span><strong>${title}</strong><small>${text}</small></article>`;
    }

    function getChatSessions() {
        return loadList(storageKeys.chats)
            .filter(item => item.role === currentRole)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    function saveChatSessions(nextSessions) {
        const otherRoles = loadList(storageKeys.chats).filter(item => item.role !== currentRole);
        saveList(storageKeys.chats, [...otherRoles, ...nextSessions].slice(-120));
    }

    function getActiveChatSession() {
        const sessions = getChatSessions();
        return sessions.find(item => item.id === activeChatSessionId) || null;
    }

    function buildRoleAssistantPrompt() {
        const roleConfig = roleDashboards[currentRole] || roleDashboards["abogado-independiente"];
        return `Actúa como LEXIA para el rol ${roleConfig.label}. Prioriza respuestas jurídicas útiles, estructuradas y accionables para ese perfil.`;
    }

    function renderRole(role) {
        const selectedRole = roleDashboards[role] ? role : "abogado-independiente";
        const config = roleDashboards[selectedRole];
        currentRole = selectedRole;
        localStorage.setItem("lexiaRole", selectedRole);

        greeting.textContent = config.greeting;
        dashboardSubtitle.textContent = config.subtitle;
        accountLabel.textContent = config.label;
        accountPlan.textContent = config.plan;
        heroTitle.textContent = config.heroTitle;
        heroSubtitle.textContent = config.heroSubtitle;
        activityTitle.textContent = config.activityTitle;
        resourceTitle.textContent = config.resourceTitle;
        planTitle.textContent = `LEXIA ${config.label}`;
        planDescription.textContent = config.plan;
        roleQuickGrid.innerHTML = config.quick.map(item => renderIconArticle(item, "quick-card")).join("");
        roleResourceList.innerHTML = config.resources.map(item => renderIconArticle(["fa-regular fa-file-lines", item[0], item[1]], "")).join("");
        roleToolsGrid.innerHTML = config.tools.map(item => renderIconArticle(item, "")).join("");
        planFeatures.innerHTML = config.features.map(feature => `<li>${feature}</li>`).join("");
        chatViewTitle.textContent = `Consulta IA para ${config.label}`;
        chatViewSubtitle.textContent = config.heroSubtitle;
        if (!getChatSessions().some(item => item.id === activeChatSessionId)) {
            activeChatSessionId = null;
        }
        renderAppState();
        renderChatSessions();
        renderChatThread();
    }

    const params = new URLSearchParams(window.location.search);
    const savedRole = normalizeRole(localStorage.getItem("lexiaRole"));
    const session = window.LexiaAuth?.getSession?.() || null;
    const currentEmail = params.get("email") || session?.email || "";
    const currentAccount = currentEmail && window.LexiaAuth?.findAccount
        ? window.LexiaAuth.findAccount(currentEmail)
        : null;
    const initialRole = normalizeRole(
        params.get("role")
        || params.get("profile")
        || currentAccount?.profile
        || session?.profile
    ) || savedRole || "abogado-independiente";
    renderRole(initialRole);

    function getHistory() {
        return loadList(storageKeys.history).filter(item => item.role === currentRole);
    }

    function getNotifications() {
        return loadList(storageKeys.notifications).filter(item => item.role === currentRole);
    }

    function addNotification(title, detail) {
        const notifications = loadList(storageKeys.notifications);
        notifications.unshift({
            id: createId(),
            role: currentRole,
            title,
            detail,
            read: false,
            createdAt: new Date().toISOString()
        });
        saveList(storageKeys.notifications, notifications.slice(0, 50));
    }

    function renderHistory() {
        const history = getHistory();

        if (!history.length) {
            messages.innerHTML = `<div class="empty-state"><strong>No hay historial todavía.</strong><span>Cuando realices una consulta, aparecerá aquí con fecha y respuesta.</span></div>`;
            return;
        }

        messages.innerHTML = history.slice(0, 8).map(item => `
            <article class="history-item">
                <span><i class="fa-regular fa-comment-dots icon" aria-hidden="true"></i></span>
                <details ${item.id === history[0].id ? "open" : ""}>
                    <summary>
                        <strong>${escapeHtml(item.question)}</strong>
                        <small>${escapeHtml(item.answerPreview)}</small>
                    </summary>
                    <div class="history-answer">${item.answer}</div>
                </details>
                <time>${formatDate(item.createdAt)}</time>
            </article>
        `).join("");
    }

    function renderNotifications() {
        const notifications = getNotifications();
        const unreadCount = notifications.filter(item => !item.read).length;

        notificationBadge.textContent = unreadCount;
        notificationBadge.hidden = unreadCount === 0;

        if (!notifications.length) {
            notificationList.innerHTML = `<div class="empty-state compact"><strong>Sin notificaciones.</strong><span>Las alertas aparecerán cuando haya una acción real que reportar.</span></div>`;
            return;
        }

        notificationList.innerHTML = notifications.slice(0, 10).map(item => `
            <article class="${item.read ? "" : "unread"}">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.detail)}</span>
                <time>${formatDate(item.createdAt)}</time>
            </article>
        `).join("");
    }

    function renderStats() {
        const history = getHistory();
        const documents = loadList(storageKeys.documents).filter(item => item.role === currentRole);
        const deadlines = loadList(storageKeys.deadlines).filter(item => item.role === currentRole);
        const unreadNotifications = getNotifications().filter(item => !item.read);

        roleStats.innerHTML = [
            ["Consultas realizadas", history.length],
            ["Documentos cargados", documents.length],
            ["Plazos registrados", deadlines.length],
            ["Notificaciones pendientes", unreadNotifications.length]
        ].map(([label, value]) => `<div class="stat-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
    }

    function renderAppState() {
        renderHistory();
        renderNotifications();
        renderStats();
    }

    function updateNav(activeAction) {
        document.querySelectorAll(".side-nav .nav-item").forEach(item => {
            item.classList.toggle("active", item.dataset.action === activeAction);
        });
    }

    function showView(viewName) {
        currentView = viewName;
        const showChat = viewName === "chat";
        dashboardView.hidden = showChat;
        legalChatView.hidden = !showChat;
        updateNav(showChat ? "new-query" : "home");
    }

    function formatChatContent(content) {
        return escapeHtml(content)
            .replace(/\n{2,}/g, "</p><p>")
            .replace(/\n/g, "<br>");
    }

    function createChatSession(initialQuestion = "") {
        const sessionId = createId();
        const title = initialQuestion.trim() || `Nueva consulta ${new Date().toLocaleDateString("es-PE")}`;
        const nextSession = {
            id: sessionId,
            role: currentRole,
            title: title.slice(0, 90),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: []
        };
        const sessions = getChatSessions();
        saveChatSessions([nextSession, ...sessions]);
        activeChatSessionId = sessionId;
        return nextSession;
    }

    function upsertChatSession(session) {
        const sessions = getChatSessions().filter(item => item.id !== session.id);
        saveChatSessions([{ ...session, updatedAt: new Date().toISOString() }, ...sessions]);
    }

    function ensureActiveSession(initialQuestion = "") {
        const currentSession = getActiveChatSession();
        if (currentSession) return currentSession;
        return createChatSession(initialQuestion);
    }

    function renderChatSessions() {
        const sessions = getChatSessions();

        if (!sessions.length) {
            chatSessionList.innerHTML = `<div class="empty-state compact"><strong>Sin conversaciones.</strong><span>Inicia una consulta y quedará organizada aquí.</span></div>`;
            return;
        }

        chatSessionList.innerHTML = sessions.map(item => `
            <button class="chat-session-item ${item.id === activeChatSessionId ? "active" : ""}" type="button" data-session-id="${item.id}">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(textOnly(item.messages[item.messages.length - 1]?.content || "Pendiente de consulta")).slice(0, 88)}</span>
                <time>${formatDate(item.updatedAt)}</time>
            </button>
        `).join("");
    }

    function renderChatThread() {
        const session = getActiveChatSession();

        if (!session || !session.messages.length) {
            chatThread.innerHTML = `
                <div class="chat-empty">
                    <strong>Consulta jurídica especializada</strong>
                    <p>Abre una conversación y formula preguntas sobre contratos, procesos, jurisprudencia, escritos, riesgos o interpretación normativa.</p>
                </div>
            `;
            return;
        }

        chatThread.innerHTML = session.messages.map(item => `
            <article class="chat-message ${item.role}">
                <div class="chat-message-meta">
                    <strong>${item.role === "user" ? "Tú" : "LEXIA"}</strong>
                    <span>${formatDate(item.createdAt)}</span>
                </div>
                <div class="chat-bubble"><p>${formatChatContent(item.content)}</p></div>
            </article>
        `).join("");

        chatThread.scrollTop = chatThread.scrollHeight;
    }

    function openChatView(options = {}) {
        const { draft = "", autoSend = false } = options;
        showView("chat");
        if (!activeChatSessionId) {
            const existing = getChatSessions()[0];
            activeChatSessionId = existing?.id || null;
        }
        renderChatSessions();
        renderChatThread();
        chatComposerInput.value = draft;
        chatComposerInput.focus();
        if (autoSend && draft.trim()) {
            void sendMessage(draft);
        }
    }

    function addMessage(text, type) {
        const msg = document.createElement("div");
        msg.className = `message ${type}`;
        msg.innerHTML = text;
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
    }

    function addHistoryEntry(question, answer) {
        const history = loadList(storageKeys.history);
        history.unshift({
            id: createId(),
            role: currentRole,
            question,
            answer,
            answerPreview: textOnly(answer).slice(0, 120),
            createdAt: new Date().toISOString()
        });
        saveList(storageKeys.history, history.slice(0, 100));
        addNotification("Consulta guardada en historial", question);
        renderAppState();
    }

    function getLocalResponse(text) {
        const q = text.toLowerCase();

        // CONTRATO DE COMPRAVENTA
        if (q.includes('compraventa') || (q.includes('contrato') && q.includes('requisitos'))) {
            return `<strong>Requisitos de un Contrato de Compraventa en Perú (Código Civil Art. 1529)</strong><br><br>
            <strong>1. ELEMENTOS ESENCIALES:</strong><br>
            ✓ <strong>Sujetos:</strong> Vendedor y comprador con capacidad legal<br>
            ✓ <strong>Consentimiento:</strong> Acuerdo de voluntades válido<br>
            ✓ <strong>Objeto:</strong> Bien cierto, determinado y lícito<br>
            ✓ <strong>Precio:</strong> Suma de dinero cierta y determinada<br><br>
            
            <strong>2. REQUISITOS FORMALES:</strong><br>
            ✓ <strong>Bienes Muebles:</strong> Puede ser oral o escrito<br>
            ✓ <strong>Bienes Inmuebles:</strong> DEBE constar en escritura pública<br>
            ✓ <strong>Registro:</strong> Inscripción en Conservador de Bienes Raíces<br><br>
            
            <strong>3. EFECTOS DEL CONTRATO:</strong><br>
            ✓ Transfiere propiedad al comprador<br>
            ✓ Traslada riesgos y beneficios<br>
            ✓ Genera obligación de pago<br>
            ✓ Genera obligación de entrega del bien<br><br>
            
            <strong>4. DOCUMENTOS NECESARIOS:</strong><br>
            ✓ DNI de ambas partes<br>
            ✓ Certificado de no adeudo (si es inmueble)<br>
            ✓ Copia de escritura anterior (si existe)<br>
            ✓ Catastro del inmueble<br><br>
            
            <strong>5. GASTOS Y TRIBUTOS:</strong><br>
            ✓ Gastos notariales (1-2% del valor)<br>
            ✓ Derechos de registro<br>
            ✓ Impuesto a la renta (si aplica)<br><br>
            
            <strong>RECOMENDACIÓN:</strong> Para inmuebles, SIEMPRE use abogado y notario.`;
        }

        // DIVORCIO
        if (q.includes('divorcio') || q.includes('matrimonio')) {
            return `<strong>Procedimiento de Divorcio en Perú (Código Civil Art. 348-354)</strong><br><br>
            
            <strong>1. TIPOS DE DIVORCIO:</strong><br>
            <strong>A) Divorcio por Mutuo Consentimiento:</strong><br>
            • Ambas partes de acuerdo<br>
            • Más rápido (3-6 meses)<br>
            • Menor costo<br>
            • Se presenta demanda conjunta<br><br>
            
            <strong>B) Divorcio Contencioso (por causales):</strong><br>
            • Una parte inicia demanda<br>
            • Causales: adulterio, abandono, maltrato, embriaguez, drogas<br>
            • Más lento (1-3 años)<br>
            • Requiere pruebas<br><br>
            
            <strong>2. REQUISITOS:</strong><br>
            ✓ Matrimonio válido inscrito<br>
            ✓ Un año de matrimonio (en algunos casos)<br>
            ✓ Domicilio en Perú<br>
            ✓ Acuerdo sobre bienes (si es consensual)<br><br>
            
            <strong>3. ACUERDOS OBLIGATORIOS:</strong><br>
            ✓ <strong>Régimen de Tenencia:</strong> ¿A quién va el cuidado de los hijos?<br>
            ✓ <strong>Pensión Alimenticia:</strong> Cuánto pagará el que se va<br>
            ✓ <strong>Liquidación de Bienes:</strong> División de la sociedad conyugal<br>
            ✓ <strong>Visitas y Comunicación:</strong> Derecho del otro padre a ver a hijos<br><br>
            
            <strong>4. DOCUMENTOS NECESARIOS:</strong><br>
            ✓ Partida de matrimonio<br>
            ✓ DNI de ambos<br>
            ✓ Partidas de nacimiento de hijos (si los hay)<br>
            ✓ Acta de conciliación (si existe)<br>
            ✓ Inventario de bienes comunes<br><br>
            
            <strong>5. PROCESO ANTE JUZGADO:</strong><br>
            1. Presentación de demanda<br>
            2. Notificación al demandado<br>
            3. Primer acto conciliatorio<br>
            4. Contestación de demanda<br>
            5. Audiencia de conciliación<br>
            6. Proceso probatorio (3-6 meses)<br>
            7. Sentencia de divorcio<br>
            8. Recurso de apelación (10 días)<br><br>
            
            <strong>6. EFECTOS DEL DIVORCIO:</strong><br>
            ✓ Fin de la relación matrimonial<br>
            ✓ Disolución de sociedad conyugal<br>
            ✓ Derechos sucesorios se pierden<br>
            ✓ Obligación de pensión alimenticia continúa`;
        }

        // DESPIDO INJUSTIFICADO
        if (q.includes('despido') || q.includes('indemnizacion') || q.includes('laboral')) {
            return `<strong>Despido Injustificado en Perú (Código Laboral Art. 34)</strong><br><br>
            
            <strong>1. ¿QUÉ ES DESPIDO INJUSTIFICADO?</strong><br>
            Terminación del contrato sin causa justa establecida en la ley.<br><br>
            
            <strong>2. CAUSAS JUSTAS DE DESPIDO (Legítimas):</strong><br>
            ✓ Falta grave cometida por trabajador<br>
            ✓ Abandono del trabajo<br>
            ✓ Incumplimiento persistente de obligaciones<br>
            ✓ Conducta desonrosa<br><br>
            
            <strong>3. DERECHOS DEL TRABAJADOR DESPEDIDO:</strong><br>
            <strong>A) Indemnización por Despido Arbitrario:</strong><br>
            • <strong>Fórmula:</strong> 1.5 UIT × Número de años de servicio<br>
            • <strong>Máximo:</strong> 12 UIT (aproximadamente S/. 54,000 en 2024)<br>
            • <strong>Ejemplo:</strong> 5 años de trabajo = 1.5 × 5 = 7.5 UIT<br><br>
            
            <strong>B) Otros Derechos:</strong><br>
            ✓ Remuneraciones pendientes<br>
            ✓ Gratificaciones (julios y diciembre)<br>
            ✓ Vacaciones no gozadas<br>
            ✓ Bonificación extraordinaria (si corresponde)<br>
            ✓ Aportaciones a seguro de desempleo<br><br>
            
            <strong>4. PROCESO LABORAL:</strong><br>
            1. Presentar demanda en juzgado laboral<br>
            2. Conciliación obligatoria (primera audiencia)<br>
            3. Contestación de demanda del empleador<br>
            4. Pruebas (presentación de documentos)<br>
            5. Alegatos finales<br>
            6. Sentencia<br>
            7. Apelación (si no está conforme)<br><br>
            
            <strong>5. DOCUMENTOS A PRESENTAR:</strong><br>
            ✓ Contrato de trabajo<br>
            ✓ Cartas de despido (si existen)<br>
            ✓ Recibos de pago<br>
            ✓ Comprobantes de asistencia<br>
            ✓ Evaluaciones de desempeño<br>
            ✓ Constancia de vínculo laboral<br><br>
            
            <strong>6. TIEMPO DEL PROCESO:</strong><br>
            • Juzgado laboral: 1-2 años<br>
            • Incluye apelación: 2-3 años<br>
            • Casación: 3-4 años<br><br>
            
            <strong>7. PROTECCIONES ESPECIALES (FUERO):</strong><br>
            ✓ Dirigentes sindicales<br>
            ✓ Delegados de trabajadores<br>
            ✓ Representantes de seguridad<br>
            ✓ Candidatos electorales<br>
            • Requieren autorización de tribunal para despedir<br><br>
            
            <strong>IMPORTANTE:</strong> Consulte abogado laboral inmediatamente después del despido.`;
        }

        // HERENCIA Y SUCESIÓN
        if (q.includes('herencia') || q.includes('sucesión') || q.includes('testamento')) {
            return `<strong>Sucesión y Herencia en Perú (Código Civil Libro IV)</strong><br><br>
            
            <strong>1. TIPOS DE SUCESIÓN:</strong><br>
            <strong>A) Sucesión Testada:</strong><br>
            • Existe testamento válido del fallecido<br>
            • Se distribuye según lo que testó<br>
            • Más clara y rápida<br><br>
            
            <strong>B) Sucesión Intestada (sin testamento):</strong><br>
            • No hay testamento<br>
            • Se distribuye según orden legal<br>
            • Requiere trámite judicial<br><br>
            
            <strong>2. ORDEN DE HEREDEROS (Sucesión Intestada):</strong><br>
            <strong>Primer Orden:</strong> Hijos y descendientes (nietos)<br>
            <strong>Segundo Orden:</strong> Padres y ascendientes (abuelos)<br>
            <strong>Tercer Orden:</strong> Cónyuge (esposo/esposa)<br>
            <strong>Cuarto Orden:</strong> Hermanos y sobrinos<br>
            <strong>Quinto Orden:</strong> Tíos y primos<br>
            <strong>Sexto Orden:</strong> El Estado (si no hay herederos)<br><br>
            
            <strong>3. HEREDEROS LEGITIMARIOS (Derecho Forzoso):</strong><br>
            Tienen derecho a MÍNIMO una parte:<br>
            ✓ <strong>Hijos:</strong> 2/3 del patrimonio<br>
            ✓ <strong>Padres:</strong> 1/3 del patrimonio<br>
            ✓ <strong>Cónyuge viudo:</strong> 1/4 del patrimonio<br><br>
            
            <strong>4. PROCESO DE SUCESIÓN (Trámite Judicial):</strong><br>
            1. Presentar solicitud ante juzgado civil<br>
            2. Adjuntar documentos (acta de defunción, testamento)<br>
            3. Publicación en periódico oficial (aviso)<br>
            4. Plazo para que hijos, padres, cónyuge se presenten (3-6 meses)<br>
            5. Período para acreditar deudas del fallecido<br>
            6. Resolución del juzgado<br>
            7. Inscripción en registros<br><br>
            
            <strong>5. DOCUMENTOS NECESARIOS:</strong><br>
            ✓ Acta de defunción (original)<br>
            ✓ Testamento (si existe)<br>
            ✓ DNI del fallecido<br>
            ✓ DNI de herederos<br>
            ✓ Partida de matrimonio del fallecido<br>
            ✓ Partidas de nacimiento de hijos<br>
            ✓ Certificado de no adeudo tributario<br><br>
            
            <strong>6. DISTRIBUCIÓN DE LA HERENCIA:</strong><br>
            <strong>Patrimonio Total = Activos - Deudas</strong><br><br>
            Ejemplo: Fallece padre con S/. 100,000<br>
            • 2 hijos heredan: S/. 50,000 cada uno<br>
            • 1 cónyuge viuda: S/. 25,000<br>
            • Deudas S/. 25,000: se descuentan primero<br><br>
            
            <strong>7. TIEMPO DEL PROCESO:</strong><br>
            • Sucesión intestada: 6-12 meses<br>
            • Con complicaciones: 1-2 años<br>
            • Juicios por herencia: 2-5 años<br><br>
            
            <strong>RECOMENDACIÓN:</strong> Contrate abogado especialista en sucesiones.`;
        }

        // ROBO VS HURTO
        if (q.includes('robo') || q.includes('hurto')) {
            return `<strong>Diferencia entre Robo y Hurto en Perú (Código Penal)</strong><br><br>
            
            <strong>1. ROBO (Artículo 188 Código Penal)</strong><br>
            <strong>Definición:</strong> Sustracci\u00f3n de bien ajeno CON VIOLENCIA o INTIMIDACI\u00d3N<br><br>
            
            <strong>Características:</strong><br>
            ✓ Hay un acto de violencia o amenaza<br>
            ✓ Contra persona o bienes<br>
            ✓ Apoderamiento del bien<br>
            ✓ Bien debe ser ajeno<br><br>
            
            <strong>Ejemplos:</strong><br>
            • Arrebatar bolsa/cartera<br>
            • Asalto a mano armada<br>
            • Robo en casa con violencia<br>
            • Robo con navaja/pistola<br><br>
            
            <strong>Penas Básicas:</strong><br>
            • <strong>Robo Simple:</strong> 3 a 8 años<br>
            • <strong>Robo Agravado:</strong> 10 a 20 años<br>
            • <strong>Robo a Mano Armada:</strong> 12 a 20 años<br>
            • <strong>Robo en Banda:</strong> 15 a 25 años<br><br>
            
            <strong>2. HURTO (Artículo 185 Código Penal)</strong><br>
            <strong>Definición:</strong> Sustracci\u00f3n de bien ajeno SIN VIOLENCIA ni INTIMIDACI\u00d3N<br><br>
            
            <strong>Características:</strong><br>
            ✓ NO hay violencia<br>
            ✓ NO hay amenaza<br>
            ✓ Se roba sin que vea el dueño<br>
            ✓ Apoderamiento clandestino<br><br>
            
            <strong>Ejemplos:</strong><br>
            • Robar sin que vean<br>
            • Hurto en tienda (shoplifting)<br>
            • Robar mochila en autobús<br>
            • Sustraer dinero de bolsillo<br><br>
            
            <strong>Penas Básicas:</strong><br>
            • <strong>Hurto Simple:</strong> 1 a 3 años<br>
            • <strong>Hurto Agravado:</strong> 3 a 6 años<br>
            • <strong>Hurto de Bien de Valor:</strong> 2 a 4 años<br><br>
            
            <strong>3. COMPARACIÓN RÁPIDA:</strong><br>
            <table style=\"width:100%; border-collapse: collapse;\">
            <tr style=\"background: #f0f0f0;\">
            <td style=\"border: 1px solid #ddd; padding: 8px;\"><strong>ASPECTO</strong></td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\"><strong>ROBO</strong></td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\"><strong>HURTO</strong></td>
            </tr>
            <tr>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">Violencia</td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">SÍ</td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">NO</td>
            </tr>
            <tr>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">Amenaza</td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">SÍ</td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">NO</td>
            </tr>
            <tr>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">Pena Mínima</td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">3 años</td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">1 año</td>
            </tr>
            <tr>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">Pena Máxima</td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">25 años</td>
            <td style=\"border: 1px solid #ddd; padding: 8px;\">6 años</td>
            </tr>
            </table><br>
            
            <strong>4. SI SOY VÍCTIMA:</strong><br>
            1. Denunciar inmediatamente a policía o fiscalía<br>
            2. Obtener número de denuncia<br>
            3. Recopilar evidencia (fotos, testigos)<br>
            4. Presentar demanda civil por daños<br>
            5. Participar en investigación<br><br>
            
            <strong>DIFERENCIA CLAVE:</strong><br>
            <strong>ROBO = VIOLENCIA + SUSTRACCI\u00d3N</strong><br>
            <strong>HURTO = SOLO SUSTRACCI\u00d3N (sin fuerza)</strong>`;
        }

        // DEMANDA CIVIL
        if (q.includes('demanda')) {
            return `<strong>Cómo Presentar una Demanda Civil en Perú</strong><br><br>
            
            <strong>1. REQUISITOS PREVIOS:</strong><br>
            ✓ Intentar conciliación (OBLIGATORIO)<br>
            ✓ Asesoría de abogado especializado<br>
            ✓ Recopilar pruebas y documentos<br>
            ✓ Determinar cuantía del reclamo<br><br>
            
            <strong>2. ESTRUCTURA DE LA DEMANDA:</strong><br>
            <strong>A) Encabezamiento:</strong><br>
            • Tribunal competente<br>
            • Nombre demandante<br>
            • Nombre demandado<br><br>
            
            <strong>B) Hechos Constitutivos:</strong><br>
            • Narración cronológica clara<br>
            • Lo que pasó paso a paso<br>
            • Hechos que se pueden probar<br><br>
            
            <strong>C) Fundamentación Legal:</strong><br>
            • Artículos del Código aplicables<br>
            • Jurisprudencia relevante<br>
            • Doctrina legal<br><br>
            
            <strong>D) Petitorio:</strong><br>
            • Lo que pide al tribunal<br>
            • Claro y específico<br>
            • Cuantía exacta (si es dinero)<br><br>
            
            <strong>E) Pruebas:</strong><br>
            • Documentos anexos<br>
            • Testigos que declare<br>
            • Peritos (si necesita evaluación)<br><br>
            
            <strong>F) Firma:</strong><br>
            • Demandante<br>
            • Abogado (con número de colegiatura)<br><br>
            
            <strong>3. DOCUMENTOS A ANEXAR:</strong><br>
            ✓ Copia DNI demandante<br>
            ✓ Copia DNI demandado<br>
            ✓ Contrato (si existe)<br>
            ✓ Recibos y comprobantes<br>
            ✓ Correspondencia (emails, cartas)<br>
            ✓ Fotos/videos de prueba<br>
            ✓ Pericia técnica (si aplica)<br><br>
            
            <strong>4. ¿DÓNDE PRESENTAR?</strong><br>
            Juzgado Civil competente:<br>
            ✓ Por materia (civil, familia, laboral)<br>
            ✓ Por cantidad (hasta 70 UIT = juzgado)<br>
            ✓ Por territorio (donde vive demandado)<br><br>
            
            <strong>5. PROCESO JUDICIAL:</strong><br>
            1. <strong>Demanda:</strong> Presentación de escrito<br>
            2. <strong>Admisión:</strong> Juez revisa y admite<br>
            3. <strong>Notificación:</strong> Se notifica al demandado<br>
            4. <strong>Contestación:</strong> Demandado responde (10-30 días)<br>
            5. <strong>Pruebas:</strong> Presentación de evidencia (3-6 meses)<br>
            6. <strong>Audiencia:</strong> Juez escucha a ambas partes<br>
            7. <strong>Alegatos:</strong> Argumentos finales<br>
            8. <strong>Sentencia:</strong> Fallo del juez<br>
            9. <strong>Apelación:</strong> 10 días para apelar (opcional)<br><br>
            
            <strong>6. COSTOS:</strong><br>
            ✓ Honorarios abogado (varía)<br>
            ✓ Aranceles judiciales<br>
            ✓ Notarización de documentos<br>
            ✓ Copias certificadas<br><br>
            
            <strong>7. TIEMPO DEL PROCESO:</strong><br>
            • Juzgado civil: 1-3 años<br>
            • Con apelación: 2-4 años<br>
            • Con casación: 3-5 años<br><br>
            
            <strong>CONSEJOS:</strong><br>
            1. Contrate abogado con experiencia<br>
            2. Recopile pruebas ANTES de demandar<br>
            3. Intente conciliación primero<br>
            4. Guarde todos los documentos<br>
            5. Sea paciente (proceso es lento)`;
        }

        // RESPUESTA GENÉRICA
        return `<strong>Consulta Legal</strong><br><br>
        Soy <strong>LEXIA</strong>, tu asistente legal inteligente alimentado por lpderecho.pe.<br><br>
        <strong>Puedo ayudarte con:</strong><br>
        <strong>Derecho Civil:</strong> Contratos de compraventa, propiedad, herencias, familia<br>
        <strong>Derecho Penal:</strong> Delitos, robo, hurto, fraude, procedimiento penal<br>
        <strong>Derecho Laboral:</strong> Despidos, indemnización, seguridad social<br>
        <strong>Derecho Comercial:</strong> Empresas, sociedades, contratos<br>
        <strong>Derecho Familiar:</strong> Divorcio, alimentos, custodia<br>
        <strong>Procedimiento:</strong> Cómo presentar demanda, juicios<br><br>
        
        <strong>Pregunta específicamente sobre:</strong><br>
        • \"¿Cuáles son los requisitos para un contrato de compraventa?\"<br>
        • \"¿Qué derechos tengo si me despiden sin causa?\"<br>
        • \"¿Cuál es el procedimiento para un divorcio?\"<br>
        • \"¿Diferencia entre robo y hurto?\"<br>
        • \"¿Cómo presento una demanda civil?\"<br>
        • \"¿Cómo funciona una herencia?\"<br><br>
        
        Respuestas basadas en lpderecho.pe y legislación peruana vigente.`;
    }

    async function sendMessage(initialText = "") {
        const text = (typeof initialText === "string" && initialText ? initialText : chatComposerInput.value).trim();
        if (!text || isSending) return;

        isSending = true;
        chatComposerSend.disabled = true;

        const session = ensureActiveSession(text);
        const createdAt = new Date().toISOString();
        const stableMessages = [...session.messages];

        if (!stableMessages.length) {
            session.title = text.slice(0, 90);
        }

        session.messages = [
            ...stableMessages,
            { role: "user", content: text, createdAt },
            { role: "system", content: "Procesando consulta jurídica...", createdAt }
        ];
        upsertChatSession(session);
        renderChatSessions();
        renderChatThread();
        chatComposerInput.value = "";

        try {
            const endpointBase = window.BACKEND_URL || window.location.origin;
            const response = await fetch(`${endpointBase}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: `${buildRoleAssistantPrompt()}\n\nConsulta del usuario:\n${text}`
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || "No se pudo obtener una respuesta jurídica.");
            }

            const answer = (data.answer || "").trim() || "No se obtuvo una respuesta válida.";
            session.messages = [
                ...stableMessages,
                { role: "user", content: text, createdAt },
                { role: "assistant", content: answer, createdAt: new Date().toISOString() }
            ];
            upsertChatSession(session);
            addHistoryEntry(text, answer);
            addNotification("Nueva respuesta de LEXIA", text.slice(0, 96));
        } catch (error) {
            session.messages = [
                ...stableMessages,
                { role: "user", content: text, createdAt },
                {
                    role: "assistant",
                    content: `No pude completar la consulta en este momento. ${error.message || "Verifica la conexión del backend y la clave de OpenAI."}`,
                    createdAt: new Date().toISOString()
                }
            ];
            upsertChatSession(session);
        } finally {
            isSending = false;
            chatComposerSend.disabled = false;
            renderChatSessions();
            renderChatThread();
            renderAppState();
            chatComposerInput.focus();
        }
    }

    sendBtn.addEventListener("click", () => {
        const draft = input.value.trim();
        openChatView({ draft, autoSend: Boolean(draft) });
        input.value = "";
    });

    input.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        const draft = input.value.trim();
        openChatView({ draft, autoSend: Boolean(draft) });
        input.value = "";
    });

    document.querySelectorAll(".quick-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            openChatView({ draft: `Explícame ${btn.textContent.trim()} en Derecho peruano.`, autoSend: true });
        });
    });

    roleQuickGrid?.addEventListener("click", event => {
        const card = event.target.closest(".quick-card");
        if (!card) return;
        const title = card.querySelector("strong")?.textContent?.trim().toLowerCase() || "";
        if (title.includes("consulta")) {
            openChatView();
        }
    });

    chatComposerSend?.addEventListener("click", () => {
        void sendMessage();
    });

    chatComposerInput?.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void sendMessage();
        }
    });

    newChatSessionButton?.addEventListener("click", () => {
        createChatSession();
        renderChatSessions();
        renderChatThread();
        chatComposerInput.value = "";
        chatComposerInput.focus();
    });

    chatSuggestions?.addEventListener("click", event => {
        const button = event.target.closest(".chat-suggestion");
        if (!button) return;
        chatComposerInput.value = button.textContent.trim();
        chatComposerInput.focus();
    });

    chatSessionList?.addEventListener("click", event => {
        const button = event.target.closest("[data-session-id]");
        if (!button) return;
        activeChatSessionId = button.dataset.sessionId;
        renderChatSessions();
        renderChatThread();
    });

    notificationButton.addEventListener("click", () => {
        const isHidden = notificationPanel.hidden;
        notificationPanel.hidden = !isHidden;
        notificationButton.setAttribute("aria-expanded", String(isHidden));
        accountMenu.hidden = true;
        accountButton?.setAttribute("aria-expanded", "false");
    });

    accountButton?.addEventListener("click", () => {
        const isHidden = accountMenu.hidden;
        accountMenu.hidden = !isHidden;
        accountButton.setAttribute("aria-expanded", String(isHidden));
        notificationPanel.hidden = true;
        notificationButton.setAttribute("aria-expanded", "false");
    });

    logoutButton?.addEventListener("click", () => {
        window.LexiaAuth?.clearSession?.();
        window.location.href = "/login";
    });

    markNotificationsRead.addEventListener("click", () => {
        const notifications = loadList(storageKeys.notifications).map(item => (
            item.role === currentRole ? { ...item, read: true } : item
        ));
        saveList(storageKeys.notifications, notifications);
        renderAppState();
    });

    clearHistoryButton.addEventListener("click", () => {
        const currentHistory = getHistory();
        if (!currentHistory.length) return;
        const remaining = loadList(storageKeys.history).filter(item => item.role !== currentRole);
        saveList(storageKeys.history, remaining);
        addNotification("Historial limpiado", "Se eliminaron las consultas guardadas para este rol.");
        renderAppState();
    });

    document.querySelectorAll("[data-action]").forEach(item => {
        item.addEventListener("click", event => {
            const action = item.dataset.action;
            if (action === "new-query") {
                event.preventDefault();
                openChatView();
            }
            if (action === "home") {
                event.preventDefault();
                showView("dashboard");
            }
            if (action === "history") {
                event.preventDefault();
                showView("dashboard");
                document.getElementById("historial").scrollIntoView({ behavior: "smooth", block: "start" });
            }
            if (action === "notifications") {
                event.preventDefault();
                notificationPanel.hidden = false;
                notificationButton.setAttribute("aria-expanded", "true");
            }
            if (["documents", "favorites", "deadlines", "profile", "settings"].includes(action)) {
                event.preventDefault();
                addNotification("Sección sin datos registrados", "Todavía no hay información creada para esta sección.");
                renderAppState();
                notificationPanel.hidden = false;
                notificationButton.setAttribute("aria-expanded", "true");
            }
        });
    });

    document.addEventListener("click", event => {
        if (accountWrapContains(event.target)) return;
        if (notificationWrapContains(event.target)) return;

        accountMenu.hidden = true;
        accountButton?.setAttribute("aria-expanded", "false");
        notificationPanel.hidden = true;
        notificationButton.setAttribute("aria-expanded", "false");
    });

    function accountWrapContains(target) {
        return accountButton?.closest(".account-wrap")?.contains(target) || false;
    }

    function notificationWrapContains(target) {
        return notificationButton?.closest(".notification-wrap")?.contains(target) || false;
    }

    if (window.location.hash === "#consulta") {
        openChatView();
    } else {
        showView("dashboard");
    }
});


