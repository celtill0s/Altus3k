"""Tests du frontend (static/) dans un vrai navigateur (Chromium, via Playwright) : le vrai site,
servi par le vrai serveur, avec des données dans un dossier temporaire.

Ignorés si Playwright ou Chromium ne sont pas installés :
    pip install -r requirements-dev.txt && python -m playwright install chromium
"""
import datetime
import json
import re
import threading
from http.server import ThreadingHTTPServer

import pytest

from server import app as server_app
from server import auth, storage

sync_api = pytest.importorskip("playwright.sync_api")
expect = sync_api.expect

PASSWORD = "motdepasse-1234"
CATALOG = json.loads((storage.STATIC_DIR / "mountains.json").read_text(encoding="utf-8"))
TILES = re.compile(r"^https://(tile\.openstreetmap\.org|data\.geopf\.fr)/")


@pytest.fixture
def site(tmp_path, monkeypatch):
    """Serveur sur le vrai static/, données dans tmp_path ; alice (admin), bob (membre), gus (invité)."""
    monkeypatch.setattr(storage, "DATA_DIR", tmp_path)
    monkeypatch.setattr(server_app, "throttle", auth.LoginThrottle())
    store = storage.users_store()
    store.create("alice", PASSWORD, "admin")
    store.create("bob", PASSWORD, "member")
    store.create("gus", PASSWORD, "guest")
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server_app.Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    # « localhost » : Chromium y accepte les cookies « Secure » sans HTTPS.
    yield f"http://localhost:{httpd.server_address[1]}"
    httpd.shutdown()
    httpd.server_close()
    thread.join(timeout=5)


@pytest.fixture(scope="module")
def browser():
    with sync_api.sync_playwright() as pw:
        try:
            b = pw.chromium.launch()
        except sync_api.Error as e:
            pytest.skip(f"Chromium absent ({e.message.splitlines()[0]}) : python -m playwright install chromium")
        yield b
        b.close()


@pytest.fixture
def open_page(browser, site):
    """open_page(utilisateur, chemin) : page connectée ; toute erreur JavaScript fait échouer le test."""
    contexts, errors = [], []

    def _open(username, path="/"):
        ctx = browser.new_context(viewport={"width": 1280, "height": 800}, service_workers="block")
        ctx.route(TILES, lambda route: route.abort())  # pas de réseau externe pendant les tests
        contexts.append(ctx)
        page = ctx.new_page()
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.goto(f"{site}/login")
        page.fill("#login-form input:not([type=password])", username)
        page.fill("#login-form input[type=password]", PASSWORD)
        page.click("#login-form button[type=submit]")
        page.wait_for_url(f"{site}/")
        if path != "/":
            page.goto(site + path)
        page.wait_for_selector(".peak-item")
        return page

    yield _open
    for ctx in contexts:
        ctx.close()
    assert not errors, f"erreurs JavaScript : {errors}"


def progress_of(username):
    path = storage.user_dir(username) / "progress.json"
    return json.loads(path.read_text()) if path.exists() else {}


def open_peak(page, name):
    page.locator(".peak-item", has_text=name).first.click()
    expect(page.locator("#peak-panel-body h3")).to_contain_text(name)


def fill_peak_form(page, **fields):
    for field, value in fields.items():
        selector = f"#cp-{field}"
        if field in ("difficulty", "region"):
            page.select_option(selector, value)
        else:
            page.fill(selector, str(value))
    page.click("#custom-peak-form button[type=submit]")


# ---------------------------------------------------------------------------

def test_member_sees_whole_catalog(open_page):
    page = open_page("bob")
    expect(page.locator(".peak-item")).to_have_count(len(CATALOG))
    expect(page.locator("#count")).to_contain_text(f"{len(CATALOG)} sommets affichés")
    expect(page.locator("#custom-peak-open")).to_be_visible()


def test_guest_has_no_personal_controls(open_page):
    page = open_page("gus")
    expect(page.locator(".peak-item")).to_have_count(len(CATALOG))
    expect(page.locator("#custom-peak-open")).to_be_hidden()
    page.click("#settings-open")
    expect(page.locator("#region-chips")).to_be_visible()
    expect(page.locator("#status-chips")).to_be_hidden()  # pas d'espace personnel : pas de statut
    page.click("#settings-close")
    open_peak(page, CATALOG[0]["name"])
    expect(page.locator("#peak-panel .pop-comment-row")).to_be_hidden()


def test_search_filters_list(open_page):
    page = open_page("bob")
    target = CATALOG[0]["name"]
    page.fill("#search", target)
    expect(page.locator(".peak-item .name")).to_have_text([target])


def test_done_and_comment_are_saved(open_page):
    page = open_page("bob")
    peak = CATALOG[0]
    open_peak(page, peak["name"])
    page.check("#peak-panel .pop-done-checkbox")
    page.fill("#peak-panel .pop-comment-input", "  Belle course  ")
    page.locator("#peak-panel .pop-comment-input").blur()
    expect(page.locator("#peak-panel .pop-comment-status")).to_have_text("Enregistré sur le serveur.")
    today = datetime.date.today().isoformat()  # cocher « fait » enregistre la date du jour
    assert progress_of("bob")[peak["id"]] == {"done": True, "done_date": today, "comment": "Belle course"}

    page.reload()
    page.wait_for_selector(".peak-item")
    expect(page.locator("#count")).to_contain_text("1 fait au total")
    page.click("#settings-open")  # filtres dans le panneau ⚙
    page.locator("#status-chips .chip", has_text="Fait").click()
    page.click("#settings-close")
    expect(page.locator(".peak-item .name")).to_have_text([peak["name"]])
    open_peak(page, peak["name"])
    expect(page.locator("#peak-panel .pop-done-checkbox")).to_be_checked()
    expect(page.locator("#peak-panel .pop-comment-input")).to_have_value("Belle course")
    # Hauteur mesurée panneau visible (sinon zone écrasée à 0 px à la première ouverture).
    assert page.locator("#peak-panel .pop-comment-input").bounding_box()["height"] > 20


