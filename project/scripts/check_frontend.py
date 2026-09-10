import json
import os
import subprocess
import sys
import time
import urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = subprocess.Popen(
    ["node", "node_modules/vite/bin/vite.js", "--port", "5173"],
    cwd=os.path.join(root, "frontend"),
    creationflags=0x10,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.STDOUT,
)
try:
    for i in range(20):
        time.sleep(1)
        try:
            html = urllib.request.urlopen("http://localhost:5173/").read().decode()
            via = json.load(urllib.request.urlopen("http://localhost:5173/api/health"))
            print("vite OK | root div:", 'id="root"' in html, "| proxy ->", via)
            break
        except Exception as e:
            if i == 19:
                print("FAIL", e)
                sys.exit(1)
finally:
    p.terminate()
