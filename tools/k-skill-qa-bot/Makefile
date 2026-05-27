.PHONY: help lint test test-bats test-pytest clean

help:
	@echo "Targets: lint test test-bats test-pytest clean"

lint:
	@shellcheck -e SC1091,SC2016,SC2012 bin/*.sh bin/lib/*.sh install.sh uninstall.sh 2>&1 || echo "(shellcheck warnings above)"
	@python3 -m py_compile bin/*.py bin/lib/*.py 2>&1

test-bats:
	@command -v bats >/dev/null || { echo "bats-core required (brew install bats-core)"; exit 1; }
	@if ls test/bats/*.bats >/dev/null 2>&1; then bats test/bats/; else echo "(no bats tests yet)"; fi

test-pytest:
	@command -v pytest >/dev/null || { echo "pytest required (pip install pytest)"; exit 1; }
	@if ls test/pytest/test_*.py >/dev/null 2>&1; then pytest test/pytest/ -v; ec=$$?; [ $$ec -eq 5 ] && echo "(no pytest tests collected)" || exit $$ec; else echo "(no pytest tests yet)"; fi

test: test-bats test-pytest

clean:
	@rm -rf test/pytest/__pycache__ test/pytest/.pytest_cache
