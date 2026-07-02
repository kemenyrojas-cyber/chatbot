"""Cerebro analítico de LEXIA.

Lee solicitudes JSON por stdin y devuelve una respuesta JSON por línea. El
proceso permanece vivo para evitar iniciar Python en cada consulta.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from typing import Any


ENGINE_VERSION = "1.2.0"


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or "").lower())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9ñ\s]", " ", text).strip()


def contains(text: str, pattern: str) -> bool:
    normalized_pattern = normalize(pattern)
    plural = r"(?:s|es)?" if " " not in normalized_pattern else ""
    return bool(re.search(rf"\b{re.escape(normalized_pattern)}{plural}\b", text))


@dataclass(frozen=True)
class Scenario:
    id: str
    area_id: str
    area_label: str
    topic_label: str
    phrases: tuple[str, ...]
    keywords: tuple[str, ...]
    context: tuple[str, ...] = ()
    required_context: bool = False


SCENARIOS = (
    Scenario(
        "penal_drogas", "derecho_penal", "Derecho Penal",
        "Delitos relacionados con drogas",
        ("tenencia ilicita de drogas", "posesion ilicita de drogas", "trafico ilicito de drogas",
         "microcomercializacion de drogas", "promocion o favorecimiento al trafico ilicito"),
        ("droga", "drogas", "cocaina", "marihuana", "pasta basica", "estupefaciente",
         "narcotrafico", "microcomercializacion"),
        ("tenencia", "posesion", "trafico", "venta", "consumo", "intervencion", "fiscalia"),
    ),
    Scenario(
        "penal_armas", "derecho_penal", "Derecho Penal",
        "Tenencia o porte de armas",
        ("tenencia ilegal de armas", "tenencia de armas", "porte ilegal de armas",
         "arma de fuego sin licencia"),
        ("arma", "armas", "pistola", "revolver", "municiones", "explosivos"),
        ("tenencia", "porte", "licencia", "sucamec", "intervencion"),
    ),
    Scenario(
        "penal_violencia", "derecho_penal", "Derecho Penal",
        "Violencia, lesiones o amenazas",
        ("violencia familiar", "violencia contra la mujer", "amenaza de muerte",
         "agresion fisica", "lesiones"),
        ("agresion", "golpe", "lesion", "amenaza", "violencia", "coaccion"),
        ("pareja", "victima", "denuncia", "policia", "fiscalia"),
    ),
    Scenario(
        "penal_patrimonio", "derecho_penal", "Derecho Penal",
        "Delito contra el patrimonio",
        ("me robaron", "me asaltaron", "fui estafado", "fui estafada"),
        ("robo", "hurto", "estafa", "fraude", "asalto", "extorsion"),
        ("denuncia", "fiscalia", "policia", "delito", "dinero"),
    ),
    Scenario(
        "penal_honor", "derecho_penal", "Derecho Penal",
        "Delitos contra el honor y afectación de la reputación",
        ("comentarios falsos", "acusaciones falsas", "publicacion difamatoria",
         "delito de difamacion", "delito de calumnia", "delito de injuria"),
        ("difamacion", "calumnia", "injuria", "difamatorio", "reputacion", "honor"),
        ("publicaron", "difundieron", "comentarios", "redes sociales", "acusacion", "falso"),
    ),
    Scenario(
        "penal_otros", "derecho_penal", "Derecho Penal",
        "Investigación o proceso penal",
        ("proceso penal", "denuncia penal", "investigacion fiscal", "codigo penal"),
        ("delito", "penal", "fiscalia", "imputado", "detenido", "condena", "prision"),
        ("denuncia", "investigacion", "audiencia", "sentencia"),
    ),
    Scenario(
        "familia_tenencia", "derecho_familia", "Derecho de Familia",
        "Tenencia, custodia o visitas de menores",
        ("tenencia de mi hijo", "tenencia de mi hija", "regimen de visitas",
         "custodia del menor", "patria potestad"),
        ("custodia", "visitas", "patria potestad"),
        ("hijo", "hija", "menor", "niño", "niña", "padre", "madre", "progenitor"),
        True,
    ),
    Scenario(
        "familia_alimentos", "derecho_familia", "Derecho de Familia",
        "Pensión de alimentos",
        ("pension de alimentos", "demanda de alimentos", "pension alimenticia"),
        ("alimentos", "alimenticia"),
        ("hijo", "hija", "menor", "demandante", "obligado"),
    ),
    Scenario(
        "familia_divorcio", "derecho_familia", "Derecho de Familia",
        "Divorcio o separación",
        ("demanda de divorcio", "quiero divorciarme", "separacion de cuerpos"),
        ("divorcio", "divorciarme", "separacion"),
        ("conyuge", "esposo", "esposa", "matrimonio"),
    ),
    Scenario(
        "civil_posesion", "derecho_civil", "Derecho Civil",
        "Posesión o propiedad de un bien",
        ("posesion de inmueble", "posesion de terreno", "tenencia de inmueble",
         "tenencia de terreno", "titulo de propiedad", "posesion precaria"),
        ("posesion", "propiedad", "inmueble", "terreno", "predio", "lindero"),
        ("propietario", "ocupante", "titulo", "partida", "desalojo"),
    ),
    Scenario(
        "civil_contratos", "derecho_civil", "Derecho Civil",
        "Contratos y obligaciones",
        ("incumplimiento de contrato", "contrato de arrendamiento", "contrato de compraventa"),
        ("contrato", "clausula", "obligacion", "arrendamiento", "compraventa", "deuda",
         "alquiler", "inquilino", "arrendatario"),
        ("incumplimiento", "pago", "resolver", "indemnizacion", "desalojo", "no quiere salir"),
    ),
    Scenario(
        "civil_sucesiones", "derecho_civil", "Derecho Civil",
        "Herencia o sucesión",
        ("sucesion intestada", "herencia sin testamento", "division de herencia"),
        ("herencia", "sucesion", "testamento", "heredero", "fallecido", "fallecio"),
        ("causante", "fallecido", "fallecio", "bienes", "partida", "hermano", "padre", "madre"),
    ),
    Scenario(
        "laboral", "derecho_laboral", "Derecho Laboral",
        "Relación laboral y derechos del trabajador",
        ("despido arbitrario", "me despidieron", "me despidio", "beneficios sociales",
         "contrato de trabajo", "relacion laboral", "trabajo en una empresa"),
        ("despido", "trabajador", "empleador", "sueldo", "cts", "gratificacion",
         "vacaciones", "liquidacion", "planilla"),
        ("empresa", "trabajo", "carta", "boleta"),
    ),
    Scenario(
        "consumidor", "derecho_consumidor", "Derecho del Consumidor",
        "Relación de consumo o reclamo",
        ("libro de reclamaciones", "reclamo ante indecopi", "proteccion al consumidor"),
        ("consumidor", "indecopi", "proveedor", "reclamo", "producto", "servicio"),
        ("compra", "cobro", "garantia", "idoneidad"),
    ),
    Scenario(
        "administrativo", "derecho_administrativo", "Derecho Administrativo",
        "Actuación o procedimiento administrativo",
        ("procedimiento administrativo", "recurso administrativo", "silencio administrativo"),
        ("municipalidad", "entidad publica", "sancion administrativa", "multa administrativa"),
        ("resolucion", "notificacion", "apelacion", "plazo"),
    ),
    Scenario(
        "discriminacion", "derecho_constitucional", "Derecho Constitucional",
        "Igualdad y no discriminación",
        ("caso de discriminacion", "trato discriminatorio", "trato desigual",
         "me discriminaron", "fui discriminado", "fui discriminada"),
        ("discriminacion", "discriminaron", "discriminatorio", "igualdad", "trato desigual"),
        ("sexo", "genero", "raza", "origen", "discapacidad", "edad", "religion",
         "orientacion sexual", "trabajo", "empleo", "colegio", "universidad", "servicio"),
    ),
    Scenario(
        "constitucional", "derecho_constitucional", "Derecho Constitucional",
        "Protección constitucional",
        ("proceso de amparo", "habeas corpus", "habeas data", "derecho fundamental"),
        ("constitucion", "constitucional", "amparo"),
        ("vulneracion", "derecho", "tribunal constitucional"),
    ),
    Scenario(
        "tributario", "derecho_tributario", "Derecho Tributario",
        "Obligación o procedimiento tributario",
        ("fiscalizacion tributaria", "deuda tributaria", "impuesto a la renta"),
        ("sunat", "tributario", "impuesto", "igv", "renta"),
        ("fiscalizacion", "multa", "declaracion", "pago"),
    ),
    Scenario(
        "comercial", "derecho_comercial", "Derecho Comercial",
        "Empresa, sociedad o actividad comercial",
        ("constitucion de empresa", "junta de accionistas", "ley general de sociedades"),
        ("empresa", "sociedad", "accionista", "gerente", "insolvencia"),
        ("capital", "acciones", "directorio", "estatuto"),
    ),
)

STRONG_SIGNALS = {
    "droga", "cocaina", "marihuana", "pasta basica", "estupefaciente",
    "narcotrafico", "microcomercializacion", "arma", "pistola", "revolver",
    "municiones", "explosivos", "robo", "hurto", "estafa", "fraude",
    "asalto", "extorsion", "homicidio", "difamacion", "calumnia", "injuria",
    "delito", "fiscalia", "imputado",
    "detenido", "custodia", "patria potestad", "alimentos", "divorcio",
    "posesion", "propiedad", "despido", "planilla", "indecopi", "municipalidad",
    "entidad publica", "sunat", "habeas corpus", "habeas data", "amparo",
    "discriminacion", "discriminatorio", "igualdad",
}


def score_scenario(text: str, scenario: Scenario) -> tuple[float, list[str]]:
    evidence: list[str] = []
    score = 0.0
    for phrase in scenario.phrases:
        if contains(text, phrase):
            score += 8.0
            evidence.append(phrase)
    keyword_hits = [word for word in scenario.keywords if contains(text, word)]
    context_hits = [word for word in scenario.context if contains(text, word)]
    if scenario.required_context and not context_hits and not evidence:
        return 0.0, []
    if not evidence and not keyword_hits:
        return 0.0, []
    score += sum(4.0 if normalize(word) in STRONG_SIGNALS else 2.5 for word in keyword_hits[:4])
    score += min(len(context_hits), 3) * 1.5
    evidence.extend(keyword_hits)
    evidence.extend(context_hits)
    return score, list(dict.fromkeys(evidence))


def memory_text(messages: list[dict[str, Any]]) -> str:
    relevant = [
        normalize(item.get("content"))
        for item in messages[-6:]
        if item.get("role") == "user" and item.get("content")
    ]
    return " ".join(relevant)


def confidence_label(score: float, margin: float) -> str:
    if score >= 12 and margin >= 5:
        return "alta"
    if score >= 4 and margin >= 2:
        return "media"
    return "baja"


def last_assistant_question(messages: list[dict[str, Any]]) -> str:
    for item in reversed(messages):
        if item.get("role") != "assistant":
            continue
        content = str(item.get("content") or "").strip()
        for line in reversed(content.splitlines()):
            if "?" not in line:
                continue
            question_start = line.rfind("¿")
            return line[question_start if question_start >= 0 else 0:].strip()
    return ""


def extract_current_focus(query: str) -> str:
    raw = str(query or "").strip()
    patterns = (
        r"(?:ya\s+te\s+dije\s+que\s+)?(?:estoy\s+hablando|hablo)\s+de\s+(.+)",
        r"(?:me\s+refiero|quiero\s+decir)\s+(?:a|que)?\s*(.+)",
        r"\bno\s+(?:es|era)\s+.+?[,.;]\s*(?:es|era|sino)\s+(.+)",
    )
    for pattern in patterns:
        match = re.search(pattern, raw, re.IGNORECASE)
        if match:
            return match.group(1).strip(" .,:;")
    cleaned = re.sub(
        r"^(?:no[,:\s]+|ya\s+te\s+dije\s+que\s+|te\s+estoy\s+diciendo\s+que\s+|"
        r"lo\s+que\s+digo\s+es\s+|corrijo[:,]?\s*)",
        "",
        raw,
        flags=re.IGNORECASE,
    )
    return cleaned.strip(" .,:;")


def detect_user_goal(text: str) -> dict[str, str] | None:
    goals = (
        ("defense", "defender a una persona", r"\b(defender|defensa|mi defendido|mi patrocinado)\b"),
        ("report", "denunciar un hecho", r"\b(denunciar|presentar denuncia|hacer una denuncia)\b"),
        ("understand", "entender la situación", r"\b(entender|comprender|saber que significa|informacion)\b"),
        ("claim", "presentar un reclamo o demanda", r"\b(reclamar|demandar|presentar demanda)\b"),
        ("prepare", "preparar un documento", r"\b(redactar|preparar|hacer un escrito|hacer una carta)\b"),
    )
    for goal_id, label, pattern in goals:
        if re.search(pattern, text):
            return {"id": goal_id, "label": label}
    return None


def is_replacement_language(text: str) -> bool:
    return bool(re.search(
        r"\b(no dije eso|eso no es|eso no fue|te equivocas|estas mal|incorrecto|corrige|"
        r"malinterpretaste|ya te dije|te estoy diciendo|hablo de|estoy hablando de|"
        r"me refiero|quiero decir|no es .+ sino|otro caso|otra consulta|cambiando de tema|"
        r"ahora quiero hablar|nuevo tema)\b",
        text,
    ))


NORMATIVE_SOURCES = (
    {
        "id": "constitucion",
        "label": "Constitución Política del Perú",
        "area": {"id": "derecho_constitucional", "label": "Derecho Constitucional"},
        "pattern": r"\b(constitucion politica del peru|constitucion del peru|constitucion|carta magna)\b",
    },
    {
        "id": "codigo_penal",
        "label": "Código Penal",
        "area": {"id": "derecho_penal", "label": "Derecho Penal"},
        "pattern": r"\b(codigo penal|cod penal)\b",
    },
    {
        "id": "codigo_civil",
        "label": "Código Civil",
        "area": {"id": "derecho_civil", "label": "Derecho Civil"},
        "pattern": r"\b(codigo civil|cod civil)\b",
    },
)


def detect_normative_source(text: str) -> dict[str, Any] | None:
    normalized = normalize(text)
    for source in NORMATIVE_SOURCES:
        if re.search(source["pattern"], normalized):
            return {
                "id": source["id"],
                "label": source["label"],
                "area": dict(source["area"]),
            }
    return None


def extract_article_number(text: str) -> str:
    match = re.search(r"\bart(?:iculo)?\s*(\d+[a-z]?)\b", normalize(text))
    return match.group(1) if match else ""


def analyze_normative_memory(query: str, messages: list[dict[str, Any]]) -> dict[str, Any] | None:
    current_source = detect_normative_source(query)
    memory_source = None
    memory_article = ""
    for item in reversed(messages[-12:]):
        if item.get("role") != "user":
            continue
        content = str(item.get("content") or "")
        if not memory_article:
            memory_article = extract_article_number(content)
        if not memory_source:
            memory_source = detect_normative_source(content)
        if memory_source and memory_article:
            break

    source = current_source or memory_source
    current_article = extract_article_number(query)
    article = current_article or memory_article
    if not source:
        return None

    normalized = normalize(query)
    definition_request = bool(re.search(
        r"\b(que es|que significa|que quiere decir|a que se refiere|defineme)\b",
        normalized,
    ))
    source_request = bool(re.search(
        r"\b(fuente|base legal|fundamento|sustento|donde dice|de donde sale)\b",
        normalized,
    ))
    request_kind = (
        "article_text" if current_article
        else "definition" if definition_request
        else "source" if source_request
        else "normative_information"
    )
    explicit_request = bool(
        current_article
        or definition_request
        or source_request
        or re.search(
            r"\b(que dice|dime|explicame|quiero que me digas|quiero saber|"
            r"texto|articulo|norma|contenido|significa)\b",
            normalized,
        )
    )
    return {
        "source": source,
        "origin": "current" if current_source else "memory",
        "requestedArticle": article,
        "requestKind": request_kind,
        "explicitRequest": explicit_request,
        "currentOverridesMemory": bool(
            current_source and memory_source and current_source["id"] != memory_source["id"]
        ),
        "memorySource": memory_source,
    }


def is_explicit_request(text: str) -> bool:
    normalized = normalize(text)
    return bool(
        "?" in str(text)
        or extract_article_number(text)
        or re.search(
            r"^(que|como|cuando|donde|por que|cual)\b|"
            r"\b(quiero que me digas|quiero saber|dime|explicame|defineme|"
            r"que dice|que significa|que puedo hacer|necesito saber)\b",
            normalized,
        )
    )


def answers_question(query: str, question: str) -> bool:
    answer = normalize(query)
    asked = normalize(question)
    if not asked:
        return False
    if re.search(r"\bcuando|fecha|que dia\b", asked):
        return bool(re.search(
            r"\b(hoy|ayer|mañana|hace\s+\d+|en\s+\d{4}|\d{1,2}[/-]\d{1,2}|"
            r"enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|"
            r"octubre|noviembre|diciembre)\b",
            answer,
        ))
    if re.search(r"\b(denuncia|citacion|notificacion|preventiva)\b", asked):
        return bool(re.search(r"\b(denuncia|denunciado|citacion|notificacion|preventiva|todavia no|aun no)\b", answer))
    if re.search(r"\b(denunciar|defender|entender)\b", asked):
        return detect_user_goal(answer) is not None
    if re.search(r"\b(necesitas lograr|quieres lograr|objetivo|que buscas|que necesitas)\b", asked):
        return detect_user_goal(answer) is not None
    if re.search(r"\b(que ocurrio|que paso|cuentame que)\b", asked):
        return len(answer.split()) >= 3
    if re.fullmatch(r"(si|sí|no|todavia no|aun no|ya)", answer):
        return True
    return False


def analyze_dialogue(query: str, messages: list[dict[str, Any]], ambiguous: bool) -> dict[str, Any]:
    text = normalize(query)
    has_memory = bool(messages)
    explicit_request = is_explicit_request(query)
    correction = has_memory and is_replacement_language(text) and not re.search(
        r"\b(otro caso|otra consulta|cambiando de tema|ahora quiero hablar|nuevo tema)\b", text
    )
    explicit_topic_shift = bool(re.search(
        r"\b(otro caso|otra consulta|cambiando de tema|ahora quiero hablar|nuevo tema)\b",
        text,
    ))
    assistant_question = last_assistant_question(messages)
    short_answer = bool(
        has_memory
        and assistant_question
        and answers_question(query, assistant_question)
        and not explicit_request
        and not correction
        and not explicit_topic_shift
    )
    if correction:
        speech_act = "correction"
    elif explicit_topic_shift:
        speech_act = "topic_shift"
    elif short_answer:
        speech_act = "answer"
    elif re.search(r"\b(no entiendo|no comprendo|no me queda claro|me confunde)\b", text):
        speech_act = "confusion"
    elif explicit_request:
        speech_act = "question"
    elif has_memory:
        speech_act = "new_fact"
    else:
        speech_act = "case_start"

    goal = detect_user_goal(text)
    focus = extract_current_focus(query) if correction or explicit_topic_shift else str(query or "").strip()
    replace_prior = correction or explicit_topic_shift
    needs_confirmation = ambiguous and speech_act not in ("answer", "correction")
    prior_user_facts = [
        normalize(str(item.get("content") or ""))
        for item in messages[-12:]
        if item.get("role") == "user"
        and len(normalize(str(item.get("content") or "")).split()) >= 3
        and not re.fullmatch(r"(si|sí|no|ok|vale|gracias|entiendo|entendido)", normalize(str(item.get("content") or "")))
    ]
    current_is_fact = (
        speech_act in ("answer", "new_fact")
        and len(text.split()) >= 3
    )
    recent_assistant_questions = [
        str(item.get("content") or "").strip()
        for item in messages[-8:]
        if item.get("role") == "assistant" and "?" in str(item.get("content") or "")
    ]
    analysis_ready = (
        speech_act in ("answer", "new_fact")
        and (len(prior_user_facts) + (1 if current_is_fact else 0) >= 2)
    )
    question_fatigue = (
        speech_act in ("answer", "new_fact")
        and len(recent_assistant_questions) >= 2
    )
    return {
        "speechAct": speech_act,
        "currentFocus": focus,
        "userGoal": goal,
        "lastAssistantQuestion": assistant_question,
        "answeredPreviousQuestion": short_answer,
        "supersedesPriorInterpretation": replace_prior,
        "memoryPolicy": "replace" if replace_prior else ("continue" if has_memory else "new"),
        "responsePlan": {
            "acknowledgeLatestTurn": has_memory or speech_act in ("correction", "answer", "new_fact"),
            "acknowledgeCorrection": correction,
            "answerLatestTurnFirst": True,
            "analysisBeforeQuestion": speech_act in ("answer", "new_fact"),
            "analysisReady": analysis_ready,
            "questionFatigue": question_fatigue,
            "confirmUnderstanding": needs_confirmation,
            "includeSources": False,
            "maxQuestions": 0 if analysis_ready or question_fatigue else 1,
            "maxParagraphs": 3,
            "avoidQuestion": assistant_question if short_answer else "",
            "avoidQuestions": recent_assistant_questions[-4:],
        },
    }


def conversation_mode(query: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
    text = normalize(query)
    has_memory = bool(messages)
    rules = (
        ("source_request", "Pedido de fuente o base legal",
         r"\b(donde dice|de donde sale|de donde sacas|fuente|base legal|fundamento legal|sustento legal|"
         r"en que norma|que norma|que ley|que articulo)\b"),
        ("norm_request", "Pedido de norma o artículo",
         r"\b(articulo\s+\d+|ley\s+\d+|codigo penal|codigo civil|codigo procesal|"
         r"texto de la norma|normas aplicables)\b"),
        ("definition_request", "Pregunta de definición o explicación",
         r"\b(que es|que significa|que quiere decir|a que se refiere|defineme)\b"),
        ("correction", "Corrección del usuario",
         r"\b(no dije eso|eso no es|te equivocas|estas mal|incorrecto|corrige|malinterpretaste|"
         r"ya te dije|te estoy diciendo|hablo de|estoy hablando de|me refiero|quiero decir)\b"),
        ("confusion", "Usuario confundido",
         r"\b(no entiendo|no comprendo|no me queda claro|me confunde|explicame mas simple)\b"),
        ("action_request", "Pedido de próximos pasos",
         r"\b(que hago|que puedo hacer|como procedo|que sigue|siguiente paso)\b"),
    )
    for mode_id, label, pattern in rules:
        if re.search(pattern, text):
            deterministic = mode_id in ("source_request", "norm_request")
            return {
                "id": mode_id,
                "label": label,
                "hasMemory": has_memory,
                "status": None,
                "deterministic": deterministic,
            }
    if has_memory and (len(text.split()) <= 4 or re.search(r"\b(si|no|continua|explica|por que|como asi)\b", text)):
        return {
            "id": "follow_up",
            "label": "Seguimiento conversacional",
            "hasMemory": True,
            "status": None,
            "deterministic": False,
        }
    return {
        "id": "case_start",
        "label": "Nuevo caso o consulta",
        "hasMemory": has_memory,
        "status": None,
        "deterministic": False,
    }


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    query = str(payload.get("query") or "").strip()
    baseline = payload.get("baseline") if isinstance(payload.get("baseline"), dict) else {}
    messages = payload.get("memoryMessages") if isinstance(payload.get("memoryMessages"), list) else []
    current = normalize(query)
    previous = memory_text(messages)
    normative_memory = analyze_normative_memory(query, messages)
    normative_request = bool(normative_memory and normative_memory["explicitRequest"])
    replacement_turn = bool(messages) and is_replacement_language(current)
    baseline_interpretation = baseline.get("interpretation") if isinstance(baseline.get("interpretation"), dict) else {}
    authoritative_norm = bool(
        baseline_interpretation.get("normativeReference")
        and baseline_interpretation.get("knownLaw")
    )

    ranked: list[dict[str, Any]] = []
    for scenario in SCENARIOS:
        current_score, current_evidence = score_scenario(current, scenario)
        previous_score, previous_evidence = score_scenario(previous, scenario)
        memory_contribution = (
            previous_score * (0.5 if current_score == 0 else 0.25)
            if current_score < 6 and not replacement_turn
            else 0.0
        )
        total = current_score + memory_contribution
        if total <= 0:
            continue
        ranked.append({
            "id": scenario.id,
            "area": {"id": scenario.area_id, "label": scenario.area_label},
            "topic": {"id": scenario.id, "label": scenario.topic_label},
            "score": round(total, 2),
            "currentScore": round(current_score, 2),
            "memoryScore": round(memory_contribution, 2),
            "evidence": current_evidence,
            "memoryEvidence": previous_evidence if memory_contribution else [],
        })
    ranked.sort(key=lambda item: (-item["score"], item["id"]))

    top = ranked[0] if ranked else None
    baseline_current_score = float(baseline_interpretation.get("currentAreaScore") or 0)
    if not top and replacement_turn and baseline_current_score > 0:
        top = {
            "id": baseline.get("topic", {}).get("id", "tema_corregido"),
            "area": baseline.get("area", {}),
            "topic": baseline.get("topic", {}),
            "score": baseline_current_score,
            "currentScore": baseline_current_score,
            "memoryScore": 0.0,
            "evidence": [extract_current_focus(query)],
            "memoryEvidence": [],
        }
    second = ranked[1] if len(ranked) > 1 else None
    margin = (top["score"] - second["score"]) if top and second else (top["score"] if top else 0.0)
    confidence = confidence_label(top["score"] if top else 0.0, margin)
    ambiguous = not top or confidence == "baja"
    baseline_area = baseline.get("area") if isinstance(baseline.get("area"), dict) else {}
    memory_conflict = bool(
        top
        and baseline_area.get("id")
        and baseline_area.get("id") not in ("area_no_determinada", top["area"]["id"])
    )

    intent = dict(baseline)
    intent["conversationMode"] = conversation_mode(query, messages)
    dialogue = analyze_dialogue(query, messages, ambiguous)
    if normative_request:
        source = normative_memory["source"]
        article = normative_memory["requestedArticle"]
        request_kind = normative_memory["requestKind"]
        intent["type"] = {
            "id": "consulta_normativa",
            "label": "Consulta normativa",
            "confidence": "alta",
        }
        intent["area"] = {**source["area"], "confidence": "alta"}
        intent["topic"] = {
            "id": source["id"],
            "label": source["label"],
            "confidence": "alta",
        }
        intent["objective"] = {
            "id": "comprender_norma" if request_kind == "definition" else "ubicar_norma",
            "label": "Comprender la norma" if request_kind == "definition" else "Ubicar norma o artículo",
            "confidence": "alta",
        }
        mode_id = (
            "definition_request" if request_kind == "definition"
            else "source_request" if request_kind == "source"
            else "norm_request"
        )
        intent["conversationMode"] = {
            "id": mode_id,
            "label": (
                "Pregunta de definición o explicación" if mode_id == "definition_request"
                else "Pedido de fuente o base legal" if mode_id == "source_request"
                else "Pedido de norma o artículo"
            ),
            "hasMemory": bool(messages),
            "status": None,
            "deterministic": mode_id in ("source_request", "norm_request"),
        }
        intent["concepts"] = list(dict.fromkeys(filter(None, [
            source["label"],
            f"artículo {article}" if article else "",
            *list(intent.get("concepts") or []),
        ])))[:12]
        intent["needsMoreFacts"] = False
        ambiguous = False
        confidence = "alta"
        top = {
            "id": source["id"],
            "area": source["area"],
            "topic": {"id": source["id"], "label": source["label"]},
            "score": 100.0,
            "currentScore": 100.0,
            "memoryScore": 0.0,
            "evidence": [source["label"], f"artículo {article}" if article else ""],
            "memoryEvidence": [],
        }
        margin = 100.0
        dialogue["speechAct"] = "question"
        dialogue["answeredPreviousQuestion"] = False
        dialogue["responsePlan"]["avoidQuestion"] = ""
        dialogue["responsePlan"]["maxQuestions"] = 0
        dialogue["responsePlan"]["includeSources"] = True
        if normative_memory["currentOverridesMemory"]:
            dialogue["supersedesPriorInterpretation"] = True
            dialogue["memoryPolicy"] = "replace"
    if dialogue["userGoal"] and not normative_request:
        intent["objective"] = {
            "id": dialogue["userGoal"]["id"],
            "label": dialogue["userGoal"]["label"],
            "confidence": "alta",
        }
    if normative_request:
        pass
    elif authoritative_norm:
        ambiguous = False
        confidence = "alta"
        top = {
            "id": intent.get("topic", {}).get("id", "referencia_normativa"),
            "area": intent.get("area", {}),
            "topic": intent.get("topic", {}),
            "score": 100.0,
            "currentScore": 100.0,
            "memoryScore": 0.0,
            "evidence": ["referencia normativa reconocida"],
            "memoryEvidence": [],
        }
        margin = 100.0
    elif top and not ambiguous:
        intent["area"] = {**top["area"], "confidence": confidence}
        intent["topic"] = {**top["topic"], "confidence": confidence}
        intent["concepts"] = list(dict.fromkeys(top["evidence"] + list(intent.get("concepts") or [])))[:12]
        intent["needsMoreFacts"] = False
    elif ambiguous:
        intent["area"] = {
            "id": "area_no_determinada",
            "label": "Área no determinada",
            "confidence": "baja",
        }
        intent["topic"] = {
            "id": "tema_ambiguo",
            "label": top["topic"]["label"] if top else "Tema no determinado",
            "confidence": "baja",
        }
        intent["needsMoreFacts"] = True

    interpretation = dict(intent.get("interpretation") or {})
    dialogue["responsePlan"]["includeSources"] = intent["conversationMode"]["id"] in (
        "source_request", "norm_request"
    )
    if (
        dialogue["speechAct"] == "question"
        and not ambiguous
        and intent["conversationMode"]["id"] not in ("source_request", "norm_request")
    ):
        dialogue["responsePlan"]["maxQuestions"] = 0
    interpretation["dialogue"] = dialogue
    interpretation["ignoredMemory"] = dialogue["supersedesPriorInterpretation"]
    interpretation["normativeSource"] = ({
        "id": normative_memory["source"]["id"],
        "label": normative_memory["source"]["label"],
        "origin": normative_memory["origin"],
        "requestedArticle": normative_memory["requestedArticle"],
        "requestKind": normative_memory["requestKind"],
        "currentOverridesMemory": normative_memory["currentOverridesMemory"],
    } if normative_memory else None)
    interpretation["currentAreaScore"] = top["currentScore"] if top else 0
    interpretation["currentTopicScore"] = top["currentScore"] if top else 0
    interpretation["pythonBrain"] = {
        "version": ENGINE_VERSION,
        "status": "normative" if (authoritative_norm or normative_request) else ("clarify" if ambiguous else "selected"),
        "confidence": confidence,
        "margin": round(margin, 2),
        "memoryConflict": memory_conflict,
        "candidates": ranked[:4],
    }
    intent["interpretation"] = interpretation

    return {
        "ok": True,
        "engine": "lexia-python-brain",
        "version": ENGINE_VERSION,
        "query": query,
        "decision": {
            "status": "normative" if (authoritative_norm or normative_request) else ("clarify" if ambiguous else "selected"),
            "confidence": confidence,
            "margin": round(margin, 2),
            "selected": top,
        },
        "candidates": ranked[:4],
        "alternativeInterpretations": ranked[1:4],
        "memory": {
            "used": bool(top and top["memoryScore"] > 0),
            "conflict": memory_conflict,
        },
        "intent": intent,
    }


def process_line(line: str) -> dict[str, Any]:
    request = json.loads(line)
    request_id = request.get("id")
    try:
        result = analyze(request.get("payload") or request)
        return {"id": request_id, "result": result}
    except Exception as error:  # Keep worker alive after malformed requests.
        return {"id": request_id, "error": f"{type(error).__name__}: {error}"}


def run_worker() -> None:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            response = process_line(line)
        except Exception as error:
            response = {"id": None, "error": f"{type(error).__name__}: {error}"}
        print(json.dumps(response, ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", action="store_true")
    parser.add_argument("--query")
    args = parser.parse_args()
    if args.worker:
        run_worker()
        return
    payload = {"query": args.query} if args.query is not None else json.load(sys.stdin)
    print(json.dumps(analyze(payload), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
