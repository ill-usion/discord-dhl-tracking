import * as cron from "node-cron";

async function getTrackingInfo() {
	const TRACKING_URL = process.env.TRACKING_URL;
	const TRACKING_NUMBER = process.env.TRACKING_NUMBER;
	const API_KEY = process.env.DHL_API_KEY;

	if (!TRACKING_URL || !TRACKING_NUMBER || !API_KEY) {
		throw new Error(
			"`TRACKING_URL`, `TRACKING_NUMBER` and `DHL_API_KEY` are required."
		);
	}

	const reqUrl = new URL(TRACKING_URL);
	reqUrl.searchParams.append("trackingNumber", TRACKING_NUMBER);

	const resp = await fetch(reqUrl, {
		method: "GET",
		headers: {
			"DHL-API-Key": API_KEY,
		},
	});

	if (resp.ok) {
		return await resp.json();
	}

	return null;
}

async function sendWebhook(body: any) {
	const WEBHOOK_URL = process.env.WEBHOOK_URL;
	if (!WEBHOOK_URL) {
		throw new Error("Missing `WEBHOOK_URL`");
	}

	return await fetch(WEBHOOK_URL, {
		method: "POST",
		body: JSON.stringify(body),
		headers: {
			"Content-Type": "application/json",
		},
	});
}

async function runJob() {
	console.log("running task every 6 minutes");

	const info = await getTrackingInfo();
	var resp = await sendWebhook({
		content: info !== null ? await info.text() : "Got no info",
	});
    
	const status = resp.status;
	console.log(status);

	if (status >= 300) {
		console.log(await resp.text());
	}
}

Bun.serve({
	fetch(req) {
		console.log("Keep Alive Signal");
		return new Response("OK");
	},
});

cron.schedule("*/6 * * * *", runJob);
