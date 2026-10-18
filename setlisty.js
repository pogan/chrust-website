// /setlisty — setlisty koncertowe zespołu. Strona (public/setlisty/index.html)
// jest statyczna i publiczna: każdy może przeglądać setlisty i pobrać PDF A5.
// Zmieniać je mogą tylko osoby z ANATEMA_ADMIN_EMAILS, zalogowane przez "Sign in with Google" — ten sam
// mechanizm co /anatema/orders (token GIS weryfikowany przez
// google-auth-library, potem własne ciasteczko podpisane HMAC-iem), tylko
// z osobnym ciasteczkiem ograniczonym do /setlisty.
//
// Dane: data/setlists.json — {<id>: {name, date, venue, items, updated}}.
// Gdy pliku jeszcze nie ma, startujemy od setlisty-seed.json (commitowany —
// setlisty przeniesione z artefaktu Claude, w którym aplikacja powstała).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookie = require('cookie');
const { OAuth2Client } = require('google-auth-library');

const DATA_FILE = path.join(__dirname, 'data', 'setlists.json');
const SEED_FILE = path.join(__dirname, 'setlisty-seed.json');

const COOKIE_NAME = 'setlisty_editor';
const COOKIE_PATH = '/setlisty';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production';

const EDITOR_EMAILS = (process.env.ANATEMA_ADMIN_EMAILS || '')
	.split(',')
	.map((e) => e.trim().toLowerCase())
	.filter(Boolean);

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const loginConfigured = Boolean(googleClient && SESSION_SECRET);

if (!loginConfigured) {
	console.warn('setlisty: brak GOOGLE_CLIENT_ID i/lub SESSION_SECRET w .env — setlisty będą tylko do odczytu.');
}

function isEditor(email) {
	return Boolean(email) && EDITOR_EMAILS.includes(email.toLowerCase());
}

// --- Sesja: {email, exp} podpisane HMAC-SHA256 (jak w anatema-orders.js) ---

function sign(data) {
	return crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
}

function signSession(payload) {
	const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	return `${data}.${sign(data)}`;
}

function getSession(req) {
	if (!SESSION_SECRET || !req.headers.cookie) return null;
	const token = cookie.parse(req.headers.cookie)[COOKIE_NAME];
	if (!token) return null;
	const dot = token.lastIndexOf('.');
	if (dot < 0) return null;
	const data = token.slice(0, dot);
	const sigBuf = Buffer.from(token.slice(dot + 1));
	const expectedBuf = Buffer.from(sign(data));
	if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
	try {
		const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
		if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
		// Whitelist sprawdzany przy każdym żądaniu — usunięcie adresu odbiera dostęp od razu.
		return isEditor(payload.email) ? payload : null;
	} catch {
		return null;
	}
}

// --- Dane ---------------------------------------------------------------

function loadSets() {
	for (const file of [DATA_FILE, SEED_FILE]) {
		try {
			const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
			if (parsed && typeof parsed === 'object') return parsed;
		} catch (err) {
			if (err.code !== 'ENOENT') console.error(`setlisty: nie udało się wczytać ${file} —`, err.message);
		}
	}
	return {};
}

let sets = loadSets();

