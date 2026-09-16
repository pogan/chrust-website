// /anatema/orders — lista opłaconych zamówień z data/anatema-orders.jsonl
// (patrz anatema.js: recordOrder), schowana za logowaniem Google i whitelistą
// adresów e-mail z .env.
//
// Logowanie to "Sign in with Google" (Google Identity Services, biblioteka
// ładowana z accounts.google.com — patrz CSP w chrust-website-express-app.js).
// Przeglądarka dostaje od Google podpisany token (JWT) i wysyła go tutaj;
// serwer weryfikuje podpis przez google-auth-library (nie dowierza niczemu,
// co przyszło z klienta) i sprawdza e-mail z tokenu przeciwko ANATEMA_ADMIN_EMAILS.
// Po weryfikacji dostaje ciasteczko podpisane HMAC-iem (SESSION_SECRET) —
// własna, minimalna sesja, bez express-session (i tak trzyma tylko e-mail + exp).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookie = require('cookie');
const { OAuth2Client } = require('google-auth-library');

const ORDERS_FILE = path.join(__dirname, 'data', 'anatema-orders.jsonl');

const COOKIE_NAME = 'anatema_admin';
const COOKIE_PATH = '/anatema/orders';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dni

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';

const ADMIN_EMAILS = (process.env.ANATEMA_ADMIN_EMAILS || '')
	.split(',')
	.map((e) => e.trim().toLowerCase())
	.filter(Boolean);

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const loginConfigured = Boolean(googleClient && SESSION_SECRET);

if (!loginConfigured) {
	console.warn(
		'anatema/orders: brak GOOGLE_CLIENT_ID i/lub SESSION_SECRET w .env — strona będzie zwracać ekran logowania, ale logowanie nie zadziała.'
	);
}
if (loginConfigured && ADMIN_EMAILS.length === 0) {
	console.warn('anatema/orders: ANATEMA_ADMIN_EMAILS jest puste — nikt nie będzie miał dostępu.');
}

function isWhitelisted(email) {
	return Boolean(email) && ADMIN_EMAILS.includes(email.toLowerCase());
}

// --- Sesja: {email, exp} podpisane HMAC-SHA256, bez szyfrowania — to nie jest
// sekret, tylko dowód, że MY to wystawiliśmy i że whitelist był sprawdzony. ---

function signSession(payload) {
	const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
	return `${data}.${sig}`;
}

function verifySession(token) {
	if (!token || !SESSION_SECRET) return null;
	const dot = token.lastIndexOf('.');
	if (dot < 0) return null;
	const data = token.slice(0, dot);
	const sig = token.slice(dot + 1);
	const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
	const sigBuf = Buffer.from(sig);
	const expectedBuf = Buffer.from(expected);
	if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
	try {
		const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
		if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
		return payload;
	} catch {
		return null;
	}
}

function getSession(req) {
	const header = req.headers.cookie;
	if (!header) return null;
	const token = cookie.parse(header)[COOKIE_NAME];
	const session = verifySession(token);
	// Re-check the whitelist on every request, not just at login — removing
	// someone from ANATEMA_ADMIN_EMAILS should cut their access immediately,
	// not just block new logins.
	if (session && isWhitelisted(session.email)) return session;
	return null;
}

function escapeHtml(value) {
	return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
		{ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
	));
}

function readOrders() {
	let raw;
	try {
		raw = fs.readFileSync(ORDERS_FILE, 'utf8');
	} catch {
		return []; // plik jeszcze nie istnieje — brak zamówień, nie błąd
	}
	const orders = [];
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			orders.push(JSON.parse(trimmed));
		} catch (err) {
			console.warn('anatema/orders: pominięto nieparsowalną linię w anatema-orders.jsonl —', err.message);
		}
	}
	orders.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
	return orders;
}

function formatAmount(order) {
	if (typeof order.amountTotal !== 'number') return '—';
	return `${(order.amountTotal / 100).toFixed(2)} ${(order.currency || '').toUpperCase()}`;
}

function formatTimestamp(ts) {
	const date = new Date(ts);
	if (Number.isNaN(date.getTime())) return escapeHtml(ts);
	return date.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
}

function renderPage({ title, bodyClass, body }) {
	return `<!doctype html>
<html lang="pl">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${escapeHtml(title)} — CHRUST</title>
	<meta name="robots" content="noindex">
	<meta name="theme-color" content="#000000">
	<link rel="stylesheet" href="/anatema.css">
	<link rel="stylesheet" href="/anatema-orders.css">
	<link rel="icon" type="image/png" href="/img/chrust_favicon_pozytyw.png">
	<script defer src="/js/anatema-orders.js"></script>
</head>
<body class="anatema ${bodyClass}">
	<div class="topbar">
		<a href="https://chrustfolkmusic.pl/">← chrustfolkmusic.pl</a>
		<span class="topbar__mark">ANATEMA! — zamówienia</span>
	</div>
${body}
</body>
</html>`;
}

