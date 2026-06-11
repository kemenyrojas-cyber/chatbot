document.addEventListener("DOMContentLoaded", () => {

    const sendBtn = document.getElementById("sendBtn");
    const input = document.getElementById("messageInput");
    const messages = document.getElementById("chatMessages");
    const roleQuickGrid = document.getElementById("roleQuickGrid");
    const roleResourceList = document.getElementById("roleResourceList");
    const roleToolsGrid = document.getElementById("roleToolsGrid");
    const roleStats = document.getElementById("roleStats");
    const roleStatus = document.getElementById("roleStatus");
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
                ["#icon-file-plus", "Nueva consulta", "Haz tu pregunta legal"],
                ["#icon-user", "Nuevo cliente", "Registra datos y caso"],
                ["#icon-calendar", "Controlar plazo", "Calcula vencimientos procesales"],
                ["#icon-upload", "Analizar documento", "Contratos, demandas o anexos"],
                ["#icon-clipboard", "Generar escrito", "Modelos listos para editar"]
            ],
            resources: [
                ["Código Civil", "Contratos, obligaciones y familia"],
                ["Código Procesal Civil", "Etapas, plazos y recursos"],
                ["Código Penal", "Delitos y criterios de defensa"],
                ["Jurisprudencia relevante", "Criterios para argumentación"]
            ],
            tools: [
                ["#icon-calculator", "Calculadora de intereses", "Intereses legales y moratorios"],
                ["#icon-calendar", "Plazos procesales", "Controla vencimientos"],
                ["#icon-file", "Resumen de expediente", "Sintetiza hechos y anexos"],
                ["#icon-scale", "Matriz de argumentos", "Ordena pretensiones y pruebas"]
            ],
            stats: [["Clientes activos", "18"], ["Documentos analizados", "24"], ["Plazos próximos", "7"]],
            features: ["Consultas ilimitadas", "Gestión de clientes", "Control de vencimientos", "Generación de escritos"],
            activity: [
                ["Demanda de desalojo por ocupación precaria", "Hoy, 10:45 a.m."],
                ["Revisión de contrato de arrendamiento", "Ayer, 4:30 p.m."],
                ["Indemnización por despido arbitrario", "Ayer, 11:20 a.m."]
            ]
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
                ["#icon-users", "Asignar consulta", "Distribuye trabajo por abogado"],
                ["#icon-upload", "Revisión compartida", "Analiza documentos en equipo"],
                ["#icon-briefcase", "Nuevo expediente", "Organiza cliente, materia y estado"],
                ["#icon-clipboard", "Plantilla del estudio", "Estandariza documentos"],
                ["#icon-bell", "Alertas del equipo", "Seguimiento de pendientes"]
            ],
            resources: [
                ["Protocolos internos", "Criterios de atención"],
                ["Plantillas aprobadas", "Formatos vigentes"],
                ["Matriz de expedientes", "Casos y prioridades"],
                ["Repositorio contractual", "Cláusulas frecuentes"]
            ],
            tools: [
                ["#icon-users", "Bandeja de equipo", "Asignaciones y responsables"],
                ["#icon-bell", "Alertas legales", "Cambios y vencimientos"],
                ["#icon-clipboard", "Checklist de revisión", "Control de calidad"],
                ["#icon-file-search", "Buscador interno", "Criterios reutilizables"]
            ],
            stats: [["Expedientes activos", "42"], ["Pendientes críticos", "6"], ["Revisiones cerradas", "29"]],
            features: ["Roles y permisos", "Bandeja compartida", "Plantillas del estudio", "Trazabilidad de revisiones"],
            activity: [
                ["Revisión asignada al área contractual", "Hoy, 8:40 a.m."],
                ["Actualización de plantilla laboral", "Ayer, 5:00 p.m."],
                ["Alerta de vencimiento procesal", "Ayer, 12:30 p.m."]
            ]
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
                ["#icon-file", "Resumir tema", "Explicación clara por materia"],
                ["#icon-scale", "Practicar caso", "Analiza hechos y fundamentos"],
                ["#icon-clipboard", "Crear esquema", "Mapa de conceptos"],
                ["#icon-file-search", "Buscar artículos", "Ubica base legal"],
                ["#icon-star", "Guardar apunte", "Favoritos de estudio"]
            ],
            resources: [
                ["Introducción al Derecho Civil", "Conceptos esenciales"],
                ["Guía de Derecho Penal", "Tipos penales frecuentes"],
                ["Proceso Civil básico", "Etapas y recursos"],
                ["Modelos de examen", "Preguntas para practicar"]
            ],
            tools: [
                ["#icon-file", "Fichas de estudio", "Resumen por tema"],
                ["#icon-clipboard", "Casos prácticos", "Hechos, problema y solución"],
                ["#icon-search", "Glosario jurídico", "Términos explicados"],
                ["#icon-star", "Repaso rápido", "Preguntas frecuentes"]
            ],
            stats: [["Temas estudiados", "12"], ["Casos practicados", "8"], ["Apuntes guardados", "31"]],
            features: ["Resúmenes por materia", "Casos prácticos guiados", "Glosario jurídico", "Ruta de aprendizaje"],
            activity: [
                ["Resumen de contrato de compraventa", "Hoy, 9:15 a.m."],
                ["Caso práctico sobre hurto y robo", "Ayer, 6:20 p.m."],
                ["Ficha de sucesiones", "Ayer, 2:10 p.m."]
            ]
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
                ["#icon-landmark", "Consulta normativa", "Interpreta leyes y directivas"],
                ["#icon-clipboard", "Generar informe", "Base legal y conclusiones"],
                ["#icon-file-search", "Revisar expediente", "Hechos, actos y riesgos"],
                ["#icon-calendar", "Plazo administrativo", "Controla vencimientos"],
                ["#icon-bell", "Alerta regulatoria", "Cambios normativos"]
            ],
            resources: [
                ["Ley del Procedimiento Administrativo General", "Actos, recursos y plazos"],
                ["Contrataciones del Estado", "Bases, consultas y ejecución"],
                ["Transparencia y acceso a información", "Obligaciones públicas"],
                ["Responsabilidad administrativa", "Riesgos y criterios"]
            ],
            tools: [
                ["#icon-clipboard", "Borrador de informe", "Estructura institucional"],
                ["#icon-calendar", "Plazos administrativos", "Cómputo y alertas"],
                ["#icon-file-search", "Análisis de expediente", "Resumen y observaciones"],
                ["#icon-shield-check", "Control normativo", "Cumplimiento y riesgos"]
            ],
            stats: [["Expedientes revisados", "33"], ["Informes generados", "15"], ["Plazos próximos", "11"]],
            features: ["Informes legales", "Seguimiento de expedientes", "Normativa pública", "Alertas administrativas"],
            activity: [
                ["Informe sobre procedimiento sancionador", "Hoy, 10:10 a.m."],
                ["Revisión de expediente administrativo", "Ayer, 4:05 p.m."],
                ["Alerta por vencimiento de recurso", "Ayer, 9:20 a.m."]
            ]
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
                ["#icon-upload", "Revisar contrato", "Detecta riesgos y cláusulas"],
                ["#icon-shield-check", "Compliance", "Evalúa obligaciones"],
                ["#icon-briefcase", "Consulta laboral", "Casos de personal"],
                ["#icon-calculator", "Impacto económico", "Multas, intereses y costos"],
                ["#icon-bell", "Obligaciones", "Alertas regulatorias"]
            ],
            resources: [
                ["Contratos comerciales", "Compra, venta y servicios"],
                ["Políticas laborales", "Gestión de personal"],
                ["Matriz de compliance", "Obligaciones por área"],
                ["Cláusulas de riesgo", "Revisión preventiva"]
            ],
            tools: [
                ["#icon-shield-check", "Mapa de riesgos", "Prioriza contingencias"],
                ["#icon-file-search", "Auditoría contractual", "Hallazgos por contrato"],
                ["#icon-calendar", "Calendario legal", "Obligaciones y renovaciones"],
                ["#icon-briefcase", "Consultas internas", "Soporte para áreas"]
            ],
            stats: [["Contratos revisados", "36"], ["Riesgos abiertos", "9"], ["Obligaciones próximas", "14"]],
            features: ["Revisión contractual", "Alertas de compliance", "Soporte laboral", "Reporte de riesgos"],
            activity: [
                ["Contrato de servicios con riesgo medio", "Hoy, 11:05 a.m."],
                ["Obligación regulatoria pendiente", "Ayer, 3:35 p.m."],
                ["Consulta laboral de RR. HH.", "Ayer, 9:50 a.m."]
            ]
        }
    };

    function normalizeRole(value) {
        if (!value) return "";
        return roleAliases[value.trim().toLowerCase()] || value.trim().toLowerCase();
    }

    function renderIconArticle(item, className) {
        const [icon, title, text] = item;
        return `<article class="${className}"><span><svg class="icon"><use href="${icon}"></use></svg></span><strong>${title}</strong><small>${text}</small></article>`;
    }

    function renderRole(role) {
        const selectedRole = roleDashboards[role] ? role : "abogado-independiente";
        const config = roleDashboards[selectedRole];
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
        roleStatus.textContent = "Activo";

        roleQuickGrid.innerHTML = config.quick.map(item => renderIconArticle(item, "quick-card")).join("");
        roleResourceList.innerHTML = config.resources.map(item => renderIconArticle(["#icon-file", item[0], item[1]], "")).join("");
        roleToolsGrid.innerHTML = config.tools.map(item => renderIconArticle(item, "")).join("");
        roleStats.innerHTML = config.stats.map(([label, value]) => `<div class="stat-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
        planFeatures.innerHTML = config.features.map(feature => `<li>${feature}</li>`).join("");
        messages.innerHTML = config.activity.map(([title, time]) => `<article><span><svg class="icon"><use href="#icon-new-chat"></use></svg></span><p>${title}</p><time>${time}</time></article>`).join("");

        document.querySelectorAll(".role-option").forEach(btn => {
            const isActive = btn.dataset.role === selectedRole;
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-pressed", String(isActive));
        });
    }

    const params = new URLSearchParams(window.location.search);
    const savedRole = normalizeRole(localStorage.getItem("lexiaRole"));
    const initialRole = normalizeRole(params.get("role") || params.get("profile")) || savedRole || "abogado-independiente";
    renderRole(initialRole);

    document.querySelectorAll(".role-option").forEach(btn => {
        btn.addEventListener("click", () => renderRole(btn.dataset.role));
    });

    function addMessage(text, type) {
        const msg = document.createElement("div");
        msg.className = `message ${type}`;
        msg.innerHTML = text;
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
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
            
            <strong>⚠️ RECOMENDACIÓN:</strong> Para inmuebles, SIEMPRE use abogado y notario.`;
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
            
            <strong>⚠️ IMPORTANTE:</strong> Consulte abogado laboral inmediatamente después del despido.`;
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
            
            <strong>⚠️ RECOMENDACIÓN:</strong> Contrate abogado especialista en sucesiones.`;
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
            
            <strong>⚠️ DIFERENCIA CLAVE:</strong><br>
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
            
            <strong>⚠️ CONSEJOS:</strong><br>
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
        📋 <strong>Derecho Civil:</strong> Contratos de compraventa, propiedad, herencias, familia<br>
        ⚖️ <strong>Derecho Penal:</strong> Delitos, robo, hurto, fraude, procedimiento penal<br>
        💼 <strong>Derecho Laboral:</strong> Despidos, indemnización, seguridad social<br>
        🏢 <strong>Derecho Comercial:</strong> Empresas, sociedades, contratos<br>
        👨‍👩‍👧 <strong>Derecho Familiar:</strong> Divorcio, alimentos, custodia<br>
        📋 <strong>Procedimiento:</strong> Cómo presentar demanda, juicios<br><br>
        
        <strong>Pregunta específicamente sobre:</strong><br>
        • \"¿Cuáles son los requisitos para un contrato de compraventa?\"<br>
        • \"¿Qué derechos tengo si me despiden sin causa?\"<br>
        • \"¿Cuál es el procedimiento para un divorcio?\"<br>
        • \"¿Diferencia entre robo y hurto?\"<br>
        • \"¿Cómo presento una demanda civil?\"<br>
        • \"¿Cómo funciona una herencia?\"<br><br>
        
        ✅ Respuestas basadas en lpderecho.pe y legislación peruana vigente.`;
    }

    async function sendMessage() {
        const text = input.value.trim();
        if (text === "") return;

        addMessage(text, "user");
        input.value = "";

        const loadingMessage = document.createElement("div");
        loadingMessage.className = "message bot loading";
        loadingMessage.innerHTML = "⚖️ Procesando tu consulta legal...";
        messages.appendChild(loadingMessage);
        messages.scrollTop = messages.scrollHeight;

        // Simular delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Obtener respuesta local
        const botAnswer = getLocalResponse(text);
        loadingMessage.remove();
        addMessage(botAnswer, "bot");
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendMessage();
    });

    document.querySelectorAll(".quick-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            input.value = "Cuéntame sobre " + btn.textContent.trim();
            sendMessage();
        });
    });
});
