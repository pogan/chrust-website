// /anatema/orders — lista opłaconych zamówień z data/anatema-orders.jsonl
// (patrz anatema.js: recordOrder), schowana za logowaniem Google i whitelistą
// adresów e-mail z .env.
//
// Dostęp: zalogowany administrator z panelu /kierownik (vamude-kit, logowanie
// Google, ADMIN_EMAILS sprawdzane przy każdym żądaniu). Niezalogowanego
// odsyłamy do /kierownik, a po zalogowaniu wraca tutaj.

const fs = require('fs');
const path = require('path');
const express = require('express');

const ORDERS_FILE = path.join(__dirname, 'data', 'anatema-orders.jsonl');

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

// Suma kwot per waluta — w praktyce zawsze PLN, ale nie zakładamy tego na sztywno.
function formatTotalAmount(orders) {
	const byCurrency = new Map();
	for (const o of orders) {
		if (typeof o.amountTotal !== 'number') continue;
		const currency = (o.currency || '').toUpperCase();
		byCurrency.set(currency, (byCurrency.get(currency) || 0) + o.amountTotal);
	}
	if (byCurrency.size === 0) return '—';
	return Array.from(byCurrency.entries())
		.map(([currency, total]) => `${(total / 100).toFixed(2)} ${currency}`)
		.join(', ');
}

function sumQty(orders) {
	return orders.reduce((sum, o) => sum + (typeof o.qty === 'number' ? o.qty : 0), 0);
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

function renderOrdersPage(email) {
	const orders = readOrders();

	const rows = orders
		.map((o, i) => `
			<tr>
				<td>${i + 1}</td>
				<td>${escapeHtml(formatTimestamp(o.ts))}</td>
				<td>${escapeHtml(o.name)}</td>
				<td>${escapeHtml(o.email)}</td>
				<td>${escapeHtml(o.phone)}</td>
				<td>${escapeHtml(o.qty)}</td>
				<td>${escapeHtml(formatAmount(o))}</td>
				<td>${escapeHtml(o.delivery)}${o.paczkomat ? ` (${escapeHtml(o.paczkomat)})` : ''}</td>
				<td>${escapeHtml(o.address)}</td>
				<td>${escapeHtml(o.nip)}</td>
				<td>${o.sessionId ? `<button type="button" class="orders__delete" data-session-id="${escapeHtml(o.sessionId)}">Usuń</button>` : ''}</td>
			</tr>`)
		.join('');

	const table = orders.length
		? `<div class="orders-table-wrap">
			<table class="orders">
				<thead>
					<tr>
						<th>Lp.</th>
						<th>Data</th>
						<th>Imię i nazwisko</th>
						<th>E-mail</th>
						<th>Telefon</th>
						<th>Ilość</th>
						<th>Kwota</th>
						<th>Dostawa</th>
						<th>Adres</th>
						<th>NIP</th>
						<th>Akcje</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		</div>`
		: `<p class="orders-empty">Brak zamówień.</p>`;

	const summary = `
		<div class="orders__summary">
			<div class="orders__stat">
				<span class="orders__stat-value">${orders.length}</span>
				<span class="orders__stat-label">${orders.length === 1 ? 'zamówienie' : 'zamówień'}</span>
			</div>
			<div class="orders__stat">
				<span class="orders__stat-value">${sumQty(orders)}</span>
				<span class="orders__stat-label">zamówionych płyt</span>
			</div>
			<div class="orders__stat">
				<span class="orders__stat-value">${escapeHtml(formatTotalAmount(orders))}</span>
				<span class="orders__stat-label">suma kwot</span>
			</div>
		</div>`;

	return renderPage({
		title: 'Zamówienia',
		bodyClass: 'orders-page',
		body: `
	<main class="orders">
		<div class="orders__intro">
			<span class="orders__count">zalogowano jako ${escapeHtml(email)}</span>
			<button type="button" class="orders__logout" id="orders-logout">Wyloguj</button>
		</div>
		${summary}
		${table}
	</main>`,
	});
}

// --- Router ---------------------------------------------------------------

function createRouter(admin) {
	const router = express.Router();

	router.get('/', (req, res) => {
		const session = admin.current(req);
		if (!session) return res.redirect(303, `/kierownik?next=${encodeURIComponent(req.originalUrl)}`);
		res.set('Cache-Control', 'no-store');
		res.type('html').send(renderOrdersPage(session.email));
	});

	router.post('/delete', express.json({ limit: '4kb' }), (req, res) => {
		const session = admin.current(req);
		if (!session) return res.status(401).json({ ok: false, error: 'Musisz być zalogowany.' });

		const sessionId = req.body && req.body.sessionId;
		if (!sessionId || typeof sessionId !== 'string') {
			return res.status(400).json({ ok: false, error: 'Brak identyfikatora zamówienia.' });
		}

		let raw;
		try {
			raw = fs.readFileSync(ORDERS_FILE, 'utf8');
		} catch {
			return res.status(404).json({ ok: false, error: 'Nie znaleziono zamówienia.' });
		}

		let removed = false;
		const kept = raw.split('\n').filter((line) => {
			const trimmed = line.trim();
			if (!trimmed) return false;
			let row;
			try {
				row = JSON.parse(trimmed);
			} catch {
				return true; // nieparsowalna linia — zostawiamy, nie tracimy danych po cichu
			}
			if (row.sessionId === sessionId) {
				removed = true;
				return false;
			}
			return true;
		});

		if (!removed) {
			return res.status(404).json({ ok: false, error: 'Nie znaleziono zamówienia.' });
		}

		fs.writeFileSync(ORDERS_FILE, kept.length ? kept.join('\n') + '\n' : '');
		console.log(`anatema/orders: usunięto zamówienie ${sessionId} (${session.email})`);
		return res.json({ ok: true });
	});

	return router;
}

module.exports = { createRouter };
