import { authToken } from "./auth.js";

let queue = [];
let scheduled = false;

async function processQueue() {
  let batch = queue;
  queue = [];
  scheduled = false;
  /*
  if (batch.length !== 1) {
    console.log("Batching:", batch.length, batch);

    const results = await (
      await fetch("/api/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(
          batch.map((b) => {
            return [b.url, b.options || {}];
          })
        ),
      })
    ).json();

    return;
  }
*/
  batch = batch.map((item) => {
    return {
      ...item,
      options: {
        ...item.options,
        headers: {
          ...(item.options.headers || {}),
          Authorization: `Bearer ${authToken}`,
        },
      },
    };
  });

  for (const { url, options, resolve, reject } of batch) {
    console.log(
      `${options.method || "GET"}`,
      url,
      JSON.stringify(options).length === 2 ? "" : options
    );

    fetch(`/api${url}`, options)
      .then((r) => r.json())
      .then(resolve)
      .catch(reject);
  }
}

export default (url, options = {}) =>
  new Promise((resolve, reject) => {
    queue.push({ url, options, resolve, reject });

    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(processQueue);
    }
  });
