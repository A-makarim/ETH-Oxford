import { getAddress, keccak256, toUtf8Bytes } from "ethers";
import type { EducationSubmitRequest, NormalizedCertificate, ProviderName } from "./types.js";

type ParsedSource = {
  source: string;
  sourceUrl: string;
  certificateId: string;
};

const SOURCE_FETCH_TIMEOUT_MS = Number(process.env.FDC_SOURCE_FETCH_TIMEOUT_MS || 12_000);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function normalizeUrl(url: URL): string {
  url.hash = "";
  return url.toString();
}

function parseCertificateSource(provider: ProviderName, source: string): ParsedSource {
  const maybeUrl = parseUrl(source);

  if (provider === "udemy") {
    if (maybeUrl) {
      const segments = maybeUrl.pathname.split("/").filter(Boolean);
      const idx = segments.findIndex((segment) => segment.toLowerCase() === "certificate");
      const id = idx >= 0 ? segments[idx + 1] : segments[segments.length - 1];
      if (!id) {
        throw new Error("Could not infer Udemy certificate id from URL");
      }
      return {
        source,
        sourceUrl: normalizeUrl(maybeUrl),
        certificateId: id
      };
    }

    const certificateId = source.trim();
    return {
      source,
      sourceUrl: `https://www.udemy.com/certificate/${encodeURIComponent(certificateId)}/`,
      certificateId
    };
  }

  if (provider === "coursera") {
    if (maybeUrl) {
      const segments = maybeUrl.pathname.split("/").filter(Boolean);
      const id = segments[segments.length - 1];
      if (!id) {
        throw new Error("Could not infer Coursera certificate id from URL");
      }
      return {
        source,
        sourceUrl: normalizeUrl(maybeUrl),
        certificateId: id
      };
    }

    const certificateId = source.trim();
    return {
      source,
      sourceUrl: `https://www.coursera.org/account/accomplishments/verify/${encodeURIComponent(certificateId)}`,
      certificateId
    };
  }

  throw new Error(`Unsupported provider ${provider}`);
}

function buildFdcFetchUrl(sourceUrl: string): string {
  return `https://api.allorigins.win/get?url=${encodeURIComponent(sourceUrl)}`;
}

async function fetchSourceExcerpt(url: string): Promise<{ sourceUrl: string; excerpt: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`source_fetch_failed_${response.status}`);
    }

    const payload = (await response.json()) as {
      status?: { url?: string };
      contents?: string;
    };

    const sourceUrl = payload.status?.url;
    if (!sourceUrl || typeof sourceUrl !== "string") {
      throw new Error("source_fetch_invalid_status_url");
    }

    if (typeof payload.contents !== "string" || payload.contents.length === 0) {
      throw new Error("source_fetch_empty_contents");
    }

    const excerpt = payload.contents.slice(0, 2048);
    return {
      sourceUrl,
      excerpt
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("source_fetch_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function normalizeCertificateInput(payload: EducationSubmitRequest): Promise<NormalizedCertificate> {
  const wallet = getAddress(payload.wallet);
  const provider = payload.provider.toLowerCase() as ProviderName;
  const source = payload.certificateUrlOrId.trim();

  if (!source) {
    throw new Error("certificateUrlOrId must not be empty");
  }

  const parsed = parseCertificateSource(provider, source);
  const fdcFetchUrl = buildFdcFetchUrl(parsed.sourceUrl);
  const snapshot = await fetchSourceExcerpt(fdcFetchUrl);

  const canonicalCertificate = {
    certificateId: parsed.certificateId,
    provider,
    snapshotExcerpt: snapshot.excerpt,
    snapshotUrl: snapshot.sourceUrl,
    sourceUrl: parsed.sourceUrl
  };

  const canonicalCertificateJson = stableStringify(canonicalCertificate);

  return {
    wallet,
    provider,
    source: parsed.source,
    sourceUrl: parsed.sourceUrl,
    certificateId: parsed.certificateId,
    certHash: keccak256(toUtf8Bytes(canonicalCertificateJson)),
    canonicalCertificateJson,
    web2JsonRequestBody: {
      url: fdcFetchUrl,
      httpMethod: "GET",
      headers: "{}",
      queryParams: "{}",
      body: "",
      postProcessJq: "{url: .status.url, snippet: (.contents | .[0:2048])}",
      abiSignature:
        '{"type":"tuple","name":"certificate","components":[{"name":"url","type":"string"},{"name":"snippet","type":"string"}]}'
    }
  };
}