def test_add_edit_and_delete_custom_peak(open_page):
    page = open_page("bob")
    page.click("#custom-peak-open")
    fill_peak_form(page, name="Pointe du Test", altitude="3111", difficulty="T4", massif="Écrins",
                   lat="45.1", lon="6.3", notes="Par l'arête.", links="https://example.org/topo")
    expect(page.locator("#placement-bar")).to_be_visible()
    expect(page.locator(".placing-arrow")).to_have_count(4)
    page.click("#placement-confirm")
    expect(page.locator("#placement-bar")).to_be_hidden()
    expect(page.locator("#peak-panel-body h3")).to_contain_text("Pointe du Test")
    expect(page.locator("#peak-panel .pop-links a")).to_have_attribute("href", "https://example.org/topo")
    expect(page.locator(".peak-item")).to_have_count(len(CATALOG) + 1)
    [custom] = storage.load_custom_peaks("bob")
    assert (custom["lat"], custom["lon"], custom["difficulty"]) == (45.1, 6.3, "T4")

    # Modification : formulaire prérempli, même id à la fin.
    page.click("#peak-panel .pop-custom-edit")
    expect(page.locator("#custom-peak-title")).to_have_text("Modifier le sommet")
    expect(page.locator("#cp-name")).to_have_value("Pointe du Test")
    expect(page.locator("#cp-links")).to_have_value("https://example.org/topo")
    fill_peak_form(page, name="Pointe Renommée", altitude="3222")
    page.click("#placement-confirm")
    expect(page.locator("#peak-panel-body h3")).to_contain_text("Pointe Renommée")
    expect(page.locator(".peak-item", has_text="Pointe Renommée")).to_contain_text("3222 m")
    expect(page.locator(".peak-item", has_text="Pointe du Test")).to_have_count(0)
    [edited] = storage.load_custom_peaks("bob")
    assert edited["id"] == custom["id"] and edited["name"] == "Pointe Renommée"

    page.reload()
    page.wait_for_selector(".peak-item")
    open_peak(page, "Pointe Renommée")
    page.once("dialog", lambda d: d.accept())
    page.click("#peak-panel .pop-custom-delete")
    expect(page.locator("#peak-panel")).to_be_hidden()
    expect(page.locator(".peak-item")).to_have_count(len(CATALOG))
    assert storage.load_custom_peaks("bob") == []


def test_custom_peak_form_checks(open_page):
    page = open_page("bob")
    page.click("#custom-peak-open")
    fill_peak_form(page, name="Sommet X", altitude="3000", lat="45.2")
    expect(page.locator("#cp-status")).to_contain_text("latitude ET la longitude")
    fill_peak_form(page, lat="", name=CATALOG[0]["name"].upper())
    expect(page.locator("#cp-status")).to_have_text("Un sommet porte déjà ce nom.")
    fill_peak_form(page, name="Sommet X", links="ftp://exemple")
    expect(page.locator("#cp-status")).to_contain_text("Lien invalide")
    page.click("#cp-cancel")
    expect(page.locator("#custom-peak-dialog")).to_be_hidden()
    assert storage.load_custom_peaks("bob") == []


@pytest.mark.parametrize("activity,width", [("crampon", 1280), ("ski", 1280), ("snowshoe", 1280), ("snowshoe", 390)])
def test_add_peak_in_active_category(open_page, activity, width, tmp_path):
    page = open_page("bob")
    page.set_viewport_size({"width": width, "height": 844})
    page.click(f"#{activity}-view-open")
    page.click("#custom-peak-open")
    expect(page.locator("#cp-activity-grade-field")).to_be_visible()
    page.fill("#cp-activity-grade", "Test grade")
    fill_peak_form(page, name="Pointe Activite", altitude="3111", lat="45.1", lon="6.3",
                   notes="Itineraire personnel", links="https://example.org/topo")
    expect(page.locator(f"#{activity}-view #placement-bar")).to_be_visible()
    expect(page.locator(f"#{activity}-map .placing-arrow")).to_have_count(4)
    page.screenshot(path=str(tmp_path / f"placement-{activity}-{width}.png"))
    page.click("#placement-confirm")
    expect(page.locator("#placement-bar")).to_be_hidden()
    item = page.locator(f"#{activity}-peaks-list .peak-item").filter(has_text="Pointe Activite")
    expect(item).to_contain_text("Test grade")
    expect(page.locator(f"#{activity}-map #peak-panel-body")).to_contain_text("Itineraire personnel")
    page.screenshot(path=str(tmp_path / f"added-{activity}-{width}.png"))
    expect(page.locator("#list .peak-item")).to_have_count(len(CATALOG))
    [custom] = storage.load_custom_peaks("bob")
    assert custom["activity"] == activity and custom["activity_grade"] == "Test grade"
    assert (custom["lat"], custom["lon"]) == (45.1, 6.3)
    if width <= 760:
        page.click("#tab-list")
    item.locator(".done-check").check()
    expect(item).to_have_class(re.compile("is-done"))
    page.reload()
    page.wait_for_selector("#list .peak-item", state="attached")
    expect(page.locator("#list .peak-item")).to_have_count(len(CATALOG))
    page.click(f"#{activity}-view-open")
    expect(item.locator(".done-check")).to_be_checked()
    page.click("#mountain-view-open")
    expect(page.locator("#list .peak-item").filter(has_text="Pointe Activite")).to_have_count(0)
    for other in {"crampon", "ski", "snowshoe"} - {activity}:
        page.click(f"#{other}-view-open")
        expect(page.locator(f"#{other}-peaks-list .peak-item").filter(has_text="Pointe Activite")).to_have_count(0)


def test_storage_banner_when_space_is_full(open_page, monkeypatch):
    page = open_page("bob")
    expect(page.locator("#storage-banner")).to_be_hidden()

    # Envoi refusé faute de place : bandeau rouge, qui reste affiché.
    monkeypatch.setattr(storage, "QUOTA_BYTES", 1000)
    open_peak(page, CATALOG[0]["name"])
    page.set_input_files("#peak-panel .photos-file-input",
                         files=[{"name": "grande.jpg", "mimeType": "image/jpeg", "buffer": b"x" * 2000}])
    expect(page.locator("#peak-panel .photos-status")).to_contain_text("espace de stockage plein")
    banner = page.locator("#storage-banner")
    expect(banner).to_be_visible()
    expect(banner).to_contain_text("Espace plein")
    page.click("#peak-panel-close")
    expect(banner).to_be_visible()

    # Espace déjà plein au chargement de la page.
    (storage.user_dir("bob") / "photos").mkdir(parents=True, exist_ok=True)
    (storage.user_dir("bob") / "photos" / "occupe.bin").write_bytes(b"x" * 1000)
    page.reload()
    page.wait_for_selector(".peak-item")
    expect(banner).to_contain_text("Espace plein")


