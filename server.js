const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Serves public/index.html for "/" automatically.
app.use(express.static(__dirname + '/public'));

app.listen(PORT, () => {
	console.log(`chrust-website listening on http://localhost:${PORT}`);
});
