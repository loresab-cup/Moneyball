import os
import subprocess
import sys
import time
import urllib.request

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
logs = os.path.join(root, "logs")
os.makedirs(logs, exist_ok=True)

procs = []
be_log = open(os.path.join(logs, "backend.log"), "w")
procs.append(
    subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8000"],
        cwd=os.path.join(root, "backend"),
        creationflags=0x10,
        stdout=be_log,
        stderr=subprocess.STDOUT,
    )
)
fe_log = open(os.path.join(logs, "frontend.log"), "w")
procs.append(
    subprocess.Popen(
        ["node", "node_modules/vite/bin/vite.js", "--port", "5173"],
        cwd=os.path.join(root, "frontend"),
        creationflags=0x10,
        stdout=fe_log,
        stderr=subprocess.STDOUT,
    )
)

ok_be = ok_fe = False
for i in range(25):
    time.sleep(1)
    try:
        urllib.request.urlopen("http://localhost:8000/api/health", timeout=2)
        ok_be = True
    except Exception:
        pass
    try:
        urllib.request.urlopen("http://localhost:5173/", timeout=2)
        ok_fe = True
    except Exception:
        pass
    if ok_be and ok_fe:
        break

print("backend:", "UP http://localhost:8000" if ok_be else "DOWN (см. logs/backend.log)")
print("frontend:", "UP http://localhost:5173" if ok_fe else "DOWN (см. logs/frontend.log)")
if not (ok_be and ok_fe):
    for f in ("backend.log", "frontend.log"):
        p = os.path.join(logs, f)
        if os.path.exists(p):
            print(f"--- {f} ---")
            print(open(p).read()[-1500:])