function renderLoginPage({ error } = {}) {
	const googleButton = loginConfigured
		? `<script src="https://accounts.google.com/gsi/client" async defer></script>
			<div id="g_id_onload"
				data-client_id="${escapeHtml(GOOGLE_CLIENT_ID)}"
				data-callback="handleCredentialResponse"
				data-auto_prompt="false"></div>
			<div class="g_id_signin" data-type="standard" data-theme="filled_black" data-size="large"></div>
			<p class="login__error" id="login-error">${error ? escapeHtml(error) : ''}</p>`
		: `<p class="login__unconfigured">Logowanie nie jest jeszcze skonfigurowane (brak GOOGLE_CLIENT_ID / SESSION_SECRET w .env).</p>`;

	return renderPage({
		title: 'Logowanie',
		bodyClass: 'login-page',
		body: `
	<main class="login">
		<h1 class="login__title">Zamówienia ANATEMA!</h1>
		<p class="login__hint">Dostęp tylko dla wybranych adresów e-mail. Zaloguj się kontem Google.</p>
		${googleButton}
	</main>`,
	});
}

function renderOrdersPage(email) {
	const orders = readOrders();

	const rows = orders
		.map((o) => `
			<tr>
				<td>${escapeHtml(formatTimestamp(o.ts))}</td>
				<td>${escapeHtml(o.name)}</td>
				<td>${escapeHtml(o.email)}</td>
				<td>${escapeHtml(o.phone)}</td>
				<td>${escapeHtml(o.qty)}</td>
				<td>${escapeHtml(formatAmount(o))}</td>
				<td>${escapeHtml(o.delivery)}${o.paczkomat ? ` (${escapeHtml(o.paczkomat)})` : ''}</td>
				<td>${escapeHtml(o.address)}</td>
				<td>${escapeHtml(o.nip)}</td>
			</tr>`)
		.join('');

	const table = orders.length
		? `<div class="orders-table-wrap">
			<table class="orders">
				<thead>
					<tr>
						<th>Data</th>
						<th>Imię i nazwisko</th>
						<th>E-mail</th>
						<th>Telefon</th>
						<th>Ilość</th>
						<th>Kwota</th>
						<th>Dostawa</th>
						<th>Adres</th>
						<th>NIP</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		</div>`
		: `<p class="orders-empty">Brak zamówień.</p>`;

	return renderPage({
		title: 'Zamówienia',
		bodyClass: 'orders-page',
		body: `
	<main class="orders">
		<div class="orders__intro">
			<span class="orders__count">${orders.length} ${orders.length === 1 ? 'zamówienie' : 'zamówień'} · zalogowano jako ${escapeHtml(email)}</span>
			<button type="button" class="orders__logout" id="orders-logout">Wyloguj</button>
		</div>
		${table}
	</main>`,
	});
}

// --- Router ---------------------------------------------------------------

const router = express.Router();

router.get('/', (req, res) => {
	const session = getSession(req);
	res.type('html').send(session ? renderOrdersPage(session.email) : renderLoginPage());
});

router.post('/login', express.json({ limit: '8kb' }), async (req, res) => {
	if (!loginConfigured) {
		return res.status(503).json({ ok: false, error: 'Logowanie nie jest skonfigurowane.' });
	}
	const credential = req.body && req.body.credential;
	if (!credential || typeof credential !== 'string') {
		return res.status(400).json({ ok: false, error: 'Brak tokenu logowania.' });
	}
	try {
		const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
		const payload = ticket.getPayload();
		const email = payload && payload.email ? payload.email.toLowerCase() : null;

		if (!payload || !payload.email_verified || !isWhitelisted(email)) {
			console.warn(`anatema/orders: odrzucono logowanie${email ? ` (${email})` : ''} — spoza listy dostępu.`);
			return res.status(403).json({ ok: false, error: 'Ten adres e-mail nie ma dostępu do zamówień.' });
		}

		const token = signSession({ email, exp: Date.now() + SESSION_MAX_AGE_MS });
		res.cookie(COOKIE_NAME, token, {
			httpOnly: true,
			secure: IS_PROD,
			sameSite: 'lax',
			path: COOKIE_PATH,
			maxAge: SESSION_MAX_AGE_MS,
		});
		return res.json({ ok: true });
	} catch (err) {
		console.error('anatema/orders: weryfikacja tokenu Google nieudana —', err.message);
		return res.status(401).json({ ok: false, error: 'Nie udało się zweryfikować logowania Google.' });
	}
});

router.post('/logout', (req, res) => {
	res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
	res.json({ ok: true });
});

module.exports = { router };
