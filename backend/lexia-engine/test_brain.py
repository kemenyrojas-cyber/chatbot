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
            ("Mi inquilino debe cuatro meses de alquiler y no quiere salir.", "derecho_civil"),
            ("Mi padre falleció y un hermano se quedó con todos sus bienes.", "derecho_civil"),
            ("Me despidieron sin entregarme una carta.", "derecho_laboral"),
            ("Quiero reclamar ante Indecopi contra un proveedor.", "derecho_consumidor"),
            ("La municipalidad me impuso una multa administrativa.", "derecho_administrativo"),
            ("Quiero presentar un proceso de amparo.", "derecho_constitucional"),
            ("Tengo un caso de discriminación.", "derecho_constitucional"),
            ("Me dieron un trato desigual por mi discapacidad.", "derecho_constitucional"),
            ("SUNAT inició una fiscalización tributaria.", "derecho_tributario"),
            ("Hay un conflicto entre los accionistas de la empresa.", "derecho_comercial"),
        )
        for query, area in cases:
            with self.subTest(query=query):
                self.assert_area(query, area)

    def test_discrimination_has_specific_topic_instead_of_ambiguous_area(self):
        result = analyze({
            "query": "Tengo un caso de discriminación",
            "baseline": {},
            "memoryMessages": [],
        })
        self.assertEqual(result["intent"]["area"]["id"], "derecho_constitucional")
        self.assertEqual(result["intent"]["topic"]["id"], "discriminacion")
        self.assertFalse(result["intent"]["needsMoreFacts"])

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

    def test_generic_action_question_inherits_labor_context_from_memory(self):
        result = analyze({
            "query": "¿Qué debo hacer ahora para reclamar?",
            "memoryMessages": [
                {"role": "user", "content": "Trabajo en una empresa privada desde hace tres años y estoy en planilla."},
                {"role": "assistant", "content": "¿El despido fue escrito o verbal?"},
                {"role": "user", "content": "Fue verbal y tengo mensajes del supervisor."},
            ],
            "baseline": {},
        })
        self.assertEqual(result["intent"]["area"]["id"], "derecho_laboral")
        self.assertEqual(result["intent"]["topic"]["id"], "laboral")
        self.assertFalse(result["intent"]["needsMoreFacts"])

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

    def test_short_answer_updates_goal_and_does_not_repeat_question(self):
        question = "¿Buscas denunciar, defender a alguien o entender la situación?"
        result = analyze({
            "query": "Defender a alguien",
            "memoryMessages": [
                {"role": "user", "content": "Tengo un problema y necesito orientación."},
                {"role": "assistant", "content": question},
            ],
            "baseline": {},
        })
        dialogue = result["intent"]["interpretation"]["dialogue"]
        self.assertEqual(dialogue["speechAct"], "answer")
        self.assertEqual(dialogue["userGoal"]["id"], "defense")
        self.assertTrue(dialogue["answeredPreviousQuestion"])
        self.assertEqual(dialogue["responsePlan"]["avoidQuestion"], question)

    def test_explicit_correction_replaces_prior_interpretation(self):
        baseline = {
            "area": {"id": "derecho_penal", "label": "Derecho Penal", "confidence": "media"},
            "topic": {"id": "difamacion", "label": "Difamación", "confidence": "media"},
            "interpretation": {"currentAreaScore": 8, "currentTopicScore": 8},
        }
        result = analyze({
            "query": "Ya te dije que hablo de difamación",
            "memoryMessages": [
                {"role": "user", "content": "Antes estaba consultando por otro asunto."},
                {"role": "assistant", "content": "¿Quieres información sobre ese asunto anterior?"},
            ],
            "baseline": baseline,
        })
        dialogue = result["intent"]["interpretation"]["dialogue"]
        self.assertEqual(dialogue["speechAct"], "correction")
        self.assertEqual(dialogue["currentFocus"].lower(), "difamación")
        self.assertTrue(dialogue["supersedesPriorInterpretation"])
        self.assertEqual(dialogue["memoryPolicy"], "replace")
        self.assertFalse(dialogue["answeredPreviousQuestion"])
        self.assertTrue(result["intent"]["interpretation"]["ignoredMemory"])

    def test_response_plan_is_brief_and_does_not_add_unrequested_sources(self):
        result = analyze({
            "query": "Me pasó algo y quiero explicarlo",
            "memoryMessages": [],
            "baseline": {},
        })
        plan = result["intent"]["interpretation"]["dialogue"]["responsePlan"]
        self.assertLessEqual(plan["maxParagraphs"], 3)
        self.assertEqual(plan["maxQuestions"], 1)
        self.assertFalse(plan["includeSources"])

    def test_short_statement_that_does_not_answer_when_is_new_fact(self):
        result = analyze({
            "query": "Publicaron comentarios falsos sobre esa persona",
            "memoryMessages": [
                {"role": "assistant", "content": "¿Cuándo ocurrió el hecho principal?"}
            ],
            "baseline": {},
        })
        dialogue = result["intent"]["interpretation"]["dialogue"]
        self.assertEqual(dialogue["speechAct"], "new_fact")
        self.assertFalse(dialogue["answeredPreviousQuestion"])

    def test_date_answer_really_answers_when_question(self):
        result = analyze({
            "query": "Fue ayer por la tarde",
            "memoryMessages": [
                {"role": "assistant", "content": "¿Cuándo ocurrió el hecho principal?"}
            ],
            "baseline": {},
        })
        dialogue = result["intent"]["interpretation"]["dialogue"]
        self.assertEqual(dialogue["speechAct"], "answer")
        self.assertTrue(dialogue["answeredPreviousQuestion"])

    def test_two_substantive_facts_trigger_analysis_without_another_question(self):
        result = analyze({
            "query": "También tengo la cuenta bancaria donde llegó el dinero",
            "memoryMessages": [
                {"role": "user", "content": "Me amenazaron para que entregara dinero"},
                {"role": "assistant", "content": "¿La amenaza sigue activa ahora?"},
                {"role": "user", "content": "Ya presenté la denuncia y guardé los mensajes"},
                {"role": "assistant", "content": "¿Cuándo ocurrió el hecho principal?"},
            ],
            "baseline": {},
        })
        plan = result["intent"]["interpretation"]["dialogue"]["responsePlan"]
        self.assertTrue(plan["analysisBeforeQuestion"])
        self.assertTrue(plan["analysisReady"])
        self.assertEqual(plan["maxQuestions"], 0)
        self.assertEqual(len(plan["avoidQuestions"]), 2)

    def test_repeated_question_turns_activate_question_fatigue(self):
        result = analyze({
            "query": "La notificaron ayer",
            "memoryMessages": [
                {"role": "assistant", "content": "¿Buscas denunciar, defender o entender el proceso?"},
                {"role": "user", "content": "Quiero defender a mi patrocinada"},
                {"role": "assistant", "content": "¿Ya recibió una denuncia, citación o notificación?"},
            ],
            "baseline": {},
        })
        plan = result["intent"]["interpretation"]["dialogue"]["responsePlan"]
        self.assertTrue(plan["questionFatigue"])
        self.assertEqual(plan["maxQuestions"], 0)

    def test_direct_question_can_finish_without_automatic_question(self):
        baseline = {
            "area": {"id": "derecho_civil", "label": "Derecho Civil", "confidence": "alta"},
            "topic": {"id": "civil_contratos", "label": "Contratos", "confidence": "alta"},
            "interpretation": {"currentAreaScore": 10, "currentTopicScore": 10},
        }
        result = analyze({
            "query": "¿Qué puedo hacer ante este incumplimiento de contrato?",
            "baseline": baseline,
        })
        plan = result["intent"]["interpretation"]["dialogue"]["responsePlan"]
        self.assertEqual(result["intent"]["interpretation"]["dialogue"]["speechAct"], "question")
        self.assertEqual(plan["maxQuestions"], 0)

    def test_false_publications_are_understood_as_honor_case(self):
        result = analyze({
            "query": "¿Qué puedo hacer si publicaron comentarios falsos sobre mí ayer?",
            "baseline": {},
            "memoryMessages": [],
        })
        dialogue = result["intent"]["interpretation"]["dialogue"]
        self.assertEqual(result["intent"]["topic"]["id"], "penal_honor")
        self.assertEqual(dialogue["speechAct"], "question")
        self.assertEqual(dialogue["responsePlan"]["maxQuestions"], 0)

    def test_replacement_words_do_not_invent_prior_context(self):
        result = analyze({
            "query": "Me refiero a un caso de difamación",
            "baseline": {},
            "memoryMessages": [],
        })
        dialogue = result["intent"]["interpretation"]["dialogue"]
        self.assertEqual(dialogue["speechAct"], "case_start")
        self.assertEqual(dialogue["memoryPolicy"], "new")
        self.assertFalse(dialogue["supersedesPriorInterpretation"])

    def test_python_recognizes_supported_normative_sources(self):
        cases = (
            ("quiero saber que dice el articulo 8 de la constitucion politica del peru", "constitucion"),
            ("dime el articulo 106 del codigo penal", "codigo_penal"),
            ("explicame el articulo 18 del codigo civil", "codigo_civil"),
        )
        for query, expected_source in cases:
            with self.subTest(query=query):
                result = analyze({
                    "query": query,
                    "baseline": {},
                    "memoryMessages": [
                        {"role": "assistant", "content": "¿Cuándo ocurrió el hecho principal?"}
                    ],
                })
                intent = result["intent"]
                dialogue = intent["interpretation"]["dialogue"]
                source = intent["interpretation"]["normativeSource"]
                self.assertEqual(intent["conversationMode"]["id"], "norm_request")
                self.assertTrue(intent["conversationMode"]["deterministic"])
                self.assertEqual(source["id"], expected_source)
                self.assertEqual(source["origin"], "current")
                self.assertEqual(dialogue["speechAct"], "question")
                self.assertFalse(dialogue["answeredPreviousQuestion"])
                self.assertEqual(dialogue["responsePlan"]["maxQuestions"], 0)

    def test_python_uses_normative_memory_only_when_current_turn_omits_source(self):
        result = analyze({
            "query": "y que dice el articulo 19",
            "baseline": {},
            "memoryMessages": [
                {"role": "user", "content": "Estoy revisando la Constitución Política del Perú."},
                {"role": "assistant", "content": "¿Qué artículo necesitas?"}
            ],
        })
        source = result["intent"]["interpretation"]["normativeSource"]
        self.assertEqual(source["id"], "constitucion")
        self.assertEqual(source["origin"], "memory")
        self.assertEqual(source["requestedArticle"], "19")

    def test_current_normative_source_replaces_conflicting_memory(self):
        result = analyze({
            "query": "ahora dime el articulo 106 del codigo penal",
            "baseline": {},
            "memoryMessages": [
                {"role": "user", "content": "Estábamos revisando el Código Civil."},
                {"role": "assistant", "content": "¿Qué artículo civil necesitas?"}
            ],
        })
        interpretation = result["intent"]["interpretation"]
        self.assertEqual(interpretation["normativeSource"]["id"], "codigo_penal")
        self.assertTrue(interpretation["normativeSource"]["currentOverridesMemory"])
        self.assertTrue(interpretation["ignoredMemory"])
        self.assertEqual(interpretation["dialogue"]["memoryPolicy"], "replace")

    def test_code_definition_is_not_treated_as_article_or_source_request(self):
        result = analyze({
            "query": "estoy consultando sobre que es el codigo penal",
            "baseline": {},
            "memoryMessages": [],
        })
        intent = result["intent"]
        source = intent["interpretation"]["normativeSource"]
        self.assertEqual(source["id"], "codigo_penal")
        self.assertEqual(source["requestKind"], "definition")
        self.assertEqual(intent["conversationMode"]["id"], "definition_request")
        self.assertFalse(intent["conversationMode"]["deterministic"])
        self.assertEqual(intent["objective"]["id"], "comprender_norma")
        self.assertFalse(intent["interpretation"]["dialogue"]["responsePlan"]["includeSources"])


if __name__ == "__main__":
    unittest.main()
