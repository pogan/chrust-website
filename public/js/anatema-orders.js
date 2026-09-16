// /anatema/orders — Google Identity Services calls this by name (see the
// data-callback attribute in anatema-orders.js's renderLoginPage) once the
// visitor picks a Google account. It POSTs the ID token to the server for
// verification; the server never trusts anything else about the login.
function handleCredentialResponse(response) {
	var errorEl = document.getElementById('login-error');

	fetch('/anatema/orders/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ credential: response.credential }),
	})
		.then(function (r) {
			return r.json().then(function (data) {
				return { ok: r.ok && data.ok, error: data.error };
			});
		})
		.then(function (result) {
			if (result.ok) {
				window.location.reload();
			} else if (errorEl) {
				errorEl.textContent = result.error || 'Nie udało się zalogować.';
			}
		})
		.catch(function () {
			if (errorEl) errorEl.textContent = 'Błąd sieci. Spróbuj ponownie.';
		});
}
window.handleCredentialResponse = handleCredentialResponse;

document.addEventListener('DOMContentLoaded', function () {
	var logoutBtn = document.getElementById('orders-logout');
	if (!logoutBtn) return;
	logoutBtn.addEventListener('click', function () {
		fetch('/anatema/orders/logout', { method: 'POST' }).then(function () {
			window.location.reload();
		});
	});
});
