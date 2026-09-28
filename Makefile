.PHONY: test pull

test:
	@osascript -l JavaScript tests/run.js

# Recopie les info.plist (et icônes) des workflows installés dans Alfred vers
# workflows/<nom>/ pour git. Sens unique : Alfred est la source.
pull:
	@tools/pull.py
