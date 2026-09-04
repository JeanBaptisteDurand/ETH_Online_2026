RPC ?= http://127.0.0.1:8545
BLOCK ?= 50614000

.PHONY: test
test:                       ## run the suite and print one citable line
	@cd engine && python3 -m unittest discover -s tests -t . 2>&1 | tail -3
	@cd engine && python3 -c "import unittest,sys;\
r=unittest.TextTestRunner(stream=open('/dev/null','w')).run(unittest.defaultTestLoader.discover('tests','test*.py','.'));\
print(f'{r.testsRun - len(r.failures) - len(r.errors)}/{r.testsRun} tests green')"

.PHONY: up down
up:                         ## start the fork, db and queue
	docker compose up -d
down:
	docker compose down

.PHONY: gate-a3
gate-a3:                    ## reproduce the five known bps for hook 0x1aea38f0 — cannot be faked
	@cd engine && python3 -m tare.gates.a3 --rpc $(RPC) --block $(BLOCK)

.PHONY: measure
measure:                    ## make measure HOOK=0x... [BLOCK=...]
	@cd engine && python3 -m tare.cli measure --hook $(HOOK) --rpc $(RPC) --block $(BLOCK)