def test_admin_views_other_space_read_only(open_page):
    storage.save_progress("bob", {CATALOG[0]["id"]: {"done": True, "comment": "note de bob"}})
    page = open_page("alice", "/?space=bob")
    expect(page.locator("#space-banner")).to_contain_text("bob")
    expect(page.locator("#custom-peak-open")).to_be_hidden()
    expect(page.locator("#storage-banner")).to_be_hidden()
    open_peak(page, CATALOG[0]["name"])
    expect(page.locator("#peak-panel .pop-done-checkbox")).to_be_disabled()
    expect(page.locator("#peak-panel .pop-comment-input")).to_have_value("note de bob")


def test_settings_panel_and_map_controls(open_page):
    page = open_page("bob")
    panel = page.locator("#settings-panel")
    expect(panel).to_be_hidden()
    page.click("#settings-open")
    expect(panel).to_be_visible()
    expect(page.locator("#account-name")).to_contain_text("bob")
    for chips in ("#region-chips", "#diff-chips", "#status-chips"):
        expect(page.locator(f"{chips} .chip").first).to_be_visible()
    expect(page.locator("#base-layer-options input")).to_have_count(4)
    # Filtre de difficulté : décocher T2 retire ses sommets de la liste.
    t2 = sum(1 for p in CATALOG if p["difficulty"] == "T2")
    page.locator("#diff-chips .chip", has_text="T2").click()
    expect(page.locator(".peak-item")).to_have_count(len(CATALOG) - t2)
    # Fond de carte : mémorisé d'un chargement à l'autre.
    page.locator("#base-layer-options label", has_text="OpenStreetMap").click()
    page.keyboard.press("Escape")
    expect(panel).to_be_hidden()
    page.reload()
    page.wait_for_selector(".peak-item")
    page.click("#settings-open")
    expect(page.locator("#base-layer-options label", has_text="OpenStreetMap").locator("input")).to_be_checked()


def test_legend_collapsed_by_default(open_page):
    page = open_page("bob")
    toggle = page.locator("#legend .legend-toggle")
    expect(toggle).to_contain_text("Cotation randonnée")
    expect(page.locator("#legend .legend-body")).to_be_hidden()
    toggle.click()
    expect(page.locator("#legend .legend-body")).to_be_visible()
    expect(page.locator("#legend .legend-body")).to_contain_text("T4")


def test_toolbar_and_eye_button(open_page):
    page = open_page("bob")
    for btn in ("#mountain-view-open", "#custom-peak-open", "#crampon-view-open", "#ski-view-open", "#snowshoe-view-open", "#settings-open"):
        expect(page.locator(f"#map-toolbar {btn}")).to_be_visible()
    expect(page.locator("#map-view-tools button")).to_have_count(4)
    expect(page.locator("#map-action-tools button")).to_have_count(3)
    for button in ("#custom-peak-open", "#mine-open", "#settings-open"):
        expect(page.locator(f"#map-action-tools {button}")).to_be_visible()
    views = page.locator("#map-view-tools").bounding_box()
    actions = page.locator("#map-action-tools").bounding_box()
    assert actions["x"] - (views["x"] + views["width"]) >= 24
    eye = page.locator(".separate-all-control a")
    expect(eye).to_have_attribute("title", "Voir tous les sommets, à leur position réelle")
    eye.click()
    expect(eye).to_have_attribute("title", "Regrouper les sommets par zone")
    eye.click()
    expect(eye).to_have_attribute("title", "Voir tous les sommets, à leur position réelle")


@pytest.mark.parametrize("width", [1280, 390])
def test_activity_navigation_without_banner(open_page, width, tmp_path):
    page = open_page("bob")
    page.set_viewport_size({"width": width, "height": 844})
    expect(page.locator("#mountain-view-open")).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#mountain-view-icon")).to_have_attribute("d", "M2 20 L9 8 L13 14 L16 9 L22 20 Z")
    expect(page.locator(".summit-map-view-header")).to_have_count(0)
    colors = {"crampon": "rgb(198, 106, 22)", "ski": "rgb(8, 127, 163)", "snowshoe": "rgb(91, 95, 199)"}
    for activity in ("crampon", "ski", "snowshoe"):
        page.click(f"#{activity}-view-open")
        expect(page.locator(f"#{activity}-view")).to_be_visible()
        expect(page.locator("#custom-peak-open")).to_be_visible()
        views = page.locator("#map-view-tools").bounding_box()
        actions = page.locator("#map-action-tools").bounding_box()
        assert actions["x"] - (views["x"] + views["width"]) >= 24
        assert actions["x"] + actions["width"] <= width
        page.click("#custom-peak-open")
        expect(page.locator("#custom-peak-dialog")).to_be_visible()
        page.click("#cp-cancel")
        expect(page.locator(f"#{activity}-view-open")).to_have_attribute("aria-pressed", "true")
        expect(page.locator("#map-toolbar .tool-btn.active")).to_have_count(1)
        expect(page.locator(".summit-map-view:not([hidden])")).to_have_count(1)
        assert page.locator(f"#{activity}-map").bounding_box()["y"] == 0
        expect(page.locator(f"#{activity}-view-open")).to_have_css("background-color", colors[activity])
        expect(page.locator("#mountain-view-open")).to_have_css("background-color", "rgb(255, 255, 255)")
        page.screenshot(path=str(tmp_path / f"{activity}-{width}.png"))
    page.click("#mountain-view-open")
    expect(page.locator(".summit-map-view:not([hidden])")).to_have_count(0)
    expect(page.locator("#mountain-view-open")).to_have_attribute("aria-pressed", "true")
    expect(page.locator("#map-toolbar .tool-btn.active")).to_have_count(1)
    page.click("#ski-view-open")
    page.keyboard.press("Escape")
    expect(page.locator("#mountain-view-open")).to_have_attribute("aria-pressed", "true")


