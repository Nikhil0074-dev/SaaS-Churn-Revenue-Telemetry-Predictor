"""Browser end-to-end test + screenshot capture (Playwright, Chromium).

Prerequisites: API on :8000 with a seeded demo database and the built frontend served on :4173
(see docs/testing.md).  Run:  python e2e/ui_e2e.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

BASE = "http://127.0.0.1:4173"
OUT = Path(__file__).resolve().parents[1] / "docs" / "screenshots"
PASSWORD = "DemoPass2026!"


def login(page: Page, email: str, password: str = PASSWORD) -> None:
    page.goto(f"{BASE}/login")
    page.get_by_label("Email").fill(email)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Sign in").click()


def shot(page: Page, name: str, full: bool = True) -> None:
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)  # let chart animations settle
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print("  screenshot", name)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "favicon" not in m.text else None)

        print("1. login screen + failed login")
        page.goto(f"{BASE}/login")
        shot(page, "01-login", full=False)
        login(page, "owner@example.com", "wrong-password-1")
        expect(page.get_by_role("alert")).to_contain_text("Invalid email or password")
        print("   ok: error shown")
        errors.clear()  # the deliberate failed login above logs one expected 401 to the console

        print("2. owner signs in -> overview")
        login(page, "owner@example.com")
        expect(page.get_by_role("heading", name="Revenue overview")).to_be_visible()
        expect(page.get_by_text("Synthetic demo data")).to_be_visible()
        expect(page.get_by_test_id("kpi")).to_have_count(8)
        mrr = page.get_by_test_id("kpi").first.inner_text()
        assert re.search(r"\$[\d,]+", mrr), mrr
        expect(page.get_by_role("heading", name="MRR trend")).to_be_visible()
        expect(page.locator(".recharts-surface").first).to_be_visible()
        page.get_by_label("Period").select_option("90")
        page.wait_for_timeout(800)
        shot(page, "02-overview")
        page.get_by_role("button", name="View as table").first.click()
        expect(page.get_by_role("columnheader", name="MRR").first).to_be_visible()
        print("   ok: KPIs, charts, period filter, table alternative")

        print("3. churn risk")
        page.get_by_role("link", name="Churn risk").click()
        expect(page.get_by_role("heading", name="Churn risk")).to_be_visible()
        expect(page.get_by_text("not certainties").first).to_be_visible()
        expect(page.get_by_text("High risk").first).to_be_visible()
        page.get_by_role("tab", name="Medium risk").click()
        page.wait_for_timeout(500)
        page.get_by_role("tab", name="High risk").click()
        shot(page, "03-churn-risk")

        print("4. customers: filter + sort + open detail")
        page.get_by_role("link", name="Customers").click()
        expect(page.get_by_role("heading", name="Customers", exact=True)).to_be_visible()
        page.get_by_label("Risk", exact=True).select_option("high")
        page.wait_for_timeout(600)
        rows = page.locator("tbody tr")
        assert rows.count() > 3
        for i in range(min(rows.count(), 10)):
            assert "High risk" in rows.nth(i).inner_text()
        shot(page, "04-customers")
        page.get_by_label("Risk", exact=True).select_option("")
        page.get_by_label("Search", exact=True).fill("user0001")
        page.wait_for_timeout(700)
        assert page.locator("tbody tr").count() == 1
        page.get_by_label("Search", exact=True).fill("")
        page.get_by_label("Risk", exact=True).select_option("high")
        page.wait_for_timeout(700)

        print("5. customer detail")
        page.locator("tbody tr").first.get_by_role("link").click()
        expect(page.get_by_role("heading", name="Churn estimate")).to_be_visible()
        expect(page.get_by_text("do not establish why")).to_be_visible()
        expect(page.get_by_text("Signals associated with higher risk")).to_be_visible()
        shot(page, "05-customer-detail")

        print("6. retention workspace: accept + note + complete")
        page.get_by_role("link", name="Retention").click()
        expect(page.get_by_role("heading", name="Retention workspace")).to_be_visible()
        card = page.get_by_role("article").first
        card.get_by_role("button", name="Accept and assign to me").click()
        page.wait_for_timeout(800)
        page.get_by_role("tab", name="In progress").click()
        page.wait_for_timeout(600)
        card = page.get_by_role("article").first
        card.get_by_label("Add a note").fill("Called the account owner; follow-up booked.")
        card.get_by_label("Note type").select_option("contact_attempt")
        card.get_by_role("button", name="Add", exact=True).click()
        page.wait_for_timeout(800)
        expect(page.get_by_text("Called the account owner").first).to_be_visible()
        card = page.get_by_role("article").first
        card.get_by_role("button", name="Complete…").click()
        expect(card.get_by_role("button", name="Mark done")).to_be_disabled()
        card.get_by_label("Outcome").select_option("customer_retained")
        shot(page, "06-retention")
        card.get_by_role("button", name="Mark done").click()
        page.wait_for_timeout(800)
        page.get_by_role("tab", name="Completed").click()
        page.wait_for_timeout(600)
        expect(page.get_by_text("Outcome: Customer retained").first).to_be_visible()
        print("   ok: assigned, noted, completed with outcome")

        print("7. model performance")
        page.get_by_role("link", name="Model").click()
        expect(page.get_by_role("heading", name="Model performance")).to_be_visible()
        expect(page.get_by_text("SYNTHETIC demonstration data").first).to_be_visible()
        expect(page.get_by_text("Comparison with baselines")).to_be_visible()
        expect(page.get_by_text("Criterion fixed in advance")).to_be_visible()
        shot(page, "07-model")

        print("8. reports: preview + CSV download")
        page.get_by_role("link", name="Reports").click()
        page.get_by_role("button", name="Preview").click()
        expect(page.locator("tbody tr").first).to_be_visible()
        with page.expect_download() as dl:
            page.get_by_role("button", name="Download CSV").click()
        assert dl.value.suggested_filename == "revenue-report.csv"
        text = Path(dl.value.path()).read_text()
        assert text.splitlines()[0].startswith("month,")
        shot(page, "08-reports")

        print("9. settings")
        page.get_by_role("link", name="Settings").click()
        expect(page.get_by_role("heading", name="Settings and integrations")).to_be_visible()
        expect(page.get_by_text("Stripe (test mode recommended)")).to_be_visible()
        shot(page, "09-settings")

        print("10. sign out; viewer role has no write controls")
        page.get_by_role("button", name="Sign out").click()
        expect(page).to_have_url(re.compile(r"/login$"))
        login(page, "viewer@example.com")
        page.get_by_role("link", name="Churn risk").click()
        expect(page.get_by_role("heading", name="Churn risk")).to_be_visible()
        assert page.get_by_role("button", name="Refresh predictions").count() == 0
        page.get_by_role("link", name="Retention").click()
        expect(page.get_by_role("heading", name="Retention workspace")).to_be_visible()
        assert page.get_by_role("button", name="Generate suggestions").count() == 0
        page.get_by_role("tab", name="Completed").click()
        page.wait_for_timeout(500)
        assert page.get_by_role("article").first.get_by_role("button").count() == 0
        print("   ok: viewer is read-only")

        print("11. direct navigation while signed out redirects")
        page.get_by_role("button", name="Sign out").click()
        page.goto(f"{BASE}/customers")
        expect(page).to_have_url(re.compile(r"/login$"))

        print("12. mobile layout")
        m = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2).new_page()
        login(m, "owner@example.com")
        expect(m.get_by_role("heading", name="Revenue overview")).to_be_visible()
        assert m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "horizontal page overflow on mobile"
        shot(m, "10-mobile-overview", full=False)

        browser.close()
        if errors:
            print("BROWSER ERRORS:", *errors, sep="\n  ")
            return 1
    print("UI E2E PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
