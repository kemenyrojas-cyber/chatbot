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


ENGINE_VERSION = "1.0.0"


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
        ("contrato", "clausula", "obligacion", "arrendamiento", "compraventa", "deuda"),
        ("incumplimiento", "pago", "resolver", "indemnizacion"),
    ),
    Scenario(
        "civil_sucesiones", "derecho_civil", "Derecho Civil",
        "Herencia o sucesión",
        ("sucesion intestada", "herencia sin testamento", "division de herencia"),
        ("herencia", "sucesion", "testamento", "heredero"),
        ("causante", "fallecido", "bienes", "partida"),
    ),
    Scenario(
        "laboral", "derecho_laboral", "Derecho Laboral",
        "Relación laboral y derechos del trabajador",
        ("despido arbitrario", "me despidieron", "me despidio", "beneficios sociales",
         "contrato de trabajo"),
        ("despido", "trabajador", "empleador", "sueldo", "cts", "gratificacion",
         "vacaciones", "liquidacion"),
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
    "asalto", "extorsion", "homicidio", "delito", "fiscalia", "imputado",
    "detenido", "custodia", "patria potestad", "alimentos", "divorcio",
    "posesion", "propiedad", "despido", "indecopi", "municipalidad",
    "entidad publica", "sunat", "habeas corpus", "habeas data", "amparo",
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
         r"\b(no dije eso|eso no es|te equivocas|estas mal|incorrecto|corrige|malinterpretaste)\b"),
        ("confusion", "Usuario confundido",
         r"\b(no entiendo|no comprendo|no me queda claro|me confunde|explicame mas simple)\b"),
        ("action_request", "Pedido de próximos pasos",
         r"\b(que hago|que puedo hacer|como procedo|que sigue|siguiente paso)\b"),
    )
    for mode_id, label, pattern in rules:
        if re.search(pattern, text):
            return {
                "id": mode_id,
                "label": label,
                "hasMemory": has_memory,
                "status": None,
                "deterministic": True,
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
    baseline_interpretation = baseline.get("interpretation") if isinstance(baseline.get("interpretation"), dict) else {}
    authoritative_norm = bool(
        baseline_interpretation.get("normativeReference")
        and baseline_interpretation.get("knownLaw")
    )

    ranked: list[dict[str, Any]] = []
    for scenario in SCENARIOS:
        current_score, current_evidence = score_scenario(current, scenario)
        previous_score, previous_evidence = score_scenario(previous, scenario)
        memory_contribution = previous_score * (0.5 if current_score == 0 else 0.25) if current_score < 6 else 0.0
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
    if authoritative_norm:
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
    interpretation["pythonBrain"] = {
        "version": ENGINE_VERSION,
        "status": "normative" if authoritative_norm else ("clarify" if ambiguous else "selected"),
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
            "status": "normative" if authoritative_norm else ("clarify" if ambiguous else "selected"),
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
