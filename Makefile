RPC ?= http://127.0.0.1:8545
BLOCK ?= 50614000

.PHONY: test
test:                       ## engine suite only
	@cd engine && python3 -c "import unittest;\
r=unittest.TextTestRunner(stream=open('/dev/null','w')).run(unittest.defaultTestLoader.discover('tests','test*.py','.'));\
print(f'engine     {r.testsRun - len(r.failures) - len(r.errors)}/{r.testsRun}')"

.PHONY: test-all
test-all:                   ## every suite, one citable line at the end
	@bash scripts/test-all.sh

.PHONY: readme
readme:                     ## regenerate the README table from the published dataset
	@PYTHONPATH=engine python3 -m tare.dataset.stats --write-readme
	@cd engine && python3 -m unittest tests.test_readme 2>&1 | tail -3

.PHONY: up down
up:                         ## start the fork, db and queue
	docker compose up -d
down:
	docker compose down

.PHONY: rag-serve
rag-serve:                  ## the vector RAG behind HTTP — the chat needs it to cite documents
	@echo "Sans ce serveur, /assistant/ask repond quand meme, mais sans les passages :"
	@echo "son journal porte alors « RAG indisponible » et il se rabat sur les regles."
	cd engine && python3 -m tare.rag.serve --port $${RAG_PORT:-8789}

.PHONY: gate-a3
gate-a3:                    ## reproduce the five known bps for hook 0x1aea38f0 — cannot be faked
	@cd engine && python3 -m tare.gates.a3 --rpc $(RPC) --block $(BLOCK)

.PHONY: measure
measure:                    ## make measure HOOK=0x... [BLOCK=...] — tous les pools d'un hook
	@cd engine && python3 -m tare.cli measure --hook $(HOOK) --rpc $(RPC) --block $(BLOCK)

.PHONY: replay
replay:                     ## make replay POOL=0x... SIZE=... DIR=0>1 — UNE mesure, ~7 s
	@cd engine && python3 -m tare.cli replay --pool $(POOL) --size $(SIZE) \
		--direction "$(DIR)" --rpc $(RPC)
