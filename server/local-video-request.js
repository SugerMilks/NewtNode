import { request as httpRequest } from "node:http";

// Node fetch has its own response-header deadline. This local video relay must
// wait for the provider result, without a deadline or a second paid submission.
export function relayLocalVideo(port, route, body, request = httpRequest) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request({
      hostname: "127.0.0.1", port, path: route, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("error", reject);
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, data: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        } catch {
          reject(new Error("The local video runner returned an unreadable result. Check History and the provider before retrying; the request was not resubmitted."));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(0);
    req.end(payload);
  });
}
