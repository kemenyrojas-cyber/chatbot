# Issues import helper

Estos archivos bajo `.github/ISSUES/` representan issues sugeridos basados en `ROADMAP_LEXIA.md`.

Para crear issues en GitHub desde la CLI (`gh`) ejecuta, por ejemplo:

```bash
gh issue create --title "Phase 1 — Piloto: Definir alcance" --body "$(sed -n '1,200p .github/ISSUES/phase-1-pilot.md)" --label roadmap --label "phase:1"
```

Repite el comando cambiando el archivo y los labels según corresponda.
