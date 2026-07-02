document.addEventListener("DOMContentLoaded", () => {

    const sendBtn = document.getElementById("sendBtn");
    const input = document.getElementById("messageInput");
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
    const greeting = document.getElementById("dashboardGreeting");
    const dashboardSubtitle = document.getElementById("dashboardSubtitle");
    const accountLabel = document.getElementById("accountLabel");
    const accountPlan = document.getElementById("accountPlan");
    const heroTitle = document.getElementById("heroTitle");
    const heroSubtitle = document.getElementById("heroSubtitle");
    const resourceTitle = document.getElementById("resourceTitle");
    const planTitle = document.getElementById("planTitle");
    const planDescription = document.getElementById("planDescription");
    const planFeatures = document.getElementById("planFeatures");
    const mainPanel = document.getElementById("mainPanel");
    const dashboardView = document.getElementById("dashboardView");
    const legalChatView = document.getElementById("legalChatView");
    const brainView = document.getElementById("brainView");
    const documentsView = document.getElementById("documentos");
    const documentsNavItems = document.querySelectorAll("[data-documents-link]");
    const uploadDocumentButton = document.getElementById("uploadDocumentButton");
    const documentFileInput = document.getElementById("documentFileInput");
    const documentDropZone = document.getElementById("documentDropZone");
    const documentSearchInput = document.getElementById("documentSearchInput");
    const documentTypeFilter = document.getElementById("documentTypeFilter");
    const documentsList = document.getElementById("documentsList");
    const documentsStatus = document.getElementById("documentsStatus");
    const documentTotalCount = document.getElementById("documentTotalCount");
    const documentTotalSize = document.getElementById("documentTotalSize");
    const documentRecentCount = document.getElementById("documentRecentCount");
    const caseReviewer = document.getElementById("caseReviewer");
    const closeCaseReviewer = document.getElementById("closeCaseReviewer");
    const caseReviewerTitle = document.getElementById("caseReviewerTitle");
    const caseReviewerStatus = document.getElementById("caseReviewerStatus");
    const casePdfPages = document.getElementById("casePdfPages");
    const caseFindingNumber = document.getElementById("caseFindingNumber");
    const caseFindingYear = document.getElementById("caseFindingYear");
    const caseFindingJurisdiction = document.getElementById("caseFindingJurisdiction");
    const caseFindingAccused = document.getElementById("caseFindingAccused");
    const caseFindingArea = document.getElementById("caseFindingArea");
    const caseFindingStage = document.getElementById("caseFindingStage");
    const caseFindingUrgency = document.getElementById("caseFindingUrgency");
    const caseImportantPoints = document.getElementById("caseImportantPoints");
    const caseAnalysisReport = document.getElementById("caseAnalysisReport");
    const chatSessionList = document.getElementById("chatSessionList");
    const chatThread = document.getElementById("chatThread");
    const chatComposerInput = document.getElementById("chatComposerInput");
    const chatComposerSend = document.getElementById("chatComposerSend");
    const chatViewTitle = document.getElementById("chatViewTitle");
    const chatViewSubtitle = document.getElementById("chatViewSubtitle");
    const newChatSessionButton = document.getElementById("newChatSessionButton");
    const brainUrlForm = document.getElementById("brainUrlForm");
    const brainUrlInput = document.getElementById("brainUrlInput");
    const brainMatterInput = document.getElementById("brainMatterInput");
    const brainModuleInput = document.getElementById("brainModuleInput");
    const brainAnalyzeButton = document.getElementById("brainAnalyzeButton");
    const brainStatus = document.getElementById("brainStatus");
    const brainSourceList = document.getElementById("brainSourceList");
    const brainSourceCounter = document.getElementById("brainSourceCounter");
    const refreshBrainSources = document.getElementById("refreshBrainSources");
    const brainNavItems = document.querySelectorAll('[data-action="brain"]');
    const screenReaderStatus = document.getElementById("screenReaderStatus");
    const voiceAssistToggle = document.getElementById("voiceAssistToggle");

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
            subtitle: "Gestiona consultas, jurisprudencia, normativa, documentos, clientes, casos, agenda y plantillas.",
            plan: "Cuenta profesional",
            heroTitle: "Espacio legal para tu práctica diaria",
            heroSubtitle: "Centraliza consulta jurídica, jurisprudencia, normas, documentos, clientes, casos, agenda y plantillas.",
            resourceTitle: "Jurisprudencia y normativa clave",
            quick: [
                ["fa-regular fa-comment-dots", "Consulta jurídica", "Preguntas, casos y estrategia"],
                ["fa-solid fa-scale-balanced", "Jurisprudencia", "Criterios para argumentar"],
                ["fa-solid fa-landmark", "Normativa", "Leyes, códigos y requisitos"],
                ["fa-regular fa-file-lines", "Documentos", "Contratos, demandas y anexos"],
                ["fa-regular fa-address-book", "Clientes", "Datos, asuntos y seguimiento"],
                ["fa-solid fa-briefcase", "Casos", "Materia, estado y riesgo"],
                ["fa-regular fa-calendar-check", "Agenda", "Plazos, audiencias y tareas"],
                ["fa-regular fa-clipboard", "Plantillas", "Modelos listos para adaptar"]
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
                ["fa-regular fa-file-lines", "Gestor documental", "Organiza escritos y anexos"],
                ["fa-solid fa-scale-balanced", "Matriz de caso", "Ordena hechos, pruebas y argumentos"]
            ],
            features: ["Consulta jurídica", "Jurisprudencia y normativa", "Documentos y plantillas", "Clientes, casos y agenda"]
        },
        "estudio-juridico": {
            label: "Estudio Jurídico",
            greeting: "¡Hola, Estudio Jurídico!",
            subtitle: "Coordina equipo, expedientes, revisiones y productividad de la firma.",
            plan: "Cuenta de estudio",
            heroTitle: "Centro operativo para estudios jurídicos",
            heroSubtitle: "Asigna consultas, revisa documentos en equipo y estandariza entregables legales.",
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

    const params = new URLSearchParams(window.location.search);
    const authSession = window.LexiaAuth?.getSession?.() || null;
    const currentEmail = window.LexiaAuth?.normalizeEmail
        ? window.LexiaAuth.normalizeEmail(params.get("email") || authSession?.email || "")
        : String(params.get("email") || authSession?.email || "").trim().toLowerCase();
    const storageOwner = currentEmail || "guest";
    const scopedStorageKey = key => `${key}:${storageOwner}`;

    const storageKeys = {
        role: scopedStorageKey("lexiaRole"),
        chats: scopedStorageKey("lexiaChats"),
        notifications: scopedStorageKey("lexiaNotifications"),
        documents: scopedStorageKey("lexiaDocuments"),
        deadlines: scopedStorageKey("lexiaDeadlines")
    };

    let currentRole = "abogado-independiente";
    let currentView = "dashboard";
    let activeChatSessionId = null;
    let isSending = false;
    let canSuggestBrainSources = false;
    let canCurateBrainSources = false;
    let documentDatabasePromise = null;
    let pdfJsPromise = null;
    let caseRenderingToken = 0;
    let activeCaseDocumentId = null;
    const documentAnalysisPolls = new Map();
    let voiceAssistEnabled = localStorage.getItem("lexiaVoiceAssist") === "true";
    let lastSpokenLabel = "";
    let lastSpokenAt = 0;
    let activeSpeechUtterance = null;
    const voiceIntroMessage = "Si eres una persona con discapacidad visual, haz clic para activarme y brindarte asesoría por voz mediante el sistema TalkBack.";

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

    function openDocumentDatabase() {
        if (documentDatabasePromise) return documentDatabasePromise;
        documentDatabasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open("lexia-private-documents", 2);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains("files")) {
                    database.createObjectStore("files", { keyPath: "id" });
                }
                if (!database.objectStoreNames.contains("analyses")) {
                    database.createObjectStore("analyses", { keyPath: "id" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento privado."));
        });
        return documentDatabasePromise;
    }

    async function storeDocumentFile(id, file) {
        const database = await openDocumentDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction("files", "readwrite");
            transaction.objectStore("files").put({ id, blob: file });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el archivo."));
        });
    }

    async function getDocumentFile(id) {
        const database = await openDocumentDatabase();
        return new Promise((resolve, reject) => {
            const request = database.transaction("files", "readonly").objectStore("files").get(id);
            request.onsuccess = () => resolve(request.result?.blob || null);
            request.onerror = () => reject(request.error || new Error("No se pudo recuperar el archivo."));
        });
    }

    async function storeDocumentAnalysis(id, result) {
        const database = await openDocumentDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction("analyses", "readwrite");
            transaction.objectStore("analyses").put({ id, result, savedAt: new Date().toISOString() });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("No se pudo guardar el resultado del análisis."));
        });
    }

    async function getDocumentAnalysis(id) {
        const database = await openDocumentDatabase();
        return new Promise((resolve, reject) => {
            const request = database.transaction("analyses", "readonly").objectStore("analyses").get(id);
            request.onsuccess = () => resolve(request.result?.result || null);
            request.onerror = () => reject(request.error || new Error("No se pudo recuperar el resultado del análisis."));
        });
    }

    async function removeDocumentFile(id) {
        const database = await openDocumentDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(["files", "analyses"], "readwrite");
            transaction.objectStore("files").delete(id);
            transaction.objectStore("analyses").delete(id);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("No se pudo eliminar el archivo."));
        });
    }

    function getApiBase() {
        return window.LEXIA_CONFIG?.apiBaseUrl || window.BACKEND_URL || window.location.origin;
    }

    async function apiJson(path, options = {}) {
        const response = await fetch(`${getApiBase()}${path}`, {
            headers: { "Content-Type": "application/json", ...(options.headers || {}) },
            ...options
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "No se pudo sincronizar con el servidor.");
        }
        return data;
    }

    function buildStableMessageId(sessionId, message, index) {
        return message.id || `${sessionId}:${index}:${message.role}:${message.createdAt || ""}`;
    }

    function normalizeRemoteSession(session) {
        return {
            id: session.id,
            role: session.role || currentRole,
            title: session.title || "Nueva consulta",
            createdAt: session.createdAt || new Date().toISOString(),
            updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
            messages: Array.isArray(session.messages) ? session.messages : []
        };
    }

    function serializeSessionForApi(session, includeMessages = false) {
        return {
            id: session.id,
            role: session.role || currentRole,
            title: session.title || "Nueva consulta",
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messages: includeMessages
                ? (session.messages || [])
                    .filter(message => message.role !== "system")
                    .map((message, index) => ({
                        id: buildStableMessageId(session.id, message, index),
                        role: message.role,
                        content: message.content,
                        createdAt: message.createdAt,
                        metadata: message.metadata || {}
                    }))
                : []
        };
    }

    async function saveChatSessionToApi(session, includeMessages = false) {
        if (!currentEmail || !session?.id) return false;
        await apiJson("/api/chats", {
            method: "POST",
            body: JSON.stringify({
                email: currentEmail,
                session: serializeSessionForApi(session, includeMessages)
            })
        });
        return true;
    }

    async function migrateLocalChatsToApi(localSessions) {
        if (!currentEmail || !localSessions.length) return;

        for (const session of localSessions) {
            await saveChatSessionToApi(session, true);
        }
    }

    async function initializeRemoteChats() {
        if (!currentEmail) return;

        try {
            const localSessions = getChatSessions();
            const data = await apiJson(`/api/chats?email=${encodeURIComponent(currentEmail)}&role=${encodeURIComponent(currentRole)}`);
            const remoteSessions = Array.isArray(data.chats) ? data.chats.map(normalizeRemoteSession) : [];
            const deletedChatIds = new Set(Array.isArray(data.deletedChatIds) ? data.deletedChatIds : []);
            const activeLocalSessions = localSessions.filter(localSession => !deletedChatIds.has(localSession.id));
            if (activeLocalSessions.length !== localSessions.length) {
                saveChatSessions(activeLocalSessions);
                if (activeChatSessionId && deletedChatIds.has(activeChatSessionId)) {
                    activeChatSessionId = activeLocalSessions[0]?.id || remoteSessions[0]?.id || null;
                }
            }
            const localOnlySessions = activeLocalSessions.filter(localSession => (
                !remoteSessions.some(remoteSession => remoteSession.id === localSession.id)
            ));

            if (remoteSessions.length) {
                if (localOnlySessions.length) {
                    await migrateLocalChatsToApi(localOnlySessions);
                }
                const mergedSessions = [...remoteSessions, ...localOnlySessions]
                    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                saveChatSessions(mergedSessions);
                if (!activeChatSessionId || !mergedSessions.some(item => item.id === activeChatSessionId)) {
                    activeChatSessionId = mergedSessions[0]?.id || null;
                }
                renderChatSessions();
                renderChatThread();
                renderAppState();
                return;
            }

            if (activeLocalSessions.length) {
                await migrateLocalChatsToApi(activeLocalSessions);
            } else if (deletedChatIds.size) {
                saveChatSessions([]);
                activeChatSessionId = null;
                renderChatSessions();
                renderChatThread();
                renderAppState();
            }
        } catch (error) {
            console.warn("LEXIA usará chats locales como respaldo:", error.message);
        }
    }

    function normalizeRemoteNotification(notification) {
        return {
            id: notification.id,
            role: notification.role || currentRole,
            title: notification.title || "Notificación",
            detail: notification.detail || "",
            read: Boolean(notification.read),
            createdAt: notification.createdAt || new Date().toISOString()
        };
    }

    function serializeNotificationForApi(notification) {
        return {
            id: notification.id,
            role: notification.role || currentRole,
            title: notification.title || "Notificación",
            detail: notification.detail || "",
            read: Boolean(notification.read),
            createdAt: notification.createdAt
        };
    }

    async function saveNotificationToApi(notification) {
        if (!currentEmail || !notification?.id) return false;
        await apiJson("/api/notifications", {
            method: "POST",
            body: JSON.stringify({
                email: currentEmail,
                notification: serializeNotificationForApi(notification)
            })
        });
        return true;
    }

    async function migrateLocalNotificationsToApi(localNotifications) {
        if (!currentEmail || !localNotifications.length) return;

        for (const notification of localNotifications) {
            await saveNotificationToApi(notification);
        }
    }

    async function initializeRemoteNotifications() {
        if (!currentEmail) return;

        try {
            const localNotifications = getNotifications();
            const data = await apiJson(`/api/notifications?email=${encodeURIComponent(currentEmail)}&role=${encodeURIComponent(currentRole)}`);
            const remoteNotifications = Array.isArray(data.notifications)
                ? data.notifications.map(normalizeRemoteNotification)
                : [];
            const localOnlyNotifications = localNotifications.filter(localNotification => (
                !remoteNotifications.some(remoteNotification => remoteNotification.id === localNotification.id)
            ));

            if (remoteNotifications.length) {
                if (localOnlyNotifications.length) {
                    await migrateLocalNotificationsToApi(localOnlyNotifications);
                }
                const otherRoles = loadList(storageKeys.notifications).filter(item => item.role !== currentRole);
                const mergedNotifications = [...remoteNotifications, ...localOnlyNotifications]
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                saveList(storageKeys.notifications, [...otherRoles, ...mergedNotifications].slice(0, 100));
                renderAppState();
                return;
            }

            if (localNotifications.length) {
                await migrateLocalNotificationsToApi(localNotifications);
            }
        } catch (error) {
            console.warn("LEXIA usará notificaciones locales como respaldo:", error.message);
        }
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

    function announce(message) {
        if (!screenReaderStatus || !message) return;
        screenReaderStatus.textContent = "";
        window.setTimeout(() => {
            screenReaderStatus.textContent = message;
        }, 30);
    }

    function getSpeechVoice() {
        const voices = window.speechSynthesis?.getVoices?.() || [];
        return voices.find(voice => voice.lang?.toLowerCase().startsWith("es-pe"))
            || voices.find(voice => voice.lang?.toLowerCase().startsWith("es"))
            || null;
    }

    function speak(message, options = {}) {
        const text = String(message || "").replace(/\s+/g, " ").trim();
        if (!text || !("speechSynthesis" in window)) return;
        if (!options.force && !voiceAssistEnabled) return;
        const speech = window.speechSynthesis;
        if (speech.speaking || speech.pending) speech.cancel();
        speech.resume?.();
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = getSpeechVoice();
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang || "es-PE";
        utterance.rate = 0.95;
        utterance.pitch = 1;
        activeSpeechUtterance = utterance;
        utterance.addEventListener("end", () => {
            if (activeSpeechUtterance === utterance) activeSpeechUtterance = null;
        }, { once: true });
        utterance.addEventListener("error", () => {
            if (activeSpeechUtterance === utterance) activeSpeechUtterance = null;
        }, { once: true });
        speech.speak(utterance);
    }

    function stopSpeaking() {
        if (!("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        activeSpeechUtterance = null;
    }

    function normalizeSpeechText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function getVisibleText(element) {
        if (!element) return "";
        const clone = element.cloneNode(true);
        clone.querySelectorAll("script, style, [aria-hidden='true'], .icon").forEach(node => node.remove());
        return normalizeSpeechText(clone.textContent);
    }

    function getControlLabel(element) {
        if (!element) return "";
        const explicitLabel = normalizeSpeechText(element.getAttribute("aria-label") || element.getAttribute("title"));
        if (explicitLabel) return explicitLabel;

        if (element.id) {
            const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
            const labelText = getVisibleText(label);
            if (labelText) return labelText;
        }

        const labelledBy = element.getAttribute("aria-labelledby");
        if (labelledBy) {
            const labelText = labelledBy
                .split(/\s+/)
                .map(id => getVisibleText(document.getElementById(id)))
                .join(" ");
            if (normalizeSpeechText(labelText)) return normalizeSpeechText(labelText);
        }

        const visibleText = getVisibleText(element);
        if (visibleText) return visibleText;

        const imageAlt = element.querySelector?.("img[alt]")?.getAttribute("alt");
        if (normalizeSpeechText(imageAlt)) return normalizeSpeechText(imageAlt);

        if (element.matches("input, textarea")) {
            return normalizeSpeechText(element.getAttribute("placeholder") || element.value || element.name || "");
        }

        return normalizeSpeechText(element.getAttribute("data-action") || element.getAttribute("href") || "");
    }

    function describeControl(element) {
        const label = getControlLabel(element);
        if (!label) return "";

        let type = "";
        if (element.matches("button, [role='button']")) type = "Botón";
        if (element.matches("a")) type = "Enlace";
        if (element.matches("input[type='search'], input[type='text'], input:not([type]), textarea")) type = "Campo de texto";
        if (element.matches("input[type='checkbox'], [role='switch']")) {
            const checked = element.checked || element.getAttribute("aria-checked") === "true";
            type = checked ? "Interruptor activado" : "Interruptor desactivado";
        }
        if (element.matches("select")) type = "Lista desplegable";
        if (element.matches("summary")) type = "Sección desplegable";

        return normalizeSpeechText(`${label}${type ? `, ${type.toLowerCase()}` : ""}`);
    }

    function speakFocusedControl(element, force = false) {
        const control = element?.closest?.("[data-voice-intro], label[for], button, a, input, textarea, select, summary, [role='button'], [role='switch'], [tabindex]:not([tabindex='-1'])");
        if (!control || control.closest("[hidden]")) return;
        const voiceIntro = control.closest("[data-voice-intro]")?.getAttribute("data-voice-intro");
        if (voiceIntro) {
            const now = Date.now();
            if (!force && voiceIntro === lastSpokenLabel && now - lastSpokenAt < 1800) return;
            lastSpokenLabel = voiceIntro;
            lastSpokenAt = now;
            speak(voiceIntro, { force: true });
            return;
        }
        const label = describeControl(control);
        if (!label) return;

        const now = Date.now();
        if (!force && label === lastSpokenLabel && now - lastSpokenAt < 900) return;
        lastSpokenLabel = label;
        lastSpokenAt = now;
        speak(label);
    }

    function speakVoiceIntroFromTarget(target) {
        const voiceToggle = target?.closest?.("[data-voice-intro]");
        if (voiceAssistEnabled) return false;
        if (!voiceToggle) return false;
        const now = Date.now();
        if (voiceIntroMessage === lastSpokenLabel && now - lastSpokenAt < 1800) return true;
        lastSpokenLabel = voiceIntroMessage;
        lastSpokenAt = now;
        speak(voiceIntroMessage, { force: true });
        return true;
    }

    function bindVoiceIntroHover() {
        document.querySelectorAll("[data-voice-intro]").forEach(element => {
            element.addEventListener("pointerenter", event => {
                if (voiceAssistEnabled) return;
                speakVoiceIntroFromTarget(event.currentTarget);
            });
            element.addEventListener("pointerleave", () => {
                stopSpeaking();
                lastSpokenLabel = "";
                lastSpokenAt = 0;
            });
        });
    }

    function setVoiceAssistEnabled(enabled, shouldSpeak = true) {
        voiceAssistEnabled = Boolean(enabled);
        localStorage.setItem("lexiaVoiceAssist", String(voiceAssistEnabled));
        if (voiceAssistToggle) {
            voiceAssistToggle.checked = voiceAssistEnabled;
            voiceAssistToggle.setAttribute("aria-checked", String(voiceAssistEnabled));
            voiceAssistToggle.setAttribute("aria-label", voiceAssistEnabled ? "Desactivar asistencia por voz" : "Activar asistencia por voz");
        }
        announce(voiceAssistEnabled ? "Asistencia por voz activa." : "Asistencia por voz desactivada.");
        if (shouldSpeak) {
            speak(voiceAssistEnabled ? `${voiceIntroMessage} Asistencia por voz activa. Te diré por qué botón o control estás pasando.` : "Asistencia por voz desactivada.", { force: true });
        }
    }

    function focusRegion(element) {
        if (!element) return;
        requestAnimationFrame(() => {
            element.focus({ preventScroll: true });
        });
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
        const isActionCard = className === "quick-card" && title.toLowerCase().includes("consulta");
        const actionAttributes = isActionCard
            ? ` role="button" tabindex="0" aria-label="${escapeHtml(`${title}. ${text}. Abrir consulta jurídica`)}"`
            : ` role="listitem"`;
        return `<article class="${className}"${actionAttributes}><span><i class="${icon} icon" aria-hidden="true"></i></span><strong>${title}</strong><small>${text}</small></article>`;
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
        return `Actúa como LEXIA para el rol ${roleConfig.label}. Conversa como una abogada peruana cercana, paciente y clara: entiende primero la preocupación del usuario, responde en palabras sencillas, explica los términos legales necesarios y luego da análisis jurídico, próximos pasos, riesgos, jurisprudencia o criterios cuando existan, y fuentes citadas o rutas de verificación. Cuando fundamentes una conclusión jurídica, cita la norma verificada en formato resaltable, por ejemplo [Código Penal, art. 173] o [Ley 30403]. Si faltan datos, responde lo posible con supuestos y haz preguntas concretas para continuar la conversación. Adapta la profundidad y el lenguaje al perfil del usuario.`;
    }

    function renderRole(role) {
        const selectedRole = roleDashboards[role] ? role : "abogado-independiente";
        const config = roleDashboards[selectedRole];
        currentRole = selectedRole;
        localStorage.setItem(storageKeys.role, selectedRole);

        greeting.textContent = config.greeting;
        dashboardSubtitle.textContent = config.subtitle;
        accountLabel.textContent = config.label;
        accountPlan.textContent = config.plan;
        heroTitle.textContent = config.heroTitle;
        heroSubtitle.textContent = config.heroSubtitle;
        resourceTitle.textContent = config.resourceTitle;
        planTitle.textContent = `LEXIA ${config.label}`;
        planDescription.textContent = config.plan;
        roleQuickGrid.innerHTML = config.quick.map(item => renderIconArticle(item, "quick-card")).join("");
        roleResourceList.innerHTML = config.resources.map(item => renderIconArticle(["fa-regular fa-file-lines", item[0], item[1]], "")).join("");
        roleToolsGrid.innerHTML = config.tools.map(item => renderIconArticle(item, "")).join("");
        planFeatures.innerHTML = config.features.map(feature => `<li>${feature}</li>`).join("");
        chatViewTitle.textContent = `Consulta jurídica para ${config.label}`;
        chatViewSubtitle.textContent = "Conversa sobre tu caso, entiende tus opciones y recibe próximos pasos en lenguaje claro.";
        if (!getChatSessions().some(item => item.id === activeChatSessionId)) {
            activeChatSessionId = null;
        }
        renderAppState();
        renderChatSessions();
        renderChatThread();
    }

    const savedRole = normalizeRole(localStorage.getItem(storageKeys.role));
    const currentAccount = currentEmail && window.LexiaAuth?.findAccount
        ? window.LexiaAuth.findAccount(currentEmail)
        : null;
    const initialRole = normalizeRole(
        params.get("role")
        || params.get("profile")
        || currentAccount?.profile
        || authSession?.profile
    ) || savedRole || "abogado-independiente";
    setVoiceAssistEnabled(voiceAssistEnabled, false);
    bindVoiceIntroHover();
    renderRole(initialRole);
    void initializeRemoteChats();
    void initializeRemoteNotifications();
    void initializeBrainAccess();

    function getNotifications() {
        return loadList(storageKeys.notifications).filter(item => item.role === currentRole);
    }

    function addNotification(title, detail) {
        const notifications = loadList(storageKeys.notifications);
        const notification = {
            id: createId(),
            role: currentRole,
            title,
            detail,
            read: false,
            createdAt: new Date().toISOString()
        };
        notifications.unshift(notification);
        saveList(storageKeys.notifications, notifications.slice(0, 50));
        void saveNotificationToApi(notification).catch(error => {
            console.warn("No se pudo sincronizar la notificación remota:", error.message);
        });
        announce(`${title}. ${detail}`);
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
            <article class="${item.read ? "" : "unread"}" role="listitem" aria-label="${escapeHtml(`${item.read ? "" : "No leída. "}${item.title}. ${item.detail}`)}">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.detail)}</span>
                <time datetime="${escapeHtml(item.createdAt)}">${formatDate(item.createdAt)}</time>
            </article>
        `).join("");
    }

    function renderStats() {
        const history = getChatSessions();
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
        renderNotifications();
        renderStats();
    }

    function getDocuments() {
        return loadList(storageKeys.documents)
            .filter(item => item.role === currentRole)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    function updateStoredDocument(id, patch) {
        let updated = null;
        const documents = loadList(storageKeys.documents).map(document => {
            if (document.id !== id) return document;
            updated = { ...document, ...patch };
            return updated;
        });
        saveList(storageKeys.documents, documents);
        return updated;
    }

    function getAnalysisStatusLabel(item) {
        if (item.analysisStatus === "completed") return "Análisis listo";
        if (item.analysisStatus === "failed") return "Análisis interrumpido · reintentar";
        if (["queued", "processing"].includes(item.analysisStatus)) {
            const progress = Math.max(0, Math.min(99, Number(item.analysisProgress) || 0));
            return progress ? `Analizando · ${progress}%` : "Análisis en segundo plano";
        }
        return "";
    }

    function getDocumentType(fileName = "", mimeType = "") {
        const extension = fileName.split(".").pop()?.toLowerCase() || "";
        if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
        if (mimeType.startsWith("image/") || ["png", "jpg", "jpeg"].includes(extension)) return "image";
        if (["doc", "docx"].includes(extension) || mimeType.includes("wordprocessingml") || mimeType.includes("msword")) return "word";
        return "text";
    }

    function getDocumentIcon(type) {
        const icons = {
            pdf: "fa-regular fa-file-pdf",
            word: "fa-regular fa-file-word",
            image: "fa-regular fa-file-image",
            text: "fa-regular fa-file-lines"
        };
        return icons[type] || icons.text;
    }

    function formatFileSize(bytes) {
        const size = Number(bytes) || 0;
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10240 ? 1 : 0)} KB`;
        return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    }

    function setDocumentsStatus(message, type = "info") {
        if (!documentsStatus) return;
        documentsStatus.hidden = !message;
        documentsStatus.textContent = message || "";
        documentsStatus.classList.toggle("error", type === "error");
    }

    function renderDocuments() {
        if (!documentsList) return;
        const allDocuments = getDocuments();
        const query = String(documentSearchInput?.value || "").trim().toLowerCase();
        const selectedType = documentTypeFilter?.value || "all";
        const visibleDocuments = allDocuments.filter(item => {
            const matchesQuery = !query || String(item.name || "").toLowerCase().includes(query);
            const matchesType = selectedType === "all" || item.type === selectedType;
            return matchesQuery && matchesType;
        });
        const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        documentTotalCount.textContent = String(allDocuments.length);
        documentTotalSize.textContent = formatFileSize(allDocuments.reduce((total, item) => total + (Number(item.size) || 0), 0));
        documentRecentCount.textContent = String(allDocuments.filter(item => new Date(item.createdAt).getTime() >= weekAgo).length);

        if (!visibleDocuments.length) {
            const hasFilters = Boolean(query || selectedType !== "all");
            documentsList.innerHTML = `
                <div class="documents-empty" role="status">
                    <span><i class="${hasFilters ? "fa-solid fa-magnifying-glass" : "fa-regular fa-folder-open"} icon" aria-hidden="true"></i></span>
                    <strong>${hasFilters ? "No encontramos expedientes" : "Aún no tienes expedientes"}</strong>
                    <small>${hasFilters ? "Prueba con otro nombre o tipo de archivo." : "Sube tu primer expediente para analizarlo."}</small>
                </div>
            `;
            return;
        }

        documentsList.innerHTML = `
            <div class="document-list-head" aria-hidden="true">
                <span>Expediente</span><span>Tamaño</span><span>Fecha de carga</span><span>Acciones</span>
            </div>
            ${visibleDocuments.map(item => `
                <article class="document-item" role="listitem" data-document-id="${escapeHtml(item.id)}">
                    <div class="document-file">
                        <span class="document-file-icon ${escapeHtml(item.type)}"><i class="${getDocumentIcon(item.type)} icon" aria-hidden="true"></i></span>
                        <div>
                            <strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong>
                            <small>${escapeHtml([
                                String(item.extension || item.type).toUpperCase(),
                                item.classification?.area,
                                item.classification?.stage,
                                getAnalysisStatusLabel(item)
                            ].filter(Boolean).join(" · "))}</small>
                        </div>
                    </div>
                    <span>${formatFileSize(item.size)}</span>
                    <span>${formatDate(item.createdAt)}</span>
                    <div class="document-actions">
                        <button class="document-action analyze" type="button" data-document-analyze title="Analizar expediente ${escapeHtml(item.name)}" aria-label="Analizar expediente ${escapeHtml(item.name)}">
                            <i class="fa-solid fa-magnifying-glass-chart icon" aria-hidden="true"></i>
                            <span>${item.analysisStatus === "completed" ? "Ver análisis" : (["queued", "processing"].includes(item.analysisStatus) ? "Ver progreso" : "Analizar")}</span>
                        </button>
                        <button class="document-action" type="button" data-document-download title="Descargar ${escapeHtml(item.name)}" aria-label="Descargar ${escapeHtml(item.name)}">
                            <i class="fa-solid fa-download icon" aria-hidden="true"></i>
                        </button>
                        <button class="document-action delete" type="button" data-document-delete title="Eliminar ${escapeHtml(item.name)}" aria-label="Eliminar ${escapeHtml(item.name)}">
                            <i class="fa-regular fa-trash-can icon" aria-hidden="true"></i>
                        </button>
                    </div>
                </article>
            `).join("")}
        `;
    }

    async function importDocuments(fileList) {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        const allowedExtensions = new Set(["pdf", "doc", "docx", "txt", "rtf", "png", "jpg", "jpeg"]);
        const maxBytes = 25 * 1024 * 1024;
        const metadata = loadList(storageKeys.documents);
        let imported = 0;
        const analyzableDocumentIds = [];
        const errors = [];

        setDocumentsStatus(`Guardando ${files.length === 1 ? "documento" : `${files.length} documentos`}...`);
        for (const file of files) {
            const extension = file.name.split(".").pop()?.toLowerCase() || "";
            if (!allowedExtensions.has(extension)) {
                errors.push(`${file.name}: formato no permitido`);
                continue;
            }
            if (file.size > maxBytes) {
                errors.push(`${file.name}: supera 25 MB`);
                continue;
            }

            const id = createId();
            try {
                await storeDocumentFile(id, file);
                metadata.unshift({
                    id,
                    role: currentRole,
                    owner: storageOwner,
                    name: file.name,
                    extension,
                    type: getDocumentType(file.name, file.type),
                    mimeType: file.type || "application/octet-stream",
                    size: file.size,
                    createdAt: new Date().toISOString()
                });
                if (["pdf", "txt"].includes(extension)) analyzableDocumentIds.push(id);
                imported += 1;
            } catch (error) {
                errors.push(`${file.name}: ${error.message}`);
            }
        }

        if (imported) {
            saveList(storageKeys.documents, metadata);
            addNotification("Documentos guardados", `${imported} ${imported === 1 ? "archivo fue guardado" : "archivos fueron guardados"} de forma privada.`);
            renderAppState();
            renderDocuments();
        }
        if (errors.length) {
            setDocumentsStatus(`${imported ? `${imported} guardado(s). ` : ""}${errors.join(" · ")}`, "error");
        } else {
            setDocumentsStatus(`${imported} ${imported === 1 ? "documento guardado" : "documentos guardados"} correctamente.`);
        }
        if (documentFileInput) documentFileInput.value = "";
        if (files.length === 1 && analyzableDocumentIds.length === 1) {
            await analyzeDocument(analyzableDocumentIds[0]);
        } else if (analyzableDocumentIds.length > 1) {
            setDocumentsStatus(`${imported} expedientes guardados. Usa el botón Analizar del expediente que deseas revisar primero.`);
        }
    }

    async function downloadDocument(id) {
        const item = getDocuments().find(document => document.id === id);
        if (!item) return;
        try {
            const blob = await getDocumentFile(id);
            if (!blob) throw new Error("El contenido del archivo ya no está disponible en este navegador.");
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = item.name;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            announce(`Descargando ${item.name}.`);
        } catch (error) {
            setDocumentsStatus(error.message, "error");
        }
    }

    function loadPdfJs() {
        if (!pdfJsPromise) {
            pdfJsPromise = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.min.mjs")
                .then(pdfjs => {
                    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs";
                    return pdfjs;
                });
        }
        return pdfJsPromise;
    }

    function resetCaseReviewer(item) {
        documentsView?.classList.add("reviewing");
        if (caseReviewer) caseReviewer.hidden = false;
        if (caseReviewerTitle) caseReviewerTitle.textContent = item.name;
        if (caseReviewerStatus) caseReviewerStatus.textContent = "Abriendo expediente y preparando análisis...";
        if (casePdfPages) casePdfPages.innerHTML = "";
        [
            caseFindingNumber,
            caseFindingYear,
            caseFindingJurisdiction,
            caseFindingAccused,
            caseFindingArea,
            caseFindingStage,
            caseFindingUrgency
        ].forEach(element => {
            if (element) element.textContent = "Analizando...";
        });
        if (caseImportantPoints) caseImportantPoints.innerHTML = "<li>LEXIA está revisando el expediente.</li>";
        if (caseAnalysisReport) caseAnalysisReport.textContent = "El informe aparecerá mientras LEXIA analiza el expediente.";
    }

    function closeCaseReview() {
        caseRenderingToken += 1;
        activeCaseDocumentId = null;
        documentsView?.classList.remove("reviewing");
        if (caseReviewer) caseReviewer.hidden = true;
        renderDocuments();
        focusRegion(documentsView);
    }

    function firstMatch(text, patterns) {
        for (const pattern of patterns) {
            const match = String(text || "").match(pattern);
            if (match?.[1]) return normalizeSpeechText(match[1]).slice(0, 140);
        }
        return "";
    }

    function extractCaseFields(text) {
        const number = firstMatch(text, [
            /(?:expediente|exp\.?)\s*(?:n[.°ºo]*\s*)?[:\-]?\s*([0-9]{1,7}(?:[-/][0-9A-Z]{1,10}){1,7})/i,
            /\b([0-9]{3,7}-20[0-9]{2}-[0-9]{1,6}-[A-Z]{2,8}-[A-Z]{2,8}(?:-[0-9]{2})?)\b/i
        ]);
        const year = firstMatch(number || text, [/\b(20[0-9]{2}|19[0-9]{2})\b/]);
        const jurisdiction = firstMatch(text, [
            /(Corte Superior de Justicia de\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ ]{2,80})/i,
            /((?:\d+[.°º]?\s*)?(?:Juzgado|Sala)\s+(?:Penal|Civil|Laboral|Constitucional|de Familia|Mixta)[^.\n]{0,80})/i
        ]);
        const accused = firstMatch(text, [
            /(?:acusado|imputado|procesado|investigado)\s*[:\-]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ,.'-]{4,100})/i,
            /(?:contra|seguido contra)\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ,.'-]{4,100})\s+(?:por|como)/i,
            /(?:demandado|demandada)\s*[:\-]\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ,.'-]{4,100})/i
        ]);
        return { number, year, jurisdiction, accused };
    }

    function updateExtractedCaseFields(text) {
        const fields = extractCaseFields(text);
        if (fields.number && caseFindingNumber) caseFindingNumber.textContent = fields.number;
        if (fields.year && caseFindingYear) caseFindingYear.textContent = fields.year;
        if (fields.jurisdiction && caseFindingJurisdiction) caseFindingJurisdiction.textContent = fields.jurisdiction;
        if (fields.accused && caseFindingAccused) caseFindingAccused.textContent = fields.accused;
    }

    function getImportantTextItems(items = []) {
        const pattern = /\b(expediente|acusad[oa]|imputad[oa]|procesad[oa]|demandad[oa]|sentencia|resuelve|fallo|delito|prueba|juzgado|sala|fiscal|agraviad[oa]|audiencia|apelaci[oó]n|casaci[oó]n|medida cautelar|plazo)\b/i;
        return items.filter(item => pattern.test(String(item.str || "")));
    }

    function updateImportantPoints(items = []) {
        if (!caseImportantPoints) return;
        const existing = new Set(Array.from(caseImportantPoints.querySelectorAll("li")).map(item => item.textContent));
        if (existing.has("LEXIA está revisando el expediente.")) {
            caseImportantPoints.innerHTML = "";
            existing.clear();
        }
        getImportantTextItems(items).forEach(item => {
            const point = normalizeSpeechText(item.str);
            if (point.length < 8 || existing.has(point) || existing.size >= 10) return;
            existing.add(point);
            const listItem = document.createElement("li");
            listItem.textContent = point;
            caseImportantPoints.appendChild(listItem);
        });
    }

    function drawCaseHighlights(pdfjs, items, viewport, canvas, outputScale) {
        const context = canvas.getContext("2d");
        context.scale(outputScale, outputScale);
        getImportantTextItems(items).forEach(item => {
            const transform = pdfjs.Util.transform(viewport.transform, item.transform);
            const fontHeight = Math.max(8, Math.hypot(transform[2], transform[3]));
            const x = transform[4];
            const y = transform[5] - fontHeight;
            const width = Math.max(18, item.width * viewport.scale);
            context.fillStyle = "rgba(250, 204, 21, 0.24)";
            context.fillRect(x - 2, y - 1, width + 4, fontHeight + 3);
            context.strokeStyle = "rgba(220, 38, 38, 0.88)";
            context.lineWidth = 1.6;
            context.beginPath();
            context.moveTo(x, y + fontHeight + 2);
            context.lineTo(x + width, y + fontHeight + 2);
            context.stroke();
        });
    }

    async function renderPdfCaseFile(blob, token) {
        const pdfjs = await loadPdfJs();
        if (token !== caseRenderingToken) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (token !== caseRenderingToken) return;
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        if (token !== caseRenderingToken) return;
        let accumulatedText = "";
        let textItemsFound = 0;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            if (token !== caseRenderingToken) return;
            const page = await pdf.getPage(pageNumber);
            if (token !== caseRenderingToken) return;
            const baseViewport = page.getViewport({ scale: 1 });
            const availableWidth = Math.max(320, Math.min(900, (casePdfPages?.clientWidth || 900) - 40));
            const scale = Math.min(1.6, availableWidth / baseViewport.width);
            const viewport = page.getViewport({ scale });
            const outputScale = Math.min(window.devicePixelRatio || 1, 2);
            const pageElement = document.createElement("article");
            pageElement.className = "case-pdf-page";
            pageElement.style.width = `${Math.floor(viewport.width)}px`;
            pageElement.setAttribute("aria-label", `Página ${pageNumber} del expediente`);
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;
            const highlights = document.createElement("canvas");
            highlights.className = "case-page-highlights";
            highlights.width = canvas.width;
            highlights.height = canvas.height;
            highlights.style.width = canvas.style.width;
            highlights.style.height = canvas.style.height;
            const badge = document.createElement("span");
            badge.className = "case-page-number";
            badge.textContent = `Página ${pageNumber}`;
            pageElement.append(canvas, highlights, badge);
            casePdfPages?.appendChild(pageElement);

            await page.render({
                canvasContext: canvas.getContext("2d"),
                transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
                viewport
            }).promise;
            if (token !== caseRenderingToken) return;
            const textContent = await page.getTextContent();
            if (token !== caseRenderingToken) return;
            const items = textContent.items.filter(item => item.str?.trim());
            textItemsFound += items.length;
            accumulatedText += `\n${items.map(item => item.str).join(" ")}`;
            drawCaseHighlights(pdfjs, items, viewport, highlights, outputScale);
            const activeDocument = loadList(storageKeys.documents).find(item => item.id === activeCaseDocumentId);
            if (activeDocument?.analysisStatus !== "completed") {
                updateExtractedCaseFields(accumulatedText);
                updateImportantPoints(items);
            }
            if (!items.length) {
                const ocrNote = document.createElement("span");
                ocrNote.className = "case-page-ocr-note";
                ocrNote.textContent = "Página escaneada · OCR en proceso";
                pageElement.appendChild(ocrNote);
            }
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        return { pageCount: pdf.numPages, textItemsFound };
    }

    function updateCaseAnalysisPanel(data = {}) {
        const classification = data.classification || {};
        if (caseFindingArea) caseFindingArea.textContent = classification.area || "Por determinar";
        if (caseFindingStage) caseFindingStage.textContent = classification.stage || "Por determinar";
        if (caseFindingUrgency) caseFindingUrgency.textContent = classification.urgency || "Normal";
        updateExtractedCaseFields(data.answer || "");
        if (caseFindingNumber?.textContent === "Analizando...") caseFindingNumber.textContent = "No identificado";
        if (caseFindingYear?.textContent === "Analizando...") caseFindingYear.textContent = "No identificado";
        if (caseFindingJurisdiction?.textContent === "Analizando...") caseFindingJurisdiction.textContent = "No identificada";
        if (caseFindingAccused?.textContent === "Analizando...") caseFindingAccused.textContent = "No identificado";
        if (caseAnalysisReport) caseAnalysisReport.innerHTML = formatChatContent(data.answer || "No se obtuvo un informe.");

        const reportPoints = String(data.answer || "")
            .split(/\r?\n/)
            .map(line => line.replace(/^[-*#\d.\s]+/, "").trim())
            .filter(line => line.length >= 24 && /\b(riesgo|prueba|plazo|resoluci[oó]n|sentencia|pretensi[oó]n|inconsistencia|urgencia|acusad|imputad)\b/i.test(line))
            .slice(0, 10);
        if (reportPoints.length && caseImportantPoints) {
            caseImportantPoints.innerHTML = reportPoints.map(point => `<li>${escapeHtml(point)}</li>`).join("");
        }
    }

    function openCaseReview(item, blob) {
        caseRenderingToken += 1;
        const token = caseRenderingToken;
        activeCaseDocumentId = item.id;
        resetCaseReviewer(item);
        if (item.extension === "pdf") {
            void renderPdfCaseFile(blob, token).catch(error => {
                if (activeCaseDocumentId === item.id && casePdfPages && !casePdfPages.children.length) {
                    casePdfPages.textContent = `No se pudo mostrar el PDF: ${error.message}`;
                }
            });
            return;
        }
        blob.text().then(text => {
            if (token !== caseRenderingToken || !casePdfPages) return;
            const pre = document.createElement("pre");
            pre.className = "case-text-document";
            pre.textContent = text;
            casePdfPages.appendChild(pre);
            updateExtractedCaseFields(text);
        });
    }

    function describeAnalysisProgress(state = {}) {
        if (state.status === "queued") return "Análisis aceptado. Continuará en segundo plano aunque cambies de pestaña.";
        if (state.status === "failed") return state.error || "No se pudo completar el análisis.";
        if (state.status === "completed") return "Análisis jurídico finalizado.";
        const progress = Math.max(0, Math.min(99, Number(state.progress) || 0));
        const phases = {
            extracting_text: "Extrayendo el contenido",
            preparing_ocr: "Preparando el OCR",
            ocr: "Leyendo páginas escaneadas",
            classifying: "Clasificando el expediente",
            legal_analysis: "Elaborando el informe jurídico",
            connection_retry: "Reconectando con el estado; el servidor continúa trabajando"
        };
        const phase = phases[state.phase] || "Analizando el expediente";
        const chunks = state.totalChunks
            ? ` · ${Number(state.completedChunks) || 0} de ${state.totalChunks} bloques`
            : "";
        return `${phase}${progress ? ` · ${progress}%` : ""}${chunks}. Puedes cambiar de pestaña o expediente sin detenerlo.`;
    }

    function showAnalysisState(id, state) {
        if (activeCaseDocumentId !== id || !caseReviewerStatus) return;
        caseReviewerStatus.textContent = describeAnalysisProgress(state);
    }

    async function completeDocumentAnalysis(id, item, job) {
        const data = job.result || {};
        await storeDocumentAnalysis(id, data);
        updateStoredDocument(id, {
            classification: data.classification || null,
            analyzedAt: job.completedAt || new Date().toISOString(),
            analysisStatus: "completed",
            analysisProgress: 100,
            analysisPhase: "completed",
            analysisError: null,
            analysisJobId: job.id
        });
        renderDocuments();

        const classificationSummary = data.classification
            ? `${data.classification.area} · ${data.classification.stage} · urgencia ${String(data.classification.urgency).toLowerCase()}`
            : "clasificación pendiente de revisión";
        if (activeCaseDocumentId === id) {
            updateCaseAnalysisPanel(data);
            if (caseReviewerStatus) {
                caseReviewerStatus.textContent = `${data.ocr ? `OCR completado${data.ocrChunks ? ` en ${data.ocrChunks} bloques` : ""}. ` : ""}Análisis jurídico finalizado: ${classificationSummary}.`;
            }
        }
        addNotification("Expediente clasificado y analizado", `${item.name}: ${classificationSummary}.`);
        setDocumentsStatus(`${item.name}: análisis finalizado. El resultado quedó guardado.`);
        announce(`Análisis del expediente ${item.name} completado.`);
    }

    function failDocumentAnalysis(id, message) {
        const errorMessage = message || "No se pudo analizar el expediente.";
        updateStoredDocument(id, {
            analysisStatus: "failed",
            analysisPhase: "failed",
            analysisError: errorMessage
        });
        renderDocuments();
        if (activeCaseDocumentId === id && caseReviewerStatus) caseReviewerStatus.textContent = errorMessage;
        setDocumentsStatus(errorMessage, "error");
        announce(`No se pudo analizar el expediente. ${errorMessage}`);
    }

    function monitorDocumentAnalysis(id, jobId) {
        const existing = documentAnalysisPolls.get(id);
        if (existing?.jobId === jobId) {
            void existing.check();
            return;
        }
        if (existing?.timer) window.clearTimeout(existing.timer);

        const monitor = { jobId, timer: null, checking: false, stopped: false, failures: 0, nextDelay: 2500, check: null };
        monitor.check = async () => {
            if (monitor.checking || monitor.stopped) return;
            if (monitor.timer) window.clearTimeout(monitor.timer);
            monitor.timer = null;
            monitor.checking = true;
            let shouldContinue = true;
            try {
                const query = currentEmail ? `?email=${encodeURIComponent(currentEmail)}` : "";
                const response = await fetch(`${getApiBase()}/api/case-files/analysis-jobs/${encodeURIComponent(jobId)}${query}`, {
                    cache: "no-store"
                });
                const job = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const statusError = new Error(job.error || "No se pudo consultar el estado del análisis.");
                    statusError.permanent = [403, 404].includes(response.status);
                    throw statusError;
                }
                monitor.failures = 0;
                monitor.nextDelay = document.hidden ? 10000 : 2500;

                const item = loadList(storageKeys.documents).find(document => document.id === id);
                if (!item) {
                    shouldContinue = false;
                    return;
                }
                updateStoredDocument(id, {
                    analysisStatus: job.status,
                    analysisProgress: Math.max(Number(item.analysisProgress) || 0, Number(job.progress) || 0),
                    analysisPhase: job.phase || item.analysisPhase,
                    analysisJobId: job.id
                });
                renderDocuments();
                showAnalysisState(id, job);
                if (job.status === "completed") {
                    shouldContinue = false;
                    await completeDocumentAnalysis(id, item, job);
                } else if (job.status === "failed") {
                    shouldContinue = false;
                    failDocumentAnalysis(id, job.error);
                }
            } catch (error) {
                if (error.permanent) {
                    shouldContinue = false;
                    failDocumentAnalysis(id, `${error.message} Puedes reintentar sin volver a cargar el archivo.`);
                } else {
                    monitor.failures += 1;
                    monitor.nextDelay = Math.min(30000, 2500 * (2 ** Math.min(monitor.failures, 4)));
                    showAnalysisState(id, {
                        status: "processing",
                        phase: "connection_retry",
                        progress: loadList(storageKeys.documents).find(document => document.id === id)?.analysisProgress
                    });
                }
            } finally {
                monitor.checking = false;
                if (shouldContinue && !monitor.stopped) {
                    monitor.timer = window.setTimeout(monitor.check, document.hidden ? Math.max(10000, monitor.nextDelay) : monitor.nextDelay);
                } else {
                    monitor.stopped = true;
                    documentAnalysisPolls.delete(id);
                }
            }
        };
        documentAnalysisPolls.set(id, monitor);
        void monitor.check();
    }

    async function analyzeDocument(id) {
        const item = getDocuments().find(document => document.id === id);
        if (!item) return;
        if (!["pdf", "txt"].includes(item.extension)) {
            setDocumentsStatus("Para analizar el contenido usa un expediente PDF o de texto.", "error");
            return;
        }

        try {
            const blob = await getDocumentFile(id);
            if (!blob) throw new Error("El contenido del expediente ya no está disponible en este navegador.");
            openCaseReview(item, blob);

            if (item.analysisStatus === "completed") {
                const storedResult = await getDocumentAnalysis(id);
                if (storedResult) {
                    updateCaseAnalysisPanel(storedResult);
                    showAnalysisState(id, { status: "completed" });
                    return;
                }
            }
            if (["queued", "processing"].includes(item.analysisStatus) && item.analysisJobId) {
                showAnalysisState(id, {
                    status: item.analysisStatus,
                    phase: item.analysisPhase,
                    progress: item.analysisProgress
                });
                monitorDocumentAnalysis(id, item.analysisJobId);
                return;
            }

            updateStoredDocument(id, {
                analysisStatus: "queued",
                analysisProgress: 0,
                analysisPhase: "uploading",
                analysisError: null,
                analysisStartedAt: new Date().toISOString()
            });
            renderDocuments();
            showAnalysisState(id, { status: "queued" });
            setDocumentsStatus(`El análisis de ${item.name} continuará en segundo plano.`);
            announce(`LEXIA está analizando el expediente ${item.name}.`);

            const formData = new FormData();
            formData.append("file", new File([blob], item.name, { type: item.mimeType }));
            formData.append("email", currentEmail);
            formData.append("role", currentRole);
            formData.append("documentId", id);
            const response = await fetch(`${getApiBase()}/api/case-files/analysis-jobs`, {
                method: "POST",
                body: formData
            });
            const job = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(job.error || "No se pudo iniciar el análisis del expediente.");
            updateStoredDocument(id, {
                analysisStatus: job.status,
                analysisJobId: job.id,
                analysisPhase: job.phase,
                analysisProgress: Number(job.progress) || 0
            });
            renderDocuments();
            if (job.status === "completed") {
                await completeDocumentAnalysis(id, item, job);
            } else {
                monitorDocumentAnalysis(id, job.id);
            }
        } catch (error) {
            failDocumentAnalysis(id, error.message);
        }
    }

    function resumePendingDocumentAnalyses() {
        loadList(storageKeys.documents)
            .filter(item => ["queued", "processing"].includes(item.analysisStatus) && item.analysisJobId)
            .forEach(item => monitorDocumentAnalysis(item.id, item.analysisJobId));
    }

    async function deleteDocument(id) {
        const item = getDocuments().find(document => document.id === id);
        if (!item || !window.confirm(`¿Eliminar "${item.name}"? Esta acción no se puede deshacer.`)) return;
        try {
            const monitor = documentAnalysisPolls.get(id);
            if (monitor?.timer) window.clearTimeout(monitor.timer);
            if (monitor) monitor.stopped = true;
            documentAnalysisPolls.delete(id);
            await removeDocumentFile(id);
            saveList(storageKeys.documents, loadList(storageKeys.documents).filter(document => document.id !== id));
            addNotification("Documento eliminado", `${item.name} fue eliminado del almacenamiento privado.`);
            setDocumentsStatus("Documento eliminado.");
            renderAppState();
            renderDocuments();
            announce(`${item.name} eliminado.`);
        } catch (error) {
            setDocumentsStatus(error.message, "error");
        }
    }

    function updateNav(activeAction) {
        document.querySelectorAll(".nav-item").forEach(item => {
            const isActive = item.dataset.action === activeAction
                || (activeAction === "documents" && item.hasAttribute("data-documents-link"));
            item.classList.toggle("active", isActive);
            if (isActive) {
                item.setAttribute("aria-current", "page");
            } else {
                item.removeAttribute("aria-current");
            }
        });
    }

    function setBrainNavigationVisibility(visible) {
        brainNavItems.forEach(item => {
            item.hidden = !visible;
        });
    }

    async function initializeBrainAccess() {
        setBrainNavigationVisibility(false);
        canSuggestBrainSources = false;
        canCurateBrainSources = false;
        if (!currentEmail) return;
        try {
            const data = await apiJson(`/api/legal-brain/status?email=${encodeURIComponent(currentEmail)}`);
            canSuggestBrainSources = Boolean(data.canSuggest);
            canCurateBrainSources = Boolean(data.canCurate);
            setBrainNavigationVisibility(canSuggestBrainSources);
            if (canSuggestBrainSources && window.location.hash === "#cerebro") {
                showView("brain");
                return;
            }
            if (!canSuggestBrainSources && window.location.hash === "#cerebro") {
                history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
                showView("dashboard");
                addNotification("Inicia sesión", "El laboratorio de inteligencia legal requiere una cuenta activa.");
                renderAppState();
            }
        } catch (error) {
            canSuggestBrainSources = false;
            canCurateBrainSources = false;
            setBrainNavigationVisibility(false);
            console.warn("No se pudo verificar acceso al cerebro:", error.message);
        }
    }

    function showView(viewName) {
        currentView = viewName;
        const showChat = viewName === "chat" || viewName === "history";
        const showHistory = viewName === "history";
        const showBrain = viewName === "brain";
        const showDocuments = viewName === "documents";
        if (showBrain && !canSuggestBrainSources) {
            currentView = "dashboard";
            dashboardView.hidden = false;
            legalChatView.hidden = true;
            if (brainView) brainView.hidden = true;
            if (documentsView) documentsView.hidden = true;
            mainPanel?.classList.toggle("chat-mode", false);
            mainPanel?.classList.toggle("history-mode", false);
            updateNav("home");
            return;
        }
        dashboardView.hidden = showChat || showBrain || showDocuments;
        legalChatView.hidden = !showChat;
        if (brainView) brainView.hidden = !showBrain;
        if (documentsView) documentsView.hidden = !showDocuments;
        mainPanel?.classList.toggle("chat-mode", showChat);
        mainPanel?.classList.toggle("history-mode", showHistory);
        updateNav(showHistory ? "history" : showChat ? "new-query" : showBrain ? "brain" : showDocuments ? "documents" : "home");
        if (showChat) {
            chatViewTitle.textContent = showHistory ? "Historial de consultas" : "Consulta jurídica LEXIA";
            chatViewSubtitle.textContent = showHistory
                ? "Revisa tus conversaciones anteriores con LEXIA por rol y fecha."
                : "Consulta leyes, jurisprudencia, normativa, documentos y criterios aplicables.";
        }
        if (showBrain) {
            void loadBrainSources();
        }
        if (showDocuments) {
            renderDocuments();
        }
        announce(showHistory ? "Historial de consultas abierto." : showChat ? "Consulta jurídica abierta." : showBrain ? "Laboratorio de inteligencia legal abierto." : showDocuments ? "Gestor de documentos abierto." : "Panel principal abierto.");
        focusRegion(showHistory ? chatSessionList : showChat ? chatThread : showBrain ? brainView : showDocuments ? documentsView : mainPanel);
    }

    function setBrainStatus(message, type = "info") {
        if (!brainStatus) return;
        brainStatus.hidden = !message;
        brainStatus.classList.toggle("error", type === "error");
        brainStatus.textContent = message || "";
    }

    function formatBrainStatus(status) {
        const labels = {
            approved: "Aprobado",
            pending_review: "Pendiente",
            rejected: "Rechazado"
        };
        return labels[status] || status || "Pendiente";
    }

    function renderBrainSources(sources = []) {
        if (brainSourceCounter) brainSourceCounter.textContent = String(sources.length);
        if (!brainSourceList) return;

        if (!sources.length) {
            brainSourceList.innerHTML = `
                <div class="empty-state compact">
                    <strong>Sin fuentes propuestas.</strong>
                    <span>Agrega una URL jurídica para que LEXIA la evalúe.</span>
                </div>
            `;
            return;
        }

        brainSourceList.innerHTML = sources.map(source => {
            const status = source.reviewStatus || "pending_review";
            const score = Number(source.legalScore || 0);
            const url = source.sourceUrl || source.originalName || "";
            const actions = canCurateBrainSources ? `
                    <div class="brain-actions">
                        <button class="brain-action-button" type="button" data-brain-status="approved" ${status === "approved" ? "disabled" : ""}>
                            <i class="fa-solid fa-check icon" aria-hidden="true"></i>
                            Aprobar
                        </button>
                        <button class="brain-action-button reject" type="button" data-brain-status="rejected" ${status === "rejected" ? "disabled" : ""}>
                            <i class="fa-solid fa-xmark icon" aria-hidden="true"></i>
                            Rechazar
                        </button>
                    </div>
            ` : '';
            return `
                <article class="brain-source-item" data-source-id="${escapeHtml(source.id)}">
                    <div class="brain-source-head">
                        <strong>${escapeHtml(source.title || source.originalName || "Fuente jurídica")}</strong>
                        <span class="brain-status-pill ${escapeHtml(status)}">${formatBrainStatus(status)}</span>
                    </div>
                    <div class="brain-source-meta">
                        <span>${escapeHtml(source.sourceType || "fuente")}</span>
                        <span>Puntaje jurídico: ${score}</span>
                        <span>${formatDate(source.createdAt)}</span>
                    </div>
                    ${url ? `<div class="brain-source-url" title="${escapeHtml(url)}">${escapeHtml(url)}</div>` : ""}
                    ${actions}
                </article>
            `;
        }).join("");
    }

    async function loadBrainSources() {
        if (!brainSourceList) return;
        if (!canSuggestBrainSources) return;
        try {
            setBrainStatus("");
            const data = await apiJson(`/api/legal-ingest?email=${encodeURIComponent(currentEmail || "")}`);
            renderBrainSources(Array.isArray(data.sources) ? data.sources : []);
        } catch (error) {
            renderBrainSources([]);
            setBrainStatus(error.message || "No se pudieron cargar las fuentes.", "error");
        }
    }

    async function ingestBrainUrl() {
        if (!canSuggestBrainSources) {
            setBrainStatus("Debes iniciar sesión para proponer fuentes al cerebro de LEXIA.", "error");
            return;
        }
        const url = brainUrlInput?.value.trim();
        if (!url) return;
        brainAnalyzeButton.disabled = true;
        setBrainStatus("Analizando fuente jurídica...");
        try {
            const data = await apiJson("/api/legal-ingest-url", {
                method: "POST",
                body: JSON.stringify({
                    url,
                    email: currentEmail,
                    materia: brainMatterInput?.value || "",
                    modulo: brainModuleInput?.value || "",
                    reviewStatus: canCurateBrainSources ? "approved" : "pending_review",
                    autoApprove: canCurateBrainSources
                })
            });
            brainUrlForm?.reset();
            const usableText = data.usableInChat ? " Ya está disponible para Nueva Consulta." : " Falta aprobarla para que entre al RAG.";
            setBrainStatus(`Fuente recibida. LEXIA la dejó en ${formatBrainStatus(data.source?.reviewStatus)} con puntaje jurídico ${data.source?.legalScore || 0}.${usableText}`);
            await loadBrainSources();
        } catch (error) {
            setBrainStatus(error.message || "No se pudo analizar la fuente.", "error");
        } finally {
            brainAnalyzeButton.disabled = false;
        }
    }

    async function updateBrainSourceStatus(sourceId, reviewStatus) {
        if (!canCurateBrainSources) {
            setBrainStatus("Esta acción requiere curaduría interna de LEXIA.", "error");
            return;
        }
        if (!sourceId || !reviewStatus) return;
        setBrainStatus("Actualizando estado de la fuente...");
        try {
            await apiJson(`/api/legal-ingest/${encodeURIComponent(sourceId)}/status`, {
                method: "PATCH",
                body: JSON.stringify({ reviewStatus, email: currentEmail })
            });
            setBrainStatus(`Fuente marcada como ${formatBrainStatus(reviewStatus)}.`);
            await loadBrainSources();
        } catch (error) {
            setBrainStatus(error.message || "No se pudo actualizar la fuente.", "error");
        }
    }

    function formatChatContent(content) {
        let formatted = escapeHtml(content)
            .replace(/\[((?:[^\]\n]*(?:ley|c[oó]digo|decreto|constituci[oó]n|art\.|art[ií]culo|cpp|cpc|c[oó]digo penal|c[oó]digo civil)[^\]\n]*))\]/gi, "<span class=\"legal-citation\">[$1]</span>")
            .replace(/\b((?:C[oó]digo\s+(?:Penal|Civil|Procesal(?:\s+Penal|\s+Civil)?|de los Niños y Adolescentes)|Constituci[oó]n(?:\s+Pol[ií]tica(?:\s+del\s+Per[uú])?)?|Ley\s+(?:N[.°º]\s*)?\d+[A-Z-]*|Decreto\s+(?:Legislativo|Supremo)\s+(?:N[.°º]\s*)?\d+[A-Z-]*|CPP|CPC)[^<\n.;:]{0,90}?\b(?:art\.|art[ií]culo|arts\.)\s*\d+[A-Z-]*(?:-[A-Z])?)\b/gi, "<span class=\"legal-citation\">$1</span>")
            .replace(/\*\*([^*\n][^*\n]*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\n{2,}/g, "</p><p>")
            .replace(/\n/g, "<br>");
        formatted = formatted.replace(/<span class="legal-citation">([^<]*)<span class="legal-citation">([^<]*)<\/span>([^<]*)<\/span>/g, '<span class="legal-citation">$1$2$3</span>');
        return formatted;
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
        void saveChatSessionToApi(nextSession).catch(error => {
            console.warn("No se pudo crear la conversación remota:", error.message);
        });
        return nextSession;
    }

    function upsertChatSession(session) {
        const sessions = getChatSessions().filter(item => item.id !== session.id);
        const nextSession = { ...session, updatedAt: new Date().toISOString() };
        saveChatSessions([nextSession, ...sessions]);
        void saveChatSessionToApi(nextSession).catch(error => {
            console.warn("No se pudo sincronizar la conversación remota:", error.message);
        });
    }

    function deleteChatSession(sessionId) {
        const sessions = getChatSessions().filter(item => item.id !== sessionId);
        saveChatSessions(sessions);
        if (currentEmail) {
            void apiJson(`/api/chats/${encodeURIComponent(sessionId)}?email=${encodeURIComponent(currentEmail)}&role=${encodeURIComponent(currentRole)}`, {
                method: "DELETE"
            }).catch(error => {
                console.warn("No se pudo eliminar la conversación remota:", error.message);
            });
        }
        if (activeChatSessionId === sessionId) {
            activeChatSessionId = sessions[0]?.id || null;
        }
        renderChatSessions();
        renderChatThread();
    }

    function ensureActiveSession(initialQuestion = "") {
        const currentSession = getActiveChatSession();
        if (currentSession) return currentSession;
        return createChatSession(initialQuestion);
    }

    function closeChatSessionMenus() {
        chatSessionList?.querySelectorAll("[data-session-menu]").forEach(menu => {
            menu.hidden = true;
        });
        chatSessionList?.querySelectorAll("[data-session-menu-id]").forEach(button => {
            button.setAttribute("aria-expanded", "false");
        });
    }

    function renderChatSessions() {
        const sessions = getChatSessions();

        if (!sessions.length) {
            chatSessionList.innerHTML = `<div class="empty-state compact"><strong>Sin conversaciones.</strong><span>Inicia una consulta y quedará organizada aquí.</span></div>`;
            return;
        }

        chatSessionList.innerHTML = sessions.map(item => `
            <article class="chat-session-item ${item.id === activeChatSessionId ? "active" : ""}" role="button" tabindex="0" aria-pressed="${item.id === activeChatSessionId}" aria-label="Abrir consulta ${escapeHtml(item.title)}" data-session-id="${item.id}">
                <div class="chat-session-main">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(textOnly(item.messages[item.messages.length - 1]?.content || "Pendiente de consulta")).slice(0, 88)}</span>
                    <time datetime="${escapeHtml(item.updatedAt)}">${formatDate(item.updatedAt)}</time>
                </div>
                <div class="chat-session-actions">
                    <button class="chat-session-menu-button" type="button" aria-label="Opciones de ${escapeHtml(item.title)}" aria-haspopup="menu" aria-expanded="false" data-session-menu-id="${item.id}">
                        <span aria-hidden="true">⋮</span>
                    </button>
                    <div class="chat-session-menu" role="menu" hidden data-session-menu>
                        <button type="button" role="menuitem" class="chat-session-delete" data-delete-session-id="${item.id}">
                            <i class="fa-regular fa-trash-can icon" aria-hidden="true"></i>
                            Eliminar
                        </button>
                    </div>
                </div>
            </article>
        `).join("");
    }

    function renderChatThread() {
        const session = getActiveChatSession();

        if (!session || !session.messages.length) {
            chatThread.innerHTML = `
                <div class="chat-empty" role="status">
                    <strong>Conversa con LEXIA sobre tu caso</strong>
                    <p>Cuéntame qué pasó, qué documento tienes o qué duda legal te preocupa. Te responderé en lenguaje claro y te haré preguntas si falta información.</p>
                </div>
            `;
            return;
        }

        chatThread.innerHTML = session.messages.map(item => `
            <article class="chat-message ${item.role}" aria-label="${item.role === "user" ? "Mensaje tuyo" : item.role === "system" ? "Estado de LEXIA" : "Respuesta de LEXIA"}">
                <div class="chat-message-meta">
                    <strong>${item.role === "user" ? "Tú" : "LEXIA"}</strong>
                    <time datetime="${escapeHtml(item.createdAt)}">${formatDate(item.createdAt)}</time>
                </div>
                <div class="chat-bubble"><p>${formatChatContent(item.content)}</p></div>
            </article>
        `).join("");

        requestAnimationFrame(() => {
            chatThread.scrollTop = chatThread.scrollHeight;
        });
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

    function openHistoryView() {
        showView("history");
        if (!activeChatSessionId) {
            const existing = getChatSessions()[0];
            activeChatSessionId = existing?.id || null;
        }
        renderChatSessions();
        renderChatThread();
    }

    function syncViewWithHash() {
        if (window.location.hash === "#consulta-ia" || window.location.hash === "#consulta") {
            openChatView();
            return;
        }
        if (window.location.hash === "#historial") {
            openHistoryView();
            return;
        }
        if (window.location.hash === "#cerebro") {
            showView("brain");
            return;
        }
        if (window.location.hash === "#documentos") {
            showView("documents");
            return;
        }
        showView("dashboard");
    }

    function serializeConversationMemory(messages = []) {
        return messages
            .filter(message => ["user", "assistant"].includes(message.role))
            .filter(message => (message.content || "").trim())
            .slice(-12)
            .map(message => ({
                id: message.id,
                role: message.role,
                content: message.content,
                createdAt: message.createdAt
            }));
    }

    async function sendMessage(initialText = "") {
        const text = (typeof initialText === "string" && initialText ? initialText : chatComposerInput.value).trim();
        if (!text || isSending) return;

        isSending = true;
        chatComposerSend.disabled = true;
        chatComposerSend.setAttribute("aria-busy", "true");
        announce("Consulta enviada. LEXIA está procesando la respuesta.");

        const session = ensureActiveSession(text);
        const createdAt = new Date().toISOString();
        const assistantCreatedAt = new Date().toISOString();
        const userMessageId = `${session.id}:user:${createdAt}`;
        const assistantMessageId = `${session.id}:assistant:${assistantCreatedAt}`;
        const stableMessages = [...session.messages];

        if (!stableMessages.length) {
            session.title = text.slice(0, 90);
        }

        session.messages = [
            ...stableMessages,
            { id: userMessageId, role: "user", content: text, createdAt },
            { id: `${session.id}:system:${createdAt}`, role: "system", content: "Procesando consulta jurídica...", createdAt }
        ];
        upsertChatSession(session);
        renderChatSessions();
        renderChatThread();
        chatComposerInput.value = "";

        try {
            const endpointBase = window.LEXIA_CONFIG?.apiBaseUrl || window.BACKEND_URL || window.location.origin;
            const response = await fetch(`${endpointBase}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: `${buildRoleAssistantPrompt()}\n\nConsulta del usuario:\n${text}`,
                    email: currentEmail,
                    sessionId: session.id,
                    role: currentRole,
                    title: session.title,
                    sessionCreatedAt: session.createdAt,
                    userMessageId,
                    assistantMessageId,
                    userCreatedAt: createdAt,
                    assistantCreatedAt,
                    conversationMessages: serializeConversationMemory(stableMessages)
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || "No se pudo obtener una respuesta jurídica.");
            }

            const answer = (data.answer || "").trim() || "No se obtuvo una respuesta válida.";
            const assistantMetadata = {
                provider: data.provider,
                model: data.model,
                source: data.source,
                fallback: data.fallback,
                persisted: data.persisted,
                diagnostics: data.diagnostics || null
            };
            session.messages = [
                ...stableMessages,
                { id: userMessageId, role: "user", content: text, createdAt },
                { id: assistantMessageId, role: "assistant", content: answer, createdAt: assistantCreatedAt, metadata: assistantMetadata }
            ];
            upsertChatSession(session);
            addNotification("Nueva respuesta de LEXIA", text.slice(0, 96));
            announce("LEXIA respondió. La respuesta está disponible en la conversación.");
        } catch (error) {
            session.messages = [
                ...stableMessages,
                { id: userMessageId, role: "user", content: text, createdAt },
                {
                    id: assistantMessageId,
                    role: "assistant",
                    content: `No pude completar la consulta en este momento. ${error.message || "Verifica la conexión del backend y la clave de OpenAI."}`,
                    createdAt: assistantCreatedAt
                }
            ];
            upsertChatSession(session);
            announce("No se pudo completar la consulta. Revisa la conversación para ver el detalle.");
        } finally {
            isSending = false;
            chatComposerSend.disabled = false;
            chatComposerSend.removeAttribute("aria-busy");
            renderChatSessions();
            renderChatThread();
            renderAppState();
            chatComposerInput.focus({ preventScroll: true });
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

    voiceAssistToggle?.addEventListener("change", () => {
        setVoiceAssistEnabled(voiceAssistToggle.checked);
    });

    document.addEventListener("mouseover", event => {
        if (speakVoiceIntroFromTarget(event.target)) return;
        speakFocusedControl(event.target);
    });

    document.addEventListener("pointerover", event => {
        if (speakVoiceIntroFromTarget(event.target)) return;
        speakFocusedControl(event.target);
    });

    document.addEventListener("focusin", event => {
        speakFocusedControl(event.target, true);
    });

    document.addEventListener("touchstart", event => {
        if (speakVoiceIntroFromTarget(event.target)) return;
        speakFocusedControl(event.target);
    }, { passive: true });

    roleQuickGrid?.addEventListener("click", event => {
        const card = event.target.closest(".quick-card");
        if (!card) return;
        const title = card.querySelector("strong")?.textContent?.trim().toLowerCase() || "";
        if (title.includes("consulta")) {
            openChatView();
        }
    });

    roleQuickGrid?.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const card = event.target.closest(".quick-card");
        if (!card) return;
        const title = card.querySelector("strong")?.textContent?.trim().toLowerCase() || "";
        if (!title.includes("consulta")) return;
        event.preventDefault();
        openChatView();
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

    chatSessionList?.addEventListener("click", event => {
        const deleteButton = event.target.closest("[data-delete-session-id]");
        if (deleteButton) {
            event.stopPropagation();
            deleteChatSession(deleteButton.dataset.deleteSessionId);
            return;
        }

        const menuButton = event.target.closest("[data-session-menu-id]");
        if (menuButton) {
            event.stopPropagation();
            const item = menuButton.closest(".chat-session-item");
            const menu = item?.querySelector("[data-session-menu]");
            const shouldOpen = Boolean(menu?.hidden);
            closeChatSessionMenus();
            if (menu) {
                menu.hidden = !shouldOpen;
                menuButton.setAttribute("aria-expanded", String(shouldOpen));
            }
            return;
        }

        const item = event.target.closest(".chat-session-item[data-session-id]");
        if (!item) return;
        activeChatSessionId = item.dataset.sessionId;
        renderChatSessions();
        renderChatThread();
        announce("Consulta seleccionada.");
    });

    chatSessionList?.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("button")) return;
        const item = event.target.closest(".chat-session-item[data-session-id]");
        if (!item) return;
        event.preventDefault();
        activeChatSessionId = item.dataset.sessionId;
        renderChatSessions();
        renderChatThread();
        announce("Consulta seleccionada.");
    });

    document.addEventListener("click", event => {
        if (event.target.closest(".chat-session-item")) return;
        closeChatSessionMenus();
    });

    notificationButton.addEventListener("click", () => {
        const isHidden = notificationPanel.hidden;
        notificationPanel.hidden = !isHidden;
        notificationButton.setAttribute("aria-expanded", String(isHidden));
        accountMenu.hidden = true;
        accountButton?.setAttribute("aria-expanded", "false");
        if (isHidden) {
            announce("Panel de notificaciones abierto.");
            focusRegion(notificationPanel);
        }
    });

    accountButton?.addEventListener("click", () => {
        const isHidden = accountMenu.hidden;
        accountMenu.hidden = !isHidden;
        accountButton.setAttribute("aria-expanded", String(isHidden));
        notificationPanel.hidden = true;
        notificationButton.setAttribute("aria-expanded", "false");
        if (isHidden) {
            announce("Menú de cuenta abierto.");
        }
    });

    logoutButton?.addEventListener("click", () => {
        window.LexiaAuth?.clearSession?.();
        window.location.href = "/login";
    });

    markNotificationsRead.addEventListener("click", () => {
        const notifications = loadList(storageKeys.notifications).filter(item => item.role !== currentRole);
        saveList(storageKeys.notifications, notifications);
        if (currentEmail) {
            void apiJson("/api/notifications/read-all", {
                method: "PATCH",
                body: JSON.stringify({
                    email: currentEmail,
                    role: currentRole
                })
            }).catch(error => {
                console.warn("No se pudieron marcar notificaciones remotas:", error.message);
            });
        }
        renderAppState();
        announce("Notificaciones marcadas como leídas.");
    });

    uploadDocumentButton?.addEventListener("click", () => documentFileInput?.click());
    closeCaseReviewer?.addEventListener("click", closeCaseReview);
    documentDropZone?.addEventListener("click", () => documentFileInput?.click());
    documentDropZone?.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        documentFileInput?.click();
    });
    documentFileInput?.addEventListener("change", () => {
        void importDocuments(documentFileInput.files);
    });
    documentSearchInput?.addEventListener("input", renderDocuments);
    documentTypeFilter?.addEventListener("change", renderDocuments);

    ["dragenter", "dragover"].forEach(eventName => {
        documentDropZone?.addEventListener(eventName, event => {
            event.preventDefault();
            documentDropZone.classList.add("dragging");
        });
    });
    ["dragleave", "drop"].forEach(eventName => {
        documentDropZone?.addEventListener(eventName, event => {
            event.preventDefault();
            documentDropZone.classList.remove("dragging");
        });
    });
    documentDropZone?.addEventListener("drop", event => {
        void importDocuments(event.dataTransfer?.files);
    });
    documentsList?.addEventListener("click", event => {
        const item = event.target.closest("[data-document-id]");
        if (!item) return;
        if (event.target.closest("[data-document-analyze]")) {
            void analyzeDocument(item.dataset.documentId);
        }
        if (event.target.closest("[data-document-download]")) {
            void downloadDocument(item.dataset.documentId);
        }
        if (event.target.closest("[data-document-delete]")) {
            void deleteDocument(item.dataset.documentId);
        }
    });

    documentsNavItems.forEach(item => {
        item.addEventListener("click", event => {
            event.preventDefault();
            history.replaceState(null, "", `${window.location.pathname}${window.location.search}#documentos`);
            showView("documents");
        });
    });

    document.querySelectorAll("[data-action]").forEach(item => {
        item.addEventListener("click", event => {
            const action = item.dataset.action;
            if (action === "new-query") {
                window.location.hash = "consulta-ia";
            }
            if (action === "home") {
                event.preventDefault();
                history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
                showView("dashboard");
            }
            if (action === "brain") {
                event.preventDefault();
                history.replaceState(null, "", `${window.location.pathname}${window.location.search}#cerebro`);
                showView("brain");
            }
            if (action === "history") {
                event.preventDefault();
                history.replaceState(null, "", `${window.location.pathname}${window.location.search}#historial`);
                openHistoryView();
            }
            if (action === "notifications") {
                event.preventDefault();
                notificationPanel.hidden = false;
                notificationButton.setAttribute("aria-expanded", "true");
                focusRegion(notificationPanel);
            }
            if (["clients", "cases", "agenda", "favorites", "deadlines", "profile", "settings"].includes(action)) {
                event.preventDefault();
                addNotification("Módulo listo para configurar", "Todavía no hay información registrada en esta sección.");
                renderAppState();
                notificationPanel.hidden = false;
                notificationButton.setAttribute("aria-expanded", "true");
            }
        });
    });

    brainUrlForm?.addEventListener("submit", event => {
        event.preventDefault();
        void ingestBrainUrl();
    });

    refreshBrainSources?.addEventListener("click", () => {
        void loadBrainSources();
    });

    brainSourceList?.addEventListener("click", event => {
        const button = event.target.closest("[data-brain-status]");
        if (!button) return;
        const item = button.closest("[data-source-id]");
        const sourceId = item?.dataset.sourceId;
        const reviewStatus = button.dataset.brainStatus;
        void updateBrainSourceStatus(sourceId, reviewStatus);
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

    window.addEventListener("hashchange", syncViewWithHash);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) resumePendingDocumentAnalyses();
    });
    syncViewWithHash();
    resumePendingDocumentAnalyses();
});


