const res = await fetch(
	"https://www.perplexity.ai/rest/autosuggest/list-autosuggest?version=2.18&source=default",
	{
		method: "POST",
		headers: {
			"accept-language": "en-US,en;q=0.9",
			"content-type": "application/json",
			"user-agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
			"x-app-apiclient": "default",
			"x-app-apiversion": "2.18",
			"x-perplexity-request-endpoint":
				"https://www.perplexity.ai/rest/autosuggest/list-autosuggest?version=2.18&source=default",
			"x-perplexity-request-reason": "ask-input-inner-home",
			"x-perplexity-request-try-number": "1",
		},
		body: JSON.stringify({
			query: "",
			sources: ["web"],
			search_mode: "search",
			source_tab_url: "",
		}),
	},
);

console.log((await res.json()).results.map((r) => r.query));
