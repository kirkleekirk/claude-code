#!/usr/bin/env python3
# Tweak card numbers in src/engine.js: tune.py b_cooldog atk=3 def=5 cost=1 n=2
import re, sys
p = '/home/user/claude-code/glowboard-dev/src/engine.js'
s = open(p).read()
args = sys.argv[1:]
i = 0
while i < len(args):
    cid = args[i]; i += 1
    changes = {}
    while i < len(args) and '=' in args[i]:
        k, v = args[i].split('=', 1); changes[k] = v; i += 1
    m = re.search(r"def\(\{ id: '" + re.escape(cid) + r"'.*?\}\);\n", s, re.S)
    if not m: raise SystemExit('no card ' + cid)
    block = m.group(0)
    nb = block
    for k, v in changes.items():
        if k in ('atk', 'def', 'cost', 'req'):
            if re.search(r"\b" + k + r": -?\d+", nb.split('ab:')[0].split('kw:')[0]):
                head, sep, tail = nb.partition('ab:') if 'ab:' in nb else (nb, '', '')
                head = re.sub(r"\b" + k + r": -?\d+", k + ': ' + v, head, count=1)
                nb = head + sep + tail
            else:
                nb = nb.replace("type: '", k + ': ' + v + ", type: '", 1) if False else re.sub(r"(cost: -?\d+)", r"\1, " + k + ': ' + v, nb, count=1)
        elif k == 'n':
            nb = re.sub(r"\bn: \d+", 'n: ' + v, nb, count=1)
        elif k == 'text':
            nb = re.sub(r"text: '(?:[^'\\]|\\.)*'", "text: '" + v.replace("'", "\\'") + "'", nb, count=1)
        else:
            raise SystemExit('unknown key ' + k)
    s = s.replace(block, nb)
    print(cid, changes)
open(p, 'w').write(s)