@pytest.mark.parametrize("width,height", [(1280, 800), (1366, 768), (1024, 600), (390, 844), (375, 667), (320, 568)])
def test_add_dialog_fully_visible_on_open(open_page, width, height, tmp_path):
    page = open_page("bob")
    page.set_viewport_size({"width": width, "height": height})
    for activity in ("mountain", "crampon", "ski", "snowshoe"):
        page.click(f"#{activity}-view-open")
        page.click("#custom-peak-open")
        expect(page.locator("#custom-peak-dialog")).to_be_visible()
        assert page.locator("#custom-peak-form").evaluate("form => form.scrollHeight <= form.clientHeight")
        for selector in ("#custom-peak-title", "#cp-name", "#cp-altitude", "#cp-difficulty", "#cp-region",
                         "#cp-massif", "#cp-lat", "#cp-lon", "#cp-notes", "#cp-links", "#cp-cancel",
                         "#custom-peak-form button[type=submit]"):
            box = page.locator(selector).bounding_box()
            assert box and box["x"] >= 0 and box["y"] >= 0
            assert box["x"] + box["width"] <= width and box["y"] + box["height"] <= height
        if activity != "mountain":
            expect(page.locator("#cp-activity-grade")).to_be_visible()
        if width <= 760:
            expect(page.locator("#custom-peak-form")).to_be_focused()
        page.screenshot(path=str(tmp_path / f"dialog-{activity}-{width}.png"))
        page.click("#cp-cancel")


def test_ski_and_crampon_map_views(open_page):
    page = open_page("bob")
    view = page.locator("#ski-view")
    expect(view).to_be_hidden()
    page.click("#ski-view-open")
    expect(view).to_be_visible()
    ski_items = page.locator("#ski-peaks-list .peak-item")
    assert ski_items.count() >= 20
    ski_names = set(ski_items.locator(".name").all_text_contents())
    assert "Grand Astazou" not in ski_names
    assert "La Grande Fache" not in ski_names
    expect(ski_items.filter(has_text="Pointe d'Aval")).to_contain_text("3.1–3.2")
    expect(ski_items.filter(has_text="Pointe d'Aval")).not_to_contain_text("5.4")
    expect(ski_items.filter(has_text="Aiguille de la Grande Sassière")).to_contain_text("Ski 5.2")
    expect(page.locator("#ski-peaks-list")).to_contain_text("Ski")
    assert "blur(14px)" in page.locator("#ski-peaks-list").evaluate("element => getComputedStyle(element).backdropFilter")
    assert page.locator("#ski-peaks-list").evaluate("element => getComputedStyle(element).backgroundColor") == "rgba(245, 243, 238, 0.42)"
    expect(ski_items.first.locator(".meta > .badge")).to_have_count(0)  # pas de badge T : seule la cotation ski
    expect(ski_items.first.locator(".activity-grade .badge")).to_be_visible()
    assert page.evaluate("""() => {
      const list = document.getElementById('ski-peaks-list');
      const map = document.getElementById('ski-map');
      return list.getBoundingClientRect().left === map.getBoundingClientRect().left &&
        map.getBoundingClientRect().width > list.getBoundingClientRect().width &&
                getComputedStyle(list).position === 'absolute' &&
                getComputedStyle(map).position === 'absolute' &&
                Number(getComputedStyle(list).zIndex) > 0;
    }""")
    catalog_names = {peak["name"] for peak in CATALOG}
    assert set(ski_items.locator(".name").all_text_contents()) <= catalog_names
    ski_colors = page.locator("#ski-peaks-list .activity-grade .badge").evaluate_all(
        "elements => [...new Set(elements.map(element => getComputedStyle(element).backgroundColor))]"
    )
    assert len(ski_colors) >= 3
    assert {"rgb(46, 139, 87)", "rgb(217, 140, 30)", "rgb(192, 57, 43)"} <= set(ski_colors)
    for _ in range(4):
        page.locator("#ski-map .leaflet-control-zoom-out").click()
    assert page.locator("#ski-map .leaflet-marker-icon svg text").count() > 0
    ski_item = ski_items.first
    ski_name = ski_item.locator(".name").inner_text()
    ski_item.locator(".done-check").check()
    expect(page.locator("#list .peak-item").filter(has_text=ski_name).locator(".done-check")).to_be_checked()
    ski_items.first.click()
    expect(page.locator("#ski-map #peak-panel-body")).to_contain_text("Ouvrir le topo")
    ski_items.filter(has_text="Aiguille de la Grande Sassière").click()
    expect(page.locator("#ski-map #peak-panel-body")).to_contain_text("corde et matériel glacier, n’est pas retenue")
    page.click("#mountain-view-open")
    expect(view).to_be_hidden()
    page.click("#crampon-view-open")
    crampon_view = page.locator("#crampon-view")
    expect(crampon_view).to_be_visible()
    crampon_items = page.locator("#crampon-peaks-list .peak-item")
    expected_crampon_peaks = sum(1 for peak in CATALOG if peak.get("crampon"))
    expect(crampon_items).to_have_count(expected_crampon_peaks)
    assert set(crampon_items.locator(".name").all_text_contents()) <= catalog_names
    crampon_colors = page.locator("#crampon-peaks-list .activity-grade .badge").evaluate_all(
        "elements => [...new Set(elements.map(element => getComputedStyle(element).backgroundColor))]"
    )
    assert len(crampon_colors) >= 2
    assert set(crampon_colors) <= {"rgb(46, 139, 87)", "rgb(217, 140, 30)", "rgb(192, 57, 43)"}
    crampon_item = page.locator("#crampon-peaks-list .peak-item:not(.is-done)").first
    crampon_name = crampon_item.locator(".name").inner_text()
    crampon_item = crampon_items.filter(has_text=crampon_name)
    crampon_item.locator(".done-check").check()
    expect(page.locator("#list .peak-item").filter(has_text=crampon_name).locator(".done-check")).to_be_checked()
    crampon_item.click()
    expect(page.locator("#crampon-map #peak-panel-body")).to_be_visible()
    page.click("#mountain-view-open")
    expect(crampon_view).to_be_hidden()
    page.click("#snowshoe-view-open")
    snowshoe_view = page.locator("#snowshoe-view")
    expect(snowshoe_view).to_be_visible()
    snowshoe_items = page.locator("#snowshoe-peaks-list .peak-item")
    snowshoe_items.filter(has_text="Mont Buet").click()
    page.locator("#snowshoe-map #peak-panel-close").click()
    expect(page.locator("#peak-panel")).to_be_hidden()
    page.locator("#snowshoe-map .leaflet-marker-icon").first.click(force=True)
    expect(page.locator("#snowshoe-map #peak-panel-body")).to_contain_text("Mont Buet")
    snowshoe_sources = {
        "Pic de Caramantran": "https://reservation.lequeyras.com/au-coeur-des-3000-du-queyras-5-jours-de-raquettes.html",
        "Mont Buet": "https://bichettevoyage.com/le-mont-buet-raquettes/",
        "Mont Thabor": "https://www.trekalpes.com/fr/trek-raquettes-rando-neige-cerces-claree-thabor-belvedere-des-alpes.html",
        "Vieux Chaillol": "https://entrepotes.org/sortie/59350",
        "Pic du Montcalm": "https://www.rando-marche.fr/_38219_546_randonnees-pic-du-montcalm",
        "Turon de Néouvielle": "https://www.rando-marche.fr/_38221_387_randonnees-turon-de-neouvielle",
        "Pic de Néouvielle": "https://www.rando-marche.fr/_38221_102_randonnees-pic-de-neouvielle",
    }
    expect(snowshoe_items).to_have_count(len(snowshoe_sources))
    assert set(snowshoe_items.locator(".name").all_text_contents()) == set(snowshoe_sources)
    assert set(snowshoe_items.locator(".name").all_text_contents()) <= catalog_names
    for peak_name, source_url in snowshoe_sources.items():
        snowshoe_items.filter(has_text=peak_name).click()
        popup = page.locator("#snowshoe-map #peak-panel-body")
        expect(popup).to_contain_text(peak_name)
        expect(popup.locator(".pop-activity-link")).to_have_attribute("href", source_url)
        if peak_name == "Mont Buet":
            expect(popup).to_contain_text("17,5 km")
    caramantran = snowshoe_items.filter(has_text="Pic de Caramantran")
    caramantran.locator(".done-check").check()
    expect(page.locator("#list .peak-item").filter(has_text="Pic de Caramantran").locator(".done-check")).to_be_checked()
    page.click("#mountain-view-open")
    expect(snowshoe_view).to_be_hidden()
    page.click("#ski-view-open")
    page.keyboard.press("Escape")
    expect(view).to_be_hidden()


