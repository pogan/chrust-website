require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');

const anatema = require('./anatema');
const anatemaOrders = require('./anatema-orders');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const IS_PROD = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
	helmet({
		contentSecurityPolicy: {
			useDefaults: false,
			directives: {
				defaultSrc: ["'self'"],
				baseUri: ["'self'"],
				objectSrc: ["'none'"],
				frameAncestors: ["'none'"],
				formAction: ["'self'"],
				// bootstrap.bundle.min.js is loaded from jsDelivr (with SRI); the
				// concerts section loads the Bandsintown widget. rest.bandsintown.com
				// belongs here rather than in connect-src because the widget fetches
				// the event list over JSONP, i.e. by injecting a <script> element.
				// accounts.google.com is the Google Identity Services (GIS) library
				// that renders the "Sign in with Google" button on /anatema/orders —
				// it injects its own iframe and does its own fetches, hence the same
				// host reappearing in frame-src and connect-src below.
				scriptSrc: [
					"'self'",
					'https://cdn.jsdelivr.net',
					'https://widgetv3.bandsintown.com',
					'https://rest.bandsintown.com',
					'https://accounts.google.com',
				],
				// 'unsafe-inline' is required for *style attributes*: Bootstrap's
				// collapse/carousel JS writes element.style during transitions, and
				// the Bandsintown widget styles itself inline. It does not weaken
				// script execution.
				styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com'],
				fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
				// Bandsintown serves event artwork from a rotating set of CDN hosts.
				imgSrc: ["'self'", 'data:', 'https:'],
				mediaSrc: ["'self'"],
				// jsDelivr is here only so DevTools can fetch the source map that
				// bootstrap.bundle.min.js points at with its trailing
				// //# sourceMappingURL comment. Nothing on the page connects to
				// jsDelivr; without this the fetch is blocked and every developer
				// with source maps enabled gets a CSP violation in the console.
				// It grants no meaningful new trust — jsDelivr is already in
				// script-src, i.e. already allowed to execute arbitrary JS here.
				connectSrc: ["'self'", 'https://*.bandsintown.com', 'https://cdn.jsdelivr.net', 'https://accounts.google.com'],
				frameSrc: ['https://*.bandsintown.com', 'https://accounts.google.com'],
				// Upgrading would rewrite http://localhost subresources to https in
				// development, so only ask for it where TLS actually exists.
				...(IS_PROD ? { upgradeInsecureRequests: [] } : {}),
			},
		},
		// The Bandsintown widget is a plain cross-origin script, not an isolated
		// context; COEP would block it and buys us nothing here.
		crossOriginEmbedderPolicy: false,
		// Helmet's default COOP ('same-origin') cuts the window.opener link between
		// this page and the popup Google's "Sign in with Google" button opens. The
		// popup finishes on accounts.google.com/gsi/transform and tries to
		// postMessage the credential back to its opener — with plain 'same-origin'
		// that channel doesn't exist, so the popup just sits there forever instead
		// of closing. 'same-origin-allow-popups' keeps the isolation for same-origin
		// windows but lets a same-origin page keep its reference to popups it opens.
		crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
	})
);

// The /anatema Stripe webhook must see the raw request body (signature
// verification is an HMAC over the exact bytes), so it is mounted here — before
// compression and before any JSON body parser.
app.post('/anatema/webhook', express.raw({ type: 'application/json' }), anatema.webhook);

app.use(compression());

// public/ doubles as the designers' asset folder, so it holds source files that
// must never be downloadable — chrust_backgrounds.psd alone is 933 MB, which is
// both a source leak and a trivial way to saturate the server's bandwidth.
const BLOCKED_EXTENSIONS = new Set(['.psd', '.ai', '.xcf', '.aep', '.prproj', '.map', '.zip', '.rar']);

app.use((req, res, next) => {
	let pathname;
	try {
		pathname = decodeURIComponent(req.path);
	} catch {
		return res.status(400).end();
	}
	if (BLOCKED_EXTENSIONS.has(path.extname(pathname).toLowerCase())) {
		return res.status(404).end();
	}
	next();
});

// main.css and js/main.js carry no content hash in their filenames, so they are
// revalidated (cheap 304s) rather than pinned for a year — otherwise a deploy
// would not reach anyone holding a cached copy. Media is immutable.
const IMMUTABLE = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.avif', '.mp4', '.webm', '.woff', '.woff2', '.ico']);

app.use(
	express.static(PUBLIC_DIR, {
		dotfiles: 'ignore',
		index: 'index.html',
		etag: true,
		lastModified: true,
		setHeaders(res, filePath) {
			const ext = path.extname(filePath).toLowerCase();
			if (IMMUTABLE.has(ext)) {
				res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
			} else {
				res.setHeader('Cache-Control', 'no-cache');
			}
		},
	})
);

// /anatema preorder checkout. The pages themselves are static (public/anatema/**)
// and are served by express.static above; this only adds POST /anatema/checkout.
app.use('/anatema', anatema.router);

// /anatema/orders — Google-login-gated order list. Mounted after the static
// handler and the checkout router, same as those: there is no matching static
// file or /anatema/checkout route for this path, so requests fall through here.
app.use('/anatema/orders', anatemaOrders.router);

app.listen(PORT, () => {
	console.log(`chrust-website listening on http://localhost:${PORT}`);
});
