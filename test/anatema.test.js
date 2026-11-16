const test = require('node:test');
const assert = require('node:assert/strict');
const { orderRow } = require('../anatema');

// Sesja Checkout w kształcie API 2025-03-31+ (dahlia): dane wysyłki są
// w collected_information, a customer_details.name bywa puste (np. BLIK).
function session(overrides = {}) {
	return {
		id: 'cs_test_1',
		payment_intent: 'pi_test_1',
		amount_total: 20000,
		currency: 'pln',
		customer_details: { email: 'jan@example.com', name: null, phone: '+48600000000', address: { country: 'PL' } },
		collected_information: {
			shipping_details: {
				name: 'Jan Kowalski',
				address: { line1: 'Długa 1', line2: null, postal_code: '80-001', city: 'Gdańsk', country: 'PL' },
			},
		},
		shipping_cost: { amount_total: 2000, shipping_rate: { display_name: 'Paczkomat InPost' } },
		line_items: { data: [{ quantity: 1 }] },
		custom_fields: [{ key: 'paczkomat', text: { value: 'GDA01M' } }],
		metadata: { regulamin: '2026-08-31' },
		...overrides,
	};
}

test('anatema: imię, nazwisko i adres z danych wysyłki (collected_information)', () => {
	const row = orderRow(session());
	assert.equal(row.name, 'Jan Kowalski');
	assert.equal(row.address, 'Długa 1, 80-001, Gdańsk, PL');
	assert.equal(row.paczkomat, 'GDA01M');
	assert.equal(row.delivery, 'Paczkomat InPost');
});

test('anatema: bez danych wysyłki nazwa z płatności (customer_details)', () => {
	const row = orderRow(session({
		collected_information: null,
		customer_details: { email: 'a@example.com', name: 'Anna Nowak', address: { country: 'PL' } },
	}));
	assert.equal(row.name, 'Anna Nowak');
	assert.equal(row.address, 'PL');
});