@pytest.mark.parametrize("width,height", [(390, 844), (320, 568)])
def test_activity_views_on_mobile_use_tabs(open_page, width, height):
    page = open_page("bob")
    page.set_viewport_size({"width": width, "height": height})
    # Barre d'outils : tient dans la largeur, sans recouvrir la légende de la carte principale.
    toolbar = page.locator("#map-toolbar").bounding_box()
    legend = page.locator("#legend").bounding_box()
    assert toolbar["x"] >= 0 and toolbar["x"] + toolbar["width"] <= width
    assert legend["y"] >= toolbar["y"] + toolbar["height"]
    for button in ("#mountain-view-open", "#crampon-view-open", "#ski-view-open", "#snowshoe-view-open", "#custom-peak-open"):
        box = page.locator(button).bounding_box()
        assert box["x"] >= 0 and box["x"] + box["width"] <= width

    for activity in ("ski", "crampon", "snowshoe"):
        page.click(f"#{activity}-view-open")
        expect(page.locator("#tab-bar")).to_be_visible()
        expect(page.locator("#tab-map")).to_have_class(re.compile("active"))
        expect(page.locator(f"#{activity}-peaks-list")).to_be_hidden()
        # La carte reçoit les touchers : zoom sans forcer le clic.
        page.click(f"#{activity}-map .leaflet-control-zoom-in")
        assert page.locator(f"#{activity}-map").bounding_box()["y"] + page.locator(f"#{activity}-map").bounding_box()["height"] <= page.locator("#tab-bar").bounding_box()["y"] + 1
        page.click("#tab-list")
        expect(page.locator(f"#{activity}-peaks-list")).to_be_visible()
        expect(page.locator("#tab-list")).to_have_class(re.compile("active"))
        page.locator(f"#{activity}-peaks-list .peak-item").first.click()
        expect(page.locator(f"#{activity}-peaks-list")).to_be_hidden()
        expect(page.locator(f"#{activity}-map #peak-panel")).to_be_visible()
        expect(page.locator("#tab-map")).to_have_class(re.compile("active"))
        page.click("#tab-list")
        page.click("#tab-map")
        expect(page.locator(f"#{activity}-peaks-list")).to_be_hidden()
    page.click("#mountain-view-open")
    expect(page.locator("#sidebar")).to_be_hidden()
    page.click("#tab-list")
    expect(page.locator("#sidebar")).to_be_visible()


# Tuiles OSM du niveau de zoom affiché : identiques d'une carte à l'autre = même centre et même zoom.
CURRENT_OSM_TILES = """element => {
  const levels = [...element.querySelectorAll('.leaflet-tile-container')]
    .filter(level => level.querySelector('img[src*="openstreetmap"]'));
  const current = levels.reduce((a, b) => Number(b.style.zIndex) > Number(a.style.zIndex) ? b : a);
  return [...current.querySelectorAll('img')].map(img => img.src.match(/(\\d+\\/\\d+\\/\\d+)\\.png/)[1]).sort();
}"""


