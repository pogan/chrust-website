// /anatema — przedsprzedaż płyty winylowej CHRUST „ANATEMA!”.
//
// Reszta serwisu to czysty statyczny serwer; tutaj jest jedyny kawałek logiki
// po stronie serwera. Strony (index / regulamin / dziekujemy) leżą w
// public/anatema/ i serwuje je express.static — ten moduł dokłada tylko:
//   • POST /anatema/checkout  — zakłada sesję Stripe Checkout i zwraca jej URL,
//   • POST /anatema/webhook   — dopisuje opłacone zamówienie do data/anatema-orders.jsonl.
//
// Wzorowane na ../bdik-website (lib/stripe.js, routes/payments.js, routes/webhooks.js).

const fs = require('fs');
const path = require('path');
const express = require('express');
const Stripe = require('stripe');

// --- Podmiot sprzedający (stopka strony i regulamin mają te dane wpisane wprost;
// tutaj powtórzone, bo trafiają w metadane sesji i opis pozycji). ---
const SELLER = {
	name: 'Dariusz Mrozek Art',
	address: 'Jaśkowa Dolina 15, 80-252 Gdańsk',
	nip: '5932472450',
	email: 'chrust@chrustfolkmusic.pl',
};

// Wersja regulaminu zaakceptowana przy zakupie — zapisywana w metadanych sesji,
// żeby dało się odtworzyć, na jaką treść klient wyraził zgodę. Podbić przy każdej
// zmianie treści public/anatema/regulamin/index.html.
const REGULAMIN_VERSION = '2026-08-31';

// Ceny w groszach. 180 zł brutto (VAT 23% w środku). Liczone WYŁĄCZNIE tutaj —
// cokolwiek przyśle przeglądarka jako kwotę, jest ignorowane.
const UNIT_AMOUNT = 18000;
const CURRENCY = 'pln';
const SHIPPING_PACZKOMAT = 2000;
const MAX_QTY = 10;

const ORDERS_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(ORDERS_DIR, 'anatema-orders.jsonl');

const secretKey = process.env.STRIPE_SECRET_KEY || '';
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = secretKey ? new Stripe(secretKey) : null;
const stripeConfigured = Boolean(stripe);

if (!stripeConfigured) {
	console.warn('anatema: brak STRIPE_SECRET_KEY — /anatema/checkout będzie zwracać 503.');
}

