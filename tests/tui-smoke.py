#!/usr/bin/env python3
"""Live Pi terminal smoke test under a real PTY, no credentials or LLM calls."""
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios
import time

BIN = os.path.abspath("node_modules/.bin/pi")
OUTPUT = bytearray()

def fail(message):
    excerpt = OUTPUT.decode("utf-8", "replace")[-5000:]
    raise AssertionError(f"{message}\n--- PTY output tail ---\n{excerpt}")

pid, fd = pty.fork()
if pid == 0:
    os.environ["TERM"] = "xterm-256color"
    os.environ["CI"] = "1"
    # Redirect Pi user settings to isolated temp directory.
    os.execv(BIN, [BIN, "-e", ".", "--use-theme", "pi-style-forest"])

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 100, 0, 0))

def read_until(needle: str, seconds=20):
    end = time.monotonic() + seconds
    term = needle.encode("utf-8")
    while time.monotonic() < end:
        if term in OUTPUT:
            return
        ready, _, _ = select.select([fd], [], [], 0.25)
        if ready:
            try:
                data = os.read(fd, 65536)
                if not data:
                    break
                OUTPUT.extend(data)
            except OSError as exc:
                if exc.errno != errno.EIO:
                    raise
                break
    fail(f"missing terminal text {needle!r}")

def type_command(cmd):
    os.write(fd, cmd.encode("utf-8") + b"\r")

try:
    read_until("Border Collie", 25)
    read_until("CTX --%", 10)
    type_command("/pi-tui")
    read_until("USAGE / OVERVIEW", 15)
    read_until("MODEL / PROVIDER", 10)
    os.write(fd, b"q")
    time.sleep(0.2)
    reload_mark = len(OUTPUT)
    type_command("/reload")
    read_until("Reloaded keybindings", 35)
    if b"pi-style theme unavailable" in OUTPUT[reload_mark:]:
        fail("reload displayed a spurious unavailable-theme warning")
    time.sleep(0.35)
    type_command("/pi-style off")
    read_until("pi-style: off", 15)
    type_command("/pi-style cute")
    read_until("pi-style: cute", 15)
    print("TUI PTY smoke passed: Border Collie, dashboard, reload, off/on.", flush=True)
finally:
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass
    os.close(fd)