def test_switching_views_keeps_center_and_zoom(open_page):
    page = open_page("bob")
    page.click("#map .leaflet-control-zoom-in")
    page.wait_for_timeout(500)
    base_tiles = page.locator("#map").evaluate(CURRENT_OSM_TILES)
    assert base_tiles and all(tile.startswith("7/") for tile in base_tiles)
    page.click("#ski-view-open")
    assert page.locator("#ski-map").evaluate(CURRENT_OSM_TILES) == base_tiles
    expect(page.locator("#ski-map .leaflet-control-scale-line")).to_have_text(page.locator("#map .leaflet-control-scale-line").inner_text())
    page.click("#ski-map .leaflet-control-zoom-in")
    page.wait_for_timeout(500)
    ski_tiles = page.locator("#ski-map").evaluate(CURRENT_OSM_TILES)
    assert ski_tiles != base_tiles and all(tile.startswith("8/") for tile in ski_tiles)
    page.click("#crampon-view-open")
    assert page.locator("#crampon-map").evaluate(CURRENT_OSM_TILES) == ski_tiles
    page.click("#mountain-view-open")
    page.wait_for_timeout(300)
    assert page.locator("#map").evaluate(CURRENT_OSM_TILES) == ski_tiles


def test_switching_views_keeps_mobile_list_open(open_page):
    page = open_page("bob")
    page.set_viewport_size({"width": 390, "height": 844})
    page.click("#tab-list")
    expect(page.locator("#sidebar")).to_be_visible()
    expect(page.locator("#mountain-view-open")).to_be_visible()
    assert page.locator("#search").bounding_box()["y"] >= page.locator("#map-toolbar").bounding_box()["y"] + page.locator("#map-toolbar").bounding_box()["height"]
    for activity in ("ski", "crampon", "snowshoe"):
        page.click(f"#{activity}-view-open")
        expect(page.locator(f"#{activity}-peaks-list")).to_be_visible()
        expect(page.locator("#tab-list")).to_have_class(re.compile("active"))
    page.click("#mountain-view-open")
    expect(page.locator("#sidebar")).to_be_visible()
    expect(page.locator("#tab-list")).to_have_class(re.compile("active"))
    page.click("#tab-map")
    page.click("#ski-view-open")
    expect(page.locator("#ski-peaks-list")).to_be_hidden()
    expect(page.locator("#tab-map")).to_have_class(re.compile("active"))


def test_activity_views_warnings_slopes_and_base_layer(open_page):
    page = open_page("bob")
    page.click("#ski-view-open")
    warning = page.locator("#ski-peaks-list .summit-map-warning")
    for text in ("DVA, pelle et sonde", "BERA", "ne garantissent pas les conditions"):
        expect(warning).to_contain_text(text)
    slopes = "#ski-map img.leaflet-tile[src*='SLOPES.MOUNTAIN']"
    expect(page.locator(slopes).first).to_be_attached()
    expect(page.locator("#ski-map .summit-map-slopes input")).to_be_checked()
    page.uncheck("#ski-map .summit-map-slopes input")
    expect(page.locator(slopes)).to_have_count(0)
    page.check("#ski-map .summit-map-slopes input")
    expect(page.locator(slopes).first).to_be_attached()

    # Le fond choisi dans ⚙ s'applique aussi aux cartes d'activité déjà ouvertes.
    page.click("#settings-open")
    page.locator("#base-layer-options label", has_text="Photos aériennes IGN").locator("input").check()
    page.click("#settings-close")
    expect(page.locator("#ski-map img.leaflet-tile[src*='ORTHOPHOTOS']").first).to_be_attached()

    page.click("#snowshoe-view-open")
    for text in ("DVA, pelle et sonde", "BERA", "ne garantissent pas les conditions", "courses alpines"):
        expect(page.locator("#snowshoe-peaks-list .summit-map-warning")).to_contain_text(text)
    expect(page.locator("#snowshoe-map img.leaflet-tile[src*='SLOPES.MOUNTAIN']").first).to_be_attached()
    expect(page.locator("#snowshoe-map img.leaflet-tile[src*='ORTHOPHOTOS']").first).to_be_attached()

    page.click("#crampon-view-open")
    for text in ("à confirmer avant de partir", "Corridors", "Pic du Milieu"):
        expect(page.locator("#crampon-peaks-list .summit-map-warning")).to_contain_text(text)
    expect(page.locator("#crampon-map img.leaflet-tile[src*='SLOPES.MOUNTAIN']").first).to_be_attached()
    estimated = next(p for p in CATALOG if p.get("crampon") and not p["crampon"]["confirmed"])
    page.locator("#crampon-peaks-list .peak-item", has_text=estimated["name"]).click()
    expect(page.locator("#crampon-map #peak-panel-body")).to_contain_text("à confirmer avant de partir")


def _panel_center_offset(page):
    """Écart (px) entre le centre du panneau d'un sommet et le centre de la carte."""
    return page.evaluate("""() => {
      const p = document.getElementById('peak-panel').getBoundingClientRect();
      const m = document.getElementById('map').getBoundingClientRect();
      return [Math.abs((p.left + p.width / 2) - (m.left + m.width / 2)), Math.abs((p.top + p.height / 2) - (m.top + m.height / 2))];
    }""")


def test_peak_panel_centered_on_mobile_only(open_page):
    page = open_page("bob")
    name = CATALOG[0]["name"]
    # Mobile : panneau au centre de l'écran.
    page.set_viewport_size({"width": 390, "height": 844})
    page.reload()
    page.wait_for_selector(".peak-item", state="attached")
    page.click("#tab-list")
    open_peak(page, name)
    dx, dy = _panel_center_offset(page)
    assert dx <= 2 and dy <= 2, f"panneau décentré sur mobile ({dx:.0f}, {dy:.0f} px)"
    # Ordinateur : placé près du marqueur (donc pas au centre), et jamais sous la liste.
    # (Pas de mesure de distance au marqueur : elle varie avec la fin de l'animation de la
    # carte, et rendait le test instable sur les machines plus lentes de la CI.)
    page.set_viewport_size({"width": 1280, "height": 800})
    page.reload()
    page.wait_for_selector(".peak-item")
    open_peak(page, name)
    dx, _ = _panel_center_offset(page)
    assert dx > 50, f"panneau centré sur ordinateur ({dx:.0f} px du centre) : il doit rester près du sommet"
    left, sidebar_right = page.evaluate("""() => [
      document.getElementById('peak-panel').getBoundingClientRect().left,
      document.getElementById('sidebar').getBoundingClientRect().right]""")
    assert left >= sidebar_right, "panneau ouvert sous la liste"


