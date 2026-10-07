"""Captures d'écran du README (screenshots/), toujours au même format, avec des données de démo.

Lance le vrai serveur sur un dossier de données temporaire (compte « demo », quelques sommets
faits et envies), ouvre le site dans Chromium et enregistre des WebP compressés (1200 px de large).
Les tuiles de carte viennent d'Internet (OSM, IGN) : il faut du réseau.

    .venv/bin/python scripts/screenshots.py
"""
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"
PORT = 18900
BASE = f"http://localhost:{PORT}"
USER, PASSWORD = "demo", "demo-mot-de-passe"
WIDTH = 1200  # largeur finale des captures d'ordinateur
DESKTOP = {"width": 1440, "height": 900}
PHONE = {"width": 390, "height": 844}

# Progression de démo : sommets faits (avec ou sans date) et envies.
DONE = {
    "ouille-noire": "2025-08-11", "mont-thabor": "2025-07-19", "pointe-de-l-observatoire": "2025-08-02",
    "pic-de-caramantran": "2024-07-28", "vieux-chaillol": "2024-09-14", "grand-glaiza-punta-merciantaira": None,
    "pic-du-mas-de-la-grave": "2025-09-06", "petit-vignemale": "2024-08-21", "pic-de-campbieil": None,
}
WISHES = ["aiguille-de-la-grande-sassiere", "mont-pelat", "pica-d-estats"]


def seed(data_dir):
    sys.path.insert(0, str(ROOT))
    os.environ["DATA_DIR"] = str(data_dir)
    from server import storage  # noqa: E402 — DATA_DIR doit être fixé avant l'import
    storage.users_store().create(USER, PASSWORD, "member")
    progress = {pid: {"done": True, **({"done_date": date} if date else {})} for pid, date in DONE.items()}
    progress.update({pid: {"wish": True} for pid in WISHES})
    user_dir = Path(data_dir) / "users" / USER
    user_dir.mkdir(parents=True, exist_ok=True)
    (user_dir / "progress.json").write_text(json.dumps(progress), encoding="utf-8")


def save(page, name, width=WIDTH):
    """Capture compressée : WebP, redimensionnée à `width` px de large."""
    image = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    path = OUT / f"{name}.webp"
    image.save(path, "WEBP", quality=72, method=6)
    print(f"{path.relative_to(ROOT)} : {image.width}×{image.height}, {path.stat().st_size // 1024} Ko")
    return image


def settle(page, ms=2500):
    """Laisse le temps aux tuiles et aux vignettes de se charger (puis aux tuiles en retard)."""
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(ms)
    page.wait_for_load_state("networkidle")


def login(page):
    page.goto(f"{BASE}/login")
    page.fill("#login-username", USER)
    page.fill("#login-password", PASSWORD)
    page.click("#login-submit")
    page.wait_for_selector(".peak-item", state="attached")


def set_view(page, lat, lon, zoom, map_var="map"):
    """Centre une carte Leaflet (main.js n'expose rien : on passe par le module map.js)."""
    page.evaluate("""async ([lat, lon, zoom]) => {
      const { map, visibleCenter } = await import(document.querySelector('script[type=module]').src.replace(/main\\.js.*$/, 'map.js'));
      map.setView(visibleCenter([lat, lon], zoom), zoom, { animate: false });
    }""", [lat, lon, zoom])


def phone_triptych(shots):
    """Trois écrans de téléphone côte à côte, sur fond clair, coins arrondis."""
    gap, pad, radius = 36, 36, 28
    w, h = shots[0].size
    canvas = Image.new("RGB", (pad * 2 + w * 3 + gap * 2, pad * 2 + h), (236, 240, 236))
    mask = Image.new("L", (w, h), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=255)
    for i, shot in enumerate(shots):
        canvas.paste(shot, (pad + i * (w + gap), pad), mask)
    return canvas


def main():
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as data_dir:
        seed(data_dir)
        env = dict(os.environ, DATA_DIR=data_dir, PORT=str(PORT))
        server = subprocess.Popen([sys.executable, str(ROOT / "server" / "app.py")], env=env,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try:
                    urllib.request.urlopen(f"{BASE}/healthz")
                    break
                except OSError:
                    time.sleep(0.1)
            with sync_playwright() as pw:
                browser = pw.chromium.launch()
                desktop(browser)
                phone(browser)
                browser.close()
        finally:
            server.terminate()


def desktop(browser):
    page = browser.new_page(viewport=DESKTOP)
    login(page)
    # 1. Vue générale : Alpes du Sud, liste à gauche.
    set_view(page, 44.95, 6.6, 8)
    settle(page)
    save(page, "01-vue-generale")
    # 2. Fiche d'un sommet sur le Plan IGN.
    page.locator(".peak-item", has_text="Ouille Noire").first.click()
    settle(page, 3000)
    save(page, "02-fiche-sommet")
    page.click("#peak-panel-close")
    # 3. Vue ski : pentes > 30°, fiche avec le bloc itinéraire.
    page.click("#ski-view-open")
    page.locator("#ski-peaks-list .summit-map-warning-ok").click()
    page.locator("#ski-peaks-list .peak-item", has_text="Mont Thabor").click()
    settle(page, 3000)
    save(page, "03-vue-ski")
    page.click("#mountain-view-open")
    # 4. Mes 3000 : progression, dernières ascensions.
    set_view(page, 44.8, 4.0, 6)
    page.click("#mine-open")
    page.locator("#mine-view details[data-key=done] summary").click()
    settle(page)
    save(page, "04-mes-3000")
    page.close()


def phone(browser):
    context = browser.new_context(viewport=PHONE, is_mobile=True, has_touch=True, device_scale_factor=2)
    page = context.new_page()
    login(page)
    set_view(page, 44.9, 6.5, 8)
    settle(page)
    shots = [Image.open(io.BytesIO(page.screenshot())).convert("RGB")]
    page.tap("#tab-list")
    settle(page, 1500)
    shots.append(Image.open(io.BytesIO(page.screenshot())).convert("RGB"))
    page.locator(".peak-item", has_text="Mont Thabor").first.tap()
    settle(page, 3000)
    shots.append(Image.open(io.BytesIO(page.screenshot())).convert("RGB"))
    image = phone_triptych(shots)
    image = image.resize((WIDTH, round(image.height * WIDTH / image.width)), Image.LANCZOS)
    path = OUT / "05-mobile.webp"
    image.save(path, "WEBP", quality=76, method=6)
    print(f"{path.relative_to(ROOT)} : {image.width}×{image.height}, {path.stat().st_size // 1024} Ko")
    context.close()


if __name__ == "__main__":
    main()