// Zapis przez plik tymczasowy + rename, żeby awaria w połowie nie zostawiła uciętego JSON-a.
function persist() {
	fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
	const tmp = `${DATA_FILE}.${process.pid}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(sets, null, '\t'));
	fs.renameSync(tmp, DATA_FILE);
}

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DATE_RE = /^(\d{4}-\d{2}-\d{2})?$/;
const MAX_ITEMS = 200;

function str(value, max) {
	return typeof value === 'string' ? value.slice(0, max) : '';
}

// Zwraca oczyszczoną setlistę albo null, gdy body nie ma sensownego kształtu.
function sanitizeSet(body) {
	if (!body || typeof body !== 'object' || !Array.isArray(body.items) || body.items.length > MAX_ITEMS) return null;
	const date = str(body.date, 10);
	if (!DATE_RE.test(date)) return null;
	const items = [];
	for (const it of body.items) {
		if (it && it.t === 's' && typeof it.id === 'string' && ID_RE.test(it.id)) items.push({ t: 's', id: it.id });
		else if (it && it.t === 'x') items.push({ t: 'x', label: str(it.label, 60) });
		else return null;
	}
	return { name: str(body.name, 120), date, venue: str(body.venue, 120), items, updated: Date.now() };
}

// --- Router ---------------------------------------------------------------

const router = express.Router();

function requireEditor(req, res, next) {
	const session = getSession(req);
	if (!session) return res.status(401).json({ ok: false, error: 'Zaloguj się, żeby edytować setlisty.' });
	req.editor = session.email;
	next();
}

// Zapisy przyjmują wyłącznie application/json: formularz z obcej strony nie
// wyśle takiego Content-Type bez preflightu CORS, więc to (razem z SameSite=Lax)
// zamyka drogę dla CSRF.
function requireJson(req, res, next) {
	if (!req.is('application/json')) return res.status(415).json({ ok: false, error: 'Oczekiwano JSON.' });
	next();
}

router.get('/api/sets', (req, res) => {
	const session = getSession(req);
	res.set('Cache-Control', 'no-store');
	res.json({
		sets,
		editor: session ? session.email : null,
		clientId: loginConfigured ? GOOGLE_CLIENT_ID : null,
	});
});

router.put('/api/sets/:id', requireEditor, requireJson, express.json({ limit: '32kb' }), (req, res) => {
	const { id } = req.params;
	if (!ID_RE.test(id)) return res.status(400).json({ ok: false, error: 'Niepoprawny identyfikator.' });
	const clean = sanitizeSet(req.body);
	if (!clean) return res.status(400).json({ ok: false, error: 'Niepoprawne dane setlisty.' });
	sets[id] = clean;
	try {
		persist();
	} catch (err) {
		console.error('setlisty: zapis nieudany —', err.message);
		return res.status(500).json({ ok: false, error: 'Nie udało się zapisać.' });
	}
	res.json({ ok: true, updated: clean.updated });
});

router.delete('/api/sets/:id', requireEditor, (req, res) => {
	const { id } = req.params;
	if (!Object.prototype.hasOwnProperty.call(sets, id)) return res.status(404).json({ ok: false, error: 'Nie ma takiej setlisty.' });
	delete sets[id];
	try {
		persist();
	} catch (err) {
		console.error('setlisty: zapis nieudany —', err.message);
		return res.status(500).json({ ok: false, error: 'Nie udało się usunąć.' });
	}
	console.log(`setlisty: usunięto ${id} (${req.editor})`);
	res.json({ ok: true });
});

router.post('/login', requireJson, express.json({ limit: '8kb' }), async (req, res) => {
	if (!loginConfigured) return res.status(503).json({ ok: false, error: 'Logowanie nie jest skonfigurowane.' });
	const credential = req.body && req.body.credential;
	if (!credential || typeof credential !== 'string') return res.status(400).json({ ok: false, error: 'Brak tokenu logowania.' });
	try {
		const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
		const payload = ticket.getPayload();
		const email = payload && payload.email ? payload.email.toLowerCase() : null;
		if (!payload || !payload.email_verified || !isEditor(email)) {
			console.warn(`setlisty: odrzucono logowanie${email ? ` (${email})` : ''} — spoza listy edytorów.`);
			return res.status(403).json({ ok: false, error: 'Ten adres e-mail nie może edytować setlist.' });
		}
		res.cookie(COOKIE_NAME, signSession({ email, exp: Date.now() + SESSION_MAX_AGE_MS }), {
			httpOnly: true,
			secure: IS_PROD,
			sameSite: 'lax',
			path: COOKIE_PATH,
			maxAge: SESSION_MAX_AGE_MS,
		});
		res.json({ ok: true, editor: email });
	} catch (err) {
		console.error('setlisty: weryfikacja tokenu Google nieudana —', err.message);
		res.status(401).json({ ok: false, error: 'Nie udało się zweryfikować logowania Google.' });
	}
});

router.post('/logout', (req, res) => {
	res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
	res.json({ ok: true });
});

module.exports = { router };