def test_wish_and_done_date(open_page):
    page = open_page("bob")
    peak = CATALOG[0]
    open_peak(page, peak["name"])
    page.click("#peak-panel .pop-wish-btn")
    expect(page.locator("#peak-panel .pop-wish-btn")).to_have_attribute("aria-pressed", "true")
    expect(page.locator(".peak-item.state-wish", has_text=peak["name"])).to_contain_text("Envie")
    page.wait_for_function("() => document.querySelector('.peak-wish') !== null")
    # Cocher « fait » enregistre la date du jour, modifiable ensuite.
    page.check("#peak-panel .pop-done-checkbox")
    date_input = page.locator("#peak-panel .pop-done-date")
    expect(date_input).to_be_visible()
    today = page.evaluate("() => new Date().toLocaleDateString('sv-SE')")
    expect(date_input).to_have_value(today)
    date_input.fill("2025-08-12")
    date_input.dispatch_event("change")
    expect(page.locator("#peak-panel .pop-figures")).to_contain_text("12/08/2025")
    expect(page.locator(".peak-item", has_text=peak["name"]).first).to_contain_text("Fait le 12/08/2025")
    page.wait_for_timeout(300)
    entry = progress_of("bob")[peak["id"]]
    assert entry["done"] is True and entry["done_date"] == "2025-08-12" and entry["wish"] is True
    # Décocher efface la date.
    page.uncheck("#peak-panel .pop-done-checkbox")
    expect(date_input).to_be_hidden()
    page.wait_for_timeout(300)
    assert "done_date" not in progress_of("bob")[peak["id"]]


def test_list_cards_have_thumbnails(open_page):
    page = open_page("bob")
    expect(page.locator(".peak-item .peak-thumb")).to_have_count(len(CATALOG))
    # Vignettes chargées à l'affichage : la première fiche a son image.
    expect(page.locator(".peak-item .peak-thumb").first).to_have_attribute("style", re.compile("background-image"))


@pytest.mark.parametrize("width", [1280, 390])
def test_personal_panel_headers_without_banner(open_page, width, tmp_path):
    page = open_page("bob")
    page.set_viewport_size({"width": width, "height": 844})
    for panel, desktop_button, mobile_button in (("settings", "settings-open", "tab-profile"),
                                                 ("mine", "mine-open", "tab-mine")):
        page.click(f"#{mobile_button if width <= 760 else desktop_button}")
        expect(page.locator(f"#{panel}-header")).to_have_css("background-color", "rgba(0, 0, 0, 0)")
        expect(page.locator(f"#{panel}-close")).to_be_visible()
        container = page.locator("#settings-panel" if panel == "settings" else "#mine-view").bounding_box()
        toolbar = page.locator("#map-toolbar").bounding_box()
        assert container["y"] == 0
        if width > 760:
            header = page.locator(f"#{panel}-header h2").bounding_box()
            assert header["y"] >= toolbar["y"] + toolbar["height"]
        page.screenshot(path=str(tmp_path / f"{panel}-{width}.png"))
    page.click("#mine-close" if width <= 760 else "#settings-open")
    if width > 760:
        expect(page.locator("#mine-view")).to_be_hidden()
        expect(page.locator("#settings-panel")).to_be_visible()


def test_mine_view_desktop(open_page):
    page = open_page("bob")
    open_peak(page, CATALOG[0]["name"])
    page.check("#peak-panel .pop-done-checkbox")
    page.click("#mine-open")
    view = page.locator("#mine-view")
    expect(view).to_be_visible()
    expect(view.locator(".mine-ring-count")).to_have_text(f"1/{len(CATALOG)}")
    expect(view).to_contain_text(CATALOG[0]["name"])
    expect(view).not_to_contain_text("altitude cumulée")
    # Dernière ascension : dépliable, un clic sur un sommet l'affiche sur la carte.
    fold = view.locator("details[data-key=done]")
    fold.locator("summary").click()
    expect(fold.locator(".mine-peak")).to_have_count(1)
    page.click("#peak-panel-close")
    fold.locator(".mine-peak").click()
    expect(view).to_be_hidden()
    expect(page.locator("#peak-panel-body h3")).to_contain_text(CATALOG[0]["name"])
    page.click("#mine-open")
    expect(view.locator("details[data-key=wish] summary")).to_contain_text("0")
    # Ouvrir ⚙ referme Mes 3000 (un seul panneau à droite).
    page.click("#settings-open")
    expect(view).to_be_hidden()
    expect(page.locator("#settings-panel")).to_be_visible()


def test_mobile_tab_bar(open_page):
    page = open_page("bob")
    page.set_viewport_size({"width": 390, "height": 844})
    expect(page.locator("#tab-bar")).to_be_visible()
    expect(page.locator("#settings-open")).to_be_hidden()
    expect(page.locator("#sidebar")).to_be_hidden()
    page.click("#tab-list")
    expect(page.locator("#sidebar")).to_be_visible()
    expect(page.locator("#tab-list")).to_have_class(re.compile("active"))
    page.click("#tab-mine")
    expect(page.locator("#sidebar")).to_be_hidden()
    expect(page.locator("#mine-view")).to_be_visible()
    expect(page.locator("#mine-view .mine-ring-count")).to_have_text(f"0/{len(CATALOG)}")
    page.click("#tab-profile")
    expect(page.locator("#mine-view")).to_be_hidden()
    expect(page.locator("#settings-panel #account-bar")).to_be_visible()
    # Fermer le panneau par sa croix revient à l'onglet Carte.
    page.click("#settings-close")
    expect(page.locator("#tab-map")).to_have_class(re.compile("active"))
    # Choisir un sommet dans la liste ramène sur la carte, fiche ouverte.
    page.click("#tab-list")
    open_peak(page, CATALOG[0]["name"])
    expect(page.locator("#sidebar")).to_be_hidden()
    expect(page.locator("#tab-map")).to_have_class(re.compile("active"))


