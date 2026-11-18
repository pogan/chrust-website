const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.STATS_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chrust-')), 'stats.sqlite');
process.env.ADMIN_EMAILS = 'admin@example.com';
process.env.GOOGLE_CLIENT_ID = 'test.apps.googleusercontent.com';
const app = require('../chrust-website-express-app');

const BROWSER = {
	'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
	'accept-language': 'pl-PL,pl;q=0.9',
};

let base, server;
test.before(async () => {
	server = await new Promise((resolve) => {
		const s = app.listen(0, '127.0.0.1', () => resolve(s));
	});
	base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

test('strona główna z wersją i bieżącym rokiem, CSP bez zmian', async () => {
	const res = await fetch(`${base}/`);
	assert.equal(res.status, 200);
	const html = await res.text();
	assert.ok(html.includes(app.locals.appVersion.label), 'wersja w stopce');
	assert.ok(html.includes(`© ${new Date().getFullYear()} CHRUST`));
	assert.match(res.headers.get('content-security-policy'), /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
	assert.equal(res.headers.get('cache-control'), 'no-cache');
});

test('/healthz w formacie vamude-kit', async () => {
	const res = await fetch(`${base}/healthz`);
	assert.equal(res.status, 200);
	const body = await res.json();
	assert.equal(body.status, 'ok');
	assert.equal(body.app, 'chrust-website');
});

test('podstrony statyczne, pliki, stary adres /index.html, blokada źródeł', async () => {
	for (const p of ['/anatema/', '/anatema/regulamin/', '/setlisty/', '/main.css', '/translations.json']) {
		assert.equal((await fetch(base + p)).status, 200, p);
	}
	const old = await fetch(`${base}/index.html`, { redirect: 'manual' });
	assert.equal(old.status, 301);
	assert.equal((await fetch(`${base}/projekt.psd`)).status, 404);
	assert.equal((await fetch(`${base}/views/index.ejs`)).status, 404);
});

test('statystyki liczą też statyczne podstrony HTML, stary panel /stats nie istnieje', async () => {
	await fetch(`${base}/anatema/`, { headers: BROWSER });
	await new Promise((r) => setTimeout(r, 30));
	const Database = require('better-sqlite3');
	const rows = new Database(process.env.STATS_DB, { readonly: true })
		.prepare("SELECT path FROM vk_pageviews WHERE is_bot = 0").all().map((r) => r.path);
	assert.ok(rows.includes('/anatema/'));
	assert.equal((await fetch(`${base}/stats`)).status, 404);
});

test('/kierownik: logowanie Google; zamówienia, statystyki i edycja setlist tylko dla admina', async () => {
	const login = await fetch(`${base}/kierownik`);
	assert.equal(login.status, 200);
	assert.match(await login.text(), /data-client_id="test\.apps\.googleusercontent\.com"/);
	for (const p of ['/kierownik/stats', '/anatema/orders']) {
		const res = await fetch(`${base}${p}`, { redirect: 'manual' });
		assert.equal(res.status, 303, p);
		assert.equal(res.headers.get('location'), `/kierownik?next=${encodeURIComponent(p)}`);
	}
	const put = await fetch(`${base}/setlisty/api/sets/test`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: 'x', items: [] }),
	});
	assert.equal(put.status, 401);
	const api = await (await fetch(`${base}/setlisty/api/sets`)).json();
	assert.equal(api.editor, null);
	assert.equal(api.clientId, 'test.apps.googleusercontent.com');
	// Stare logowania już nie istnieją.
	assert.equal((await fetch(`${base}/anatema/orders/login`, { method: 'POST' })).status, 404);
	assert.equal((await fetch(`${base}/setlisty/login`, { method: 'POST' })).status, 404);
});

test('podgląd: wspólna sesja admina otwiera zamówienia i setlisty', async () => {
	process.env.PREVIEW_LOGIN = 'true';
	const res = await fetch(`${base}/kierownik/podglad`, { method: 'POST', redirect: 'manual' });
	const cookie = res.headers.get('set-cookie').split(';')[0];
	assert.equal((await fetch(`${base}/anatema/orders`, { headers: { cookie } })).status, 200);
	assert.equal((await fetch(`${base}/kierownik/stats`, { headers: { cookie } })).status, 200);
	const api = await (await fetch(`${base}/setlisty/api/sets`, { headers: { cookie } })).json();
	assert.equal(api.editor, 'podglad@staging.vamude.com');
	delete process.env.PREVIEW_LOGIN;
});
