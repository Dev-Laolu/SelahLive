// SERVER ONLY. Lightweight S3-compatible object storage client (AWS Signature V4 using node:crypto + fetch).
import crypto from "node:crypto";

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest(encoding);
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function hasS3Config() {
  return !!(
    process.env.AWS_ENDPOINT_URL_S3 &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET
  );
}

export async function uploadPackToS3(key, bodyBuffer, contentType = "application/gzip") {
  if (!hasS3Config()) return null;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3.replace(/\/+$/, "");
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION || "us-east-2";
  const accessKey = process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY;

  const url = new URL(`${endpoint}/${bucket}/${key.replace(/^\/+/, "")}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(bodyBuffer);

  const canonicalUri = url.pathname;
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${url.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(Buffer.from(canonicalRequest, "utf8"))].join("\n");

  const kDate = hmac("AWS4" + secretKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign, "hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const res = await fetch(url.toString(), {
      method: "PUT",
      headers: {
        "content-type": contentType,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: authorization,
      },
      body: bodyBuffer,
    });
    if (!res.ok) return null;
    return url.toString();
  } catch {
    return null;
  }
}

