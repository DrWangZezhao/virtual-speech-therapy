"""Copy the original head renderer and its transitive source dependencies."""
from pathlib import Path
import re
import shutil
import sys

upstream, wasm = map(Path, sys.argv[1:])
source = upstream.resolve() / 'src'
root = Path(__file__).resolve().parents[1] / 'src' / 'chimera'
modules = [source / entry for entry in ('wasm/chimera.ts', 'wasm/engine.ts', 'ui/analysis.ts', 'ui/render/anatomy3d.ts')]
visited = set()
while modules:
    path = modules.pop().resolve()
    if path in visited:
        continue
    visited.add(path)
    destination = root / path.relative_to(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if path.name == 'chimera.wasm':
        shutil.copyfile(wasm, destination)
        continue
    shutil.copyfile(path, destination)
    for match in re.finditer(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'](\.[^"']+)["']''', path.read_text()):
        dependency = path.parent / match.group(1).split('?')[0]
        if dependency.is_file() or dependency.name == 'chimera.wasm':
            modules.append(dependency)
shutil.copyfile(upstream / 'LICENSE', root / 'LICENSE.txt')
print(f'Copied {len(visited)} pinned CHIMERA files')
