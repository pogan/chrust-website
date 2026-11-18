// /setlisty — setlisty koncertowe zespołu. Strona (public/setlisty/index.html)
// jest statyczna i publiczna: każdy może przeglądać setlisty i pobrać PDF A5.
// Zmieniać je mogą administratorzy z ADMIN_EMAILS zalogowani przez "Sign in with
// Google": wspólna sesja panelu /kierownik (vamude-kit). Strona loguje w oknie
// na miejscu (POST /kierownik/login z tokenem GIS) i wylogowuje przez
// POST /kierownik/wyloguj.
//
// Dane: data/setlists.json — {<id>: {name, date, venue, items, updated}}.
// Gdy pliku jeszcze nie ma, startujemy od setlisty-seed.json (commitowany —
// setlisty przeniesione z artefaktu Claude, w którym aplikacja powstała).

const fs = require('fs');
const path = require('path');
const express = require('express');

const DATA_FILE = path.join(__dirname, 'data', 'setlists.json');
const SEED_FILE = path.join(__dirname, 'setlisty-seed.json');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

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

function createRouter(admin) {
	const router = express.Router();

	function requireEditor(req, res, next) {
		const session = admin.current(req);
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
		const session = admin.current(req);
		res.set('Cache-Control', 'no-store');
		res.json({
			sets,
			editor: session ? session.email : null,
			clientId: GOOGLE_CLIENT_ID || null,
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

	return router;
}

module.exports = { createRouter };
