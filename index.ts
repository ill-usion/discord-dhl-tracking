import * as cron from "node-cron";
import * as lookup from "country-code-lookup";
import { flag } from "country-emoji";

const TRACKING_URL = process.env.TRACKING_URL;
const TRACKING_NUMBER = process.env.TRACKING_NUMBER;
const API_KEY = process.env.DHL_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function getTrackingInfo() {
	if (!TRACKING_URL || !TRACKING_NUMBER || !API_KEY) {
		console.error(
			"`TRACKING_URL`, `TRACKING_NUMBER` and `DHL_API_KEY` are required."
		);
		return;
	}

	const reqUrl = new URL(TRACKING_URL);
	reqUrl.searchParams.append("trackingNumber", TRACKING_NUMBER);

	const resp = await fetch(reqUrl, {
		method: "GET",
		headers: {
			"DHL-API-Key": API_KEY,
		},
	});

	console.log("Tracking status:", resp.status);

	return resp.ok ? await resp.json() : null;
}

async function sendWebhook(body: any) {
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

function timeAgo(from: Date, to: Date): string {
	const seconds: number = Math.floor((to.getTime() - from.getTime()) / 1000);

	const intervals: { [key: string]: number } = {
		year: 31536000,
		month: 2592000,
		week: 604800,
		day: 86400,
		hour: 3600,
		minute: 60,
		second: 1,
	};

	let counter: number;

	for (const key in intervals) {
		counter = Math.floor(seconds / intervals[key]);

		if (counter > 0) {
			if (counter === 1) {
				return `${counter} ${key} ago`;
			} else {
				return `${counter} ${key}s ago`;
			}
		}
	}

	return "Just now";
}

function evaluateLocation(statusCode: string, loc: string | undefined): string {
	switch (statusCode) {
		case "transit":
			return "In transit.";

		case "delivered":
			return loc || "At destination";

		default:
			return loc as string;
	}
}

function makeEmbed(info: any) {
	const currentUpdateDate = new Date(info.status.timestamp);
	const lastUpdateDate =
		(info.lastStatus && new Date(info.lastStatus.timestamp)) || new Date();

	const messagePayload = {
		content: "",
		tts: false,
		embeds: [
			{
				title: "Tracking Status Update",
				description: `**Tracking**: \`${info.number}\`\n**From**: ${info.origin.continent}, ${info.origin.country} ${info.origin.flag}\n**To**: ${info.destination.continent}, ${info.destination.country} ${info.destination.flag}\n`,
				color: 5898459,
				fields: [
					{
						name: "Status",
						value: info.status.status,
						inline: true,
					},
					{
						name: "Location",
						value: evaluateLocation(
							info.status.statusCode,
							info?.location?.address?.addressLocality
						),
						inline: false,
					},
				],
				footer: {
					text: `Last update ${
						lastUpdateDate
							? lastUpdateDate.toLocaleString("EN-UK")
							: "None"
					} ${timeAgo(lastUpdateDate, currentUpdateDate)}`,
				},
			},
		],
	};

	console.log("Made embed:", JSON.stringify(messagePayload));
	return messagePayload;
}

async function processTrackingInfo(info: any) {
	// console.log(info);
	const file = Bun.file("./tracking.json");

	if (!(await file.exists())) {
		console.log("Tracking file doesn't exist. Creating new...");
		var tracking: any = {};
		tracking.number = info.id;

		const origin = lookup.byIso(info.origin.address.countryCode);
		const destination = lookup.byIso(info.destination.address.countryCode);
		tracking.origin = {
			continent: origin?.continent,
			country: origin?.country,
			flag: flag(origin?.iso2!),
		};
		tracking.destination = {
			continent: destination?.continent,
			country: destination?.country,
			flag: flag(destination?.iso2!),
		};

		tracking.status = info.status;
		tracking.lastStatus = null;

		Bun.write(file, JSON.stringify(tracking));
		return makeEmbed(tracking);
	}

	var tracking = await file.json();
	// status changed
	if (info.status.timestamp !== tracking.status.timestamp) {
		tracking.lastStatus = tracking.status;
		tracking.status = info.status;

		Bun.write(file, JSON.stringify(tracking));
		return makeEmbed(tracking);
	}

	// status hasn't changed
	return null;
}

async function runJob() {
	console.log("Running task...");

	const info = await getTrackingInfo();
	for (const shipment of info.shipments) {
		if (shipment.id !== TRACKING_NUMBER) {
			continue;
		}

		const payload = await processTrackingInfo(shipment);
		if (payload !== null) {
			var resp = await sendWebhook(payload);

			const status = resp.status;
			console.log("Webhook status:", status);

			if (status >= 300) {
				console.log(await resp.text());
			}
		}
	}
}

Bun.serve({
	fetch(req) {
		console.log("Keep Alive Signal");
		return new Response("OK");
	},
});

// runJob();

cron.schedule("*/6 * * * *", runJob);
