import unittest

from brain import analyze


class BrainScenarioMatrixTest(unittest.TestCase):
    def assert_area(self, query, expected_area):
        result = analyze({"query": query, "baseline": {}})
        self.assertEqual(result["decision"]["status"], "selected", query)
        self.assertEqual(result["intent"]["area"]["id"], expected_area, query)

    def test_penal_scenarios(self):
        cases = (
            "Me investigan por posesión ilícita de drogas.",
            "Tengo un problema por tenencia de marihuana.",
            "Lo intervinieron con cocaína.",
            "Me denunciaron por tenencia ilegal de armas.",
            "Fui víctima de una estafa.",
            "Recibí una amenaza de muerte.",
        )
        for query in cases:
            with self.subTest(query=query):
                self.assert_area(query, "derecho_penal")

    def test_family_scenarios(self):
        cases = (
            "Quiero solicitar la tenencia de mi hijo.",
            "Necesito establecer un régimen de visitas para mi hija.",
            "Quiero presentar una demanda de alimentos.",
            "Deseo divorciarme de mi esposo.",
        )
        for query in cases:
            with self.subTest(query=query):
                self.assert_area(query, "derecho_familia")

    def test_civil_and_other_scenarios(self):
        cases = (
            ("Tengo la posesión de un terreno sin título.", "derecho_civil"),
            ("Incumplieron mi contrato de arrendamiento.", "derecho_civil"),
            ("Me despidieron sin entregarme una carta.", "derecho_laboral"),
            ("Quiero reclamar ante Indecopi contra un proveedor.", "derecho_consumidor"),
            ("La municipalidad me impuso una multa administrativa.", "derecho_administrativo"),
            ("Quiero presentar un proceso de amparo.", "derecho_constitucional"),
            ("SUNAT inició una fiscalización tributaria.", "derecho_tributario"),
            ("Hay un conflicto entre los accionistas de la empresa.", "derecho_comercial"),
        )
        for query, area in cases:
            with self.subTest(query=query):
                self.assert_area(query, area)

    def test_ambiguous_language_requests_clarification(self):
        for query in ("Tengo un problema de tenencia.", "Necesito ayuda legal.", "Qué puedo hacer"):
            with self.subTest(query=query):
                result = analyze({"query": query, "baseline": {}})
                self.assertEqual(result["decision"]["status"], "clarify")

    def test_current_message_outweighs_conflicting_memory(self):
        result = analyze({
            "query": "Ahora me investigan por posesión ilícita de drogas.",
            "memoryMessages": [
                {"role": "user", "content": "Antes consulté por la tenencia de mi hijo menor."}
            ],
            "baseline": {
                "area": {"id": "derecho_familia", "label": "Derecho de Familia"}
            }
        })
        self.assertEqual(result["intent"]["area"]["id"], "derecho_penal")
        self.assertFalse(result["memory"]["used"])
        self.assertTrue(result["memory"]["conflict"])

    def test_recognized_normative_reference_keeps_existing_contract(self):
        baseline = {
            "area": {"id": "derecho_constitucional", "label": "Derecho Constitucional", "confidence": "alta"},
            "topic": {"id": "ley_29973", "label": "Ley General de la Persona con Discapacidad", "confidence": "alta"},
            "interpretation": {
                "normativeReference": {"number": "29973"},
                "knownLaw": {"number": "29973", "title": "Ley General de la Persona con Discapacidad"},
            },
        }
        result = analyze({"query": "Ley 29973", "baseline": baseline})
        self.assertEqual(result["decision"]["status"], "normative")
        self.assertEqual(result["intent"]["topic"]["id"], "ley_29973")

    def test_short_follow_up_can_use_clear_memory(self):
        result = analyze({
            "query": "Sí, explícame",
            "memoryMessages": [
                {"role": "user", "content": "Me despidieron sin entregarme carta de despido."}
            ],
            "baseline": {},
        })
        self.assertEqual(result["intent"]["area"]["id"], "derecho_laboral")
        self.assertTrue(result["memory"]["used"])
        self.assertEqual(result["intent"]["conversationMode"]["id"], "follow_up")

    def test_case_fact_is_not_misread_as_source_request(self):
        result = analyze({
            "query": "Me investigan por posesión ilícita de drogas.",
            "baseline": {
                "conversationMode": {
                    "id": "source_request",
                    "label": "Pedido de fuente",
                    "deterministic": True,
                }
            },
        })
        self.assertEqual(result["intent"]["conversationMode"]["id"], "case_start")
        self.assertFalse(result["intent"]["conversationMode"]["deterministic"])

    def test_explicit_source_request_remains_source_request(self):
        result = analyze({
            "query": "¿Cuál es la base legal y en qué norma aparece?",
            "baseline": {},
        })
        self.assertEqual(result["intent"]["conversationMode"]["id"], "source_request")


if __name__ == "__main__":
    unittest.main()
