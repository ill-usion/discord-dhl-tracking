const webhook = process.env.WEBHOOK_URL || "";

const resp = await fetch(webhook, {
	method: "POST",
	body: JSON.stringify({ content: "cron job" }),
	headers: {
		"Content-Type": "application/json",
	},
});

const status = resp.status;
console.log(status);

if (status >= 300) {
	console.log(await resp.text());
}