def test_guest_has_no_mine_tab(open_page):
    page = open_page("gus")
    page.set_viewport_size({"width": 390, "height": 844})
    expect(page.locator("#tab-bar")).to_be_visible()
    expect(page.locator("#tab-mine")).to_be_hidden()
    expect(page.locator("#tab-list")).to_be_visible()


GPX_SAMPLE = """<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><trkseg>
<trkpt lat="45.40" lon="6.90"><ele>2000</ele></trkpt>
<trkpt lat="45.41" lon="6.91"><ele>2400</ele></trkpt>
<trkpt lat="45.42" lon="6.92"><ele>2900</ele></trkpt>
<trkpt lat="45.43" lon="6.93"><ele>3300</ele></trkpt>
</trkseg></trk></gpx>"""


def test_gpx_profile_moves_point_on_map(open_page):
    page = open_page("bob")
    open_peak(page, CATALOG[0]["name"])
    page.locator("#peak-panel .gpx-file-input").set_input_files(
        files=[{"name": "trace.gpx", "mimeType": "application/gpx+xml", "buffer": GPX_SAMPLE.encode()}])
    # Les chiffres de la fiche reprennent le dénivelé de la trace.
    expect(page.locator("#peak-panel .pop-figures")).to_contain_text("+1300 m")
    page.click("#peak-panel .gpx-detail-toggle")
    svg = page.locator("#peak-panel .gpx-profile svg")
    svg.scroll_into_view_if_needed()
    box = svg.bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.9, box["y"] + box["height"] / 2)
    expect(page.locator("#peak-panel .gpx-cursor-label")).to_contain_text("3300 m")
    expect(page.locator(".leaflet-overlay-pane path[fill='#c0392b']")).to_have_count(1)
    page.mouse.move(box["x"] - 40, box["y"] - 40)
    expect(page.locator("#peak-panel .gpx-cursor-label")).to_be_hidden()


def test_activity_view_controls_filters_and_panel(open_page):
    page = open_page("bob")
    page.click("#ski-view-open")
    # Mêmes contrôles que la carte à pied : localisation et œil.
    expect(page.locator("#ski-map .locate-control a")).to_be_visible()
    eye = page.locator("#ski-map .separate-all-control a")
    eye.click()
    expect(eye).to_have_attribute("title", "Regrouper les sommets par zone")
    # Recherche et puces de cotation : la liste suit.
    items = page.locator("#ski-peaks-list .summit-map-items .peak-item")
    total = items.count()
    page.fill("#ski-peaks-list .summit-map-search", "mortice")
    expect(items).to_have_count(2)
    expect(page.locator("#ski-peaks-list .summit-map-list-count")).to_contain_text(f"2 / {total} sommets")
    page.fill("#ski-peaks-list .summit-map-search", "")
    red = page.locator("#ski-peaks-list .summit-map-chip", has_text="4.1 et plus")
    red.click()
    expect(red).to_have_attribute("aria-pressed", "false")
    assert 0 < items.count() < total
    red.click()
    expect(items).to_have_count(total)
    # Avertissements : repliés après « J'ai compris », et le restent au rechargement.
    warning = page.locator("#ski-peaks-list .summit-map-warning")
    expect(warning).to_have_attribute("open", "")
    warning.locator(".summit-map-warning-ok").click()
    expect(warning).not_to_have_attribute("open", "")
    # Fiche du sommet (même panneau qu'à pied) avec le bloc itinéraire, et Envie.
    items.filter(has_text="Ouille Noire").click()
    panel = page.locator("#ski-map #peak-panel")
    expect(panel.locator(".pop-activity")).to_contain_text("Ski 3.3")
    expect(panel.locator(".pop-activity-link")).to_have_attribute("href", "https://skitour.fr/sommets/2380")
    panel.locator(".pop-wish-btn").click()
    expect(items.filter(has_text="Ouille Noire")).to_contain_text("Envie")
    # Retour à pied : la fiche se ferme, puis s'ouvre à nouveau dans la carte à pied.
    page.click("#mountain-view-open")
    expect(page.locator("#peak-panel")).to_be_hidden()
    open_peak(page, "Ouille Noire")
    expect(page.locator("#map #peak-panel .pop-activity")).to_have_count(0)
    page.reload()
    page.wait_for_selector(".peak-item")
    page.click("#ski-view-open")
    expect(page.locator("#ski-peaks-list .summit-map-warning")).not_to_have_attribute("open", "")


def test_edit_activity_peak_in_its_view(open_page):
    page = open_page("bob")
    page.click("#ski-view-open")
    page.click("#custom-peak-open")
    page.fill("#cp-activity-grade", "Ski 2.1")
    fill_peak_form(page, name="Pointe Neige", altitude="3050", lat="45.2", lon="6.4")
    page.click("#placement-confirm")
    panel = page.locator("#ski-map #peak-panel")
    expect(panel).to_contain_text("Pointe Neige")
    # Modifier : même formulaire (cotation ski préremplie), placement dans la carte ski.
    panel.locator(".pop-custom-edit").click()
    expect(page.locator("#custom-peak-title")).to_have_text("Modifier le sommet · ski")
    expect(page.locator("#cp-activity-grade")).to_have_value("Ski 2.1")
    page.fill("#cp-activity-grade", "Ski 3.2")
    fill_peak_form(page, name="Pointe Neige Est", lat="45.25", lon="6.45")
    expect(page.locator("#ski-view #placement-bar")).to_be_visible()
    page.click("#placement-confirm")
    item = page.locator("#ski-peaks-list .peak-item").filter(has_text="Pointe Neige Est")
    expect(item).to_contain_text("Ski 3.2")
    expect(panel.locator(".pop-activity")).to_contain_text("Ski 3.2")
    [custom] = storage.load_custom_peaks("bob")
    assert (custom["name"], custom["activity"], custom["activity_grade"]) == ("Pointe Neige Est", "ski", "Ski 3.2")
    assert (custom["lat"], custom["lon"]) == (45.25, 6.45)
    expect(page.locator("#list .peak-item").filter(has_text="Pointe Neige")).to_have_count(0)