function baseUrl() {
	return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

// Stawka VAT jako obiekt TaxRate w Stripe — inclusive (cena zawiera VAT), więc
// na fakturze/paragonie widać rozbicie, a klient płaci równe 180 zł. Tworzona raz
// i cache'owana; TaxRate'ów nie da się usunąć, więc najpierw szukamy istniejącej
// po markerze. Można wskazać gotową przez STRIPE_TAX_RATE_ID (musi być inclusive!).
let vatRatePromise = null;
function getVatRateId() {
	if (!stripe) return Promise.resolve(null);
	if (process.env.STRIPE_TAX_RATE_ID) return Promise.resolve(process.env.STRIPE_TAX_RATE_ID);
	if (!vatRatePromise) {
		vatRatePromise = (async () => {
			const existing = await stripe.taxRates.list({ active: true, limit: 100 });
			const found = existing.data.find(
				(r) => r.metadata && r.metadata.chrust_vat === 'pl23_incl' && Number(r.percentage) === 23 && r.inclusive === true,
			);
			if (found) return found.id;
			const created = await stripe.taxRates.create({
				display_name: 'VAT',
				description: 'VAT 23% (Polska), zawarty w cenie',
				percentage: 23,
				inclusive: true,
				country: 'PL',
				metadata: { chrust_vat: 'pl23_incl' },
			});
			return created.id;
		})().catch((err) => {
			vatRatePromise = null; // nie zapamiętuj porażki — pozwól spróbować przy kolejnym zamówieniu
			throw err;
		});
	}
	return vatRatePromise;
}

function ensureOrdersDir() {
	fs.mkdirSync(ORDERS_DIR, { recursive: true });
}

// --- Router: POST /anatema/checkout ---------------------------------------------

const router = express.Router();

router.post('/checkout', express.json({ limit: '4kb' }), async (req, res) => {
	if (!stripeConfigured) {
		return res.status(503).json({ error: 'Płatności są chwilowo niedostępne. Spróbuj ponownie później.' });
	}
	try {
		let qty = Math.floor(Number(req.body && req.body.qty));
		if (!Number.isFinite(qty) || qty < 1) qty = 1;
		if (qty > MAX_QTY) qty = MAX_QTY;

		let vatRateId = null;
		try {
			vatRateId = await getVatRateId();
		} catch (err) {
			console.error('anatema: nie udało się ustalić stawki VAT, pozycja bez rozbicia:', err.message);
		}

		const session = await stripe.checkout.sessions.create({
			mode: 'payment',
			line_items: [
				{
					quantity: qty,
					adjustable_quantity: { enabled: true, minimum: 1, maximum: MAX_QTY },
					...(vatRateId ? { tax_rates: [vatRateId] } : {}),
					price_data: {
						currency: CURRENCY,
						unit_amount: UNIT_AMOUNT,
						product_data: {
							name: 'CHRUST — ANATEMA! (winyl, przedsprzedaż)',
							description: 'Płyta winylowa LP. Przewidywana wysyłka: początek grudnia 2026.',
						},
					},
				},
			],
			shipping_address_collection: { allowed_countries: ['PL'] },
			phone_number_collection: { enabled: true },
			shipping_options: [
				{
					shipping_rate_data: {
						display_name: 'Paczkomat InPost',
						type: 'fixed_amount',
						fixed_amount: { amount: SHIPPING_PACZKOMAT, currency: CURRENCY },
						tax_behavior: 'inclusive',
					},
				},
				{
					shipping_rate_data: {
						display_name: 'Odbiór osobisty (Gdańsk / koncert)',
						type: 'fixed_amount',
						fixed_amount: { amount: 0, currency: CURRENCY },
						tax_behavior: 'inclusive',
					},
				},
			],
			custom_fields: [
				{
					key: 'paczkomat',
					type: 'text',
					optional: true,
					label: { type: 'custom', custom: 'Kod Paczkomatu InPost (np. GDA01M)' },
				},
			],
			custom_text: {
				shipping_address: {
					message: 'Wysyłka tylko na terenie Polski. Wybierając Paczkomat InPost, podaj jego kod w polu poniżej. Odbiór osobisty — po uzgodnieniu mailowym.',
				},
				submit: { message: 'Przedsprzedaż. Przewidywana wysyłka: początek grudnia 2026.' },
			},
			allow_promotion_codes: true,
			billing_address_collection: 'auto',
			tax_id_collection: { enabled: true },
			customer_creation: 'always',
			metadata: { produkt: 'anatema-vinyl', regulamin: REGULAMIN_VERSION },
			payment_intent_data: {
				metadata: { produkt: 'anatema-vinyl', regulamin: REGULAMIN_VERSION },
				description: 'CHRUST — ANATEMA! (winyl, przedsprzedaż)',
			},
			success_url: `${baseUrl()}/anatema/dziekujemy/?session_id={CHECKOUT_SESSION_ID}`,
			cancel_url: `${baseUrl()}/anatema/`,
		});

		return res.json({ url: session.url });
	} catch (err) {
		// Nie przepuszczamy błędu do domyślnego handlera Expressa — ten serwis go
		// nie ma i wyciekłby stack trace. Klient dostaje krótki komunikat.
		console.error('anatema: checkout.sessions.create nieudane —', err.message);
		return res.status(502).json({ error: 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.' });
	}
});

// --- Webhook: POST /anatema/webhook --------------------------------------------
// Montowany osobno w chrust-website-express-app.js z express.raw() PRZED
// jakimkolwiek parserem JSON — weryfikacja podpisu Stripe liczy HMAC z surowego
// body.

function alreadyRecorded(sessionId) {
	try {
		return fs.readFileSync(ORDERS_FILE, 'utf8').includes(`"sessionId":"${sessionId}"`);
	} catch {
		return false; // pliku jeszcze nie ma
	}
}

async function recordOrder(sessionId) {
	const session = await stripe.checkout.sessions.retrieve(sessionId, {
		expand: ['line_items', 'shipping_cost.shipping_rate', 'customer_details.tax_ids'],
	});
	if (session.payment_status !== 'paid') return;
	if (alreadyRecorded(session.id)) return;

	const cd = session.customer_details || {};
	const li = (session.line_items && session.line_items.data && session.line_items.data[0]) || null;
	const paczkomatField = (session.custom_fields || []).find((f) => f.key === 'paczkomat');
	const shipRate = session.shipping_cost && session.shipping_cost.shipping_rate;
	const addr = (session.shipping_details && session.shipping_details.address) || cd.address || null;
	const taxId = Array.isArray(cd.tax_ids) && cd.tax_ids[0] ? cd.tax_ids[0].value : null;

	const row = {
		ts: new Date().toISOString(),
		sessionId: session.id,
		paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
		qty: li ? li.quantity : null,
		amountTotal: session.amount_total,
		currency: session.currency,
		email: cd.email || null,
		name: (session.shipping_details && session.shipping_details.name) || cd.name || null,
		phone: cd.phone || null,
		delivery:
			session.shipping_cost && session.shipping_cost.amount_total === 0
				? 'odbiór osobisty'
				: (shipRate && shipRate.display_name) || 'Paczkomat InPost',
		paczkomat: (paczkomatField && paczkomatField.text && paczkomatField.text.value) || null,
		address: addr
			? [addr.line1, addr.line2, addr.postal_code, addr.city, addr.country].filter(Boolean).join(', ')
			: null,
		nip: taxId,
		regulamin: (session.metadata && session.metadata.regulamin) || null,
	};

	ensureOrdersDir();
	fs.appendFileSync(ORDERS_FILE, JSON.stringify(row) + '\n');
	console.log(`anatema: zapisano zamówienie ${session.id} (${row.qty}× , ${row.amountTotal / 100} ${row.currency})`);
}

function webhook(req, res) {
	if (!stripe || !webhookSecret) {
		return res.status(503).send('Webhook nie jest skonfigurowany.');
	}

	let event;
	try {
		event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
	} catch (err) {
		console.error('anatema webhook: nieprawidłowy podpis —', err.message);
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}

	if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
		// „fire and forget” — błąd zapisu nie może zablokować 200 dla Stripe,
		// inaczej dostawca ponawia webhooka w nieskończoność.
		recordOrder(event.data.object.id).catch((err) => console.error('anatema webhook: zapis nieudany —', err.message));
	}

	return res.json({ received: true });
}

module.exports = { router, webhook, SELLER, REGULAMIN_VERSION };
