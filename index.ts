import * as cron from "node-cron";

const webhook = process.env.WEBHOOK_URL || "";

Bun.serve({
	fetch(req) {
		return new Response("OK");
	},
});

cron.schedule("*/6 * * * *", async () => {
	console.log("running a task every 6 minutes");
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
});
