import { getAddress, keccak256, toUtf8Bytes } from "ethers";
import type { EducationSubmitRequest, NormalizedCertificate, ProviderName } from "./types.js";

type ParsedSource = {
  source: string;
  sourceUrl: string;
  certificateId: string;
};

type VerificationRecipe = {
  id: string;
  fetchUrl: string;
  headers: string;
  postProcessJq: string;
  abiSignature: string;
};

const JINA_BASE_URL = (process.env.FDC_JINA_BASE_URL || "https://r.jina.ai/").trim();

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
  url.search = "";
  return url.toString();
}

function assertProviderHost(provider: ProviderName, url: URL): void {
  const host = url.hostname.toLowerCase();
  const allowedHosts: Record<ProviderName, string[]> = {
    udemy: ["udemy.com", "www.udemy.com"],
    coursera: ["coursera.org", "www.coursera.org"],
    datacamp: ["datacamp.com", "www.datacamp.com"],
    edx: ["courses.edx.org", "credentials.edx.org"]
  };

  if (!allowedHosts[provider].includes(host)) {
    throw new Error(`invalid_${provider}_host_${host}`);
  }
}

function parseCertificateSource(provider: ProviderName, source: string): ParsedSource {
  const maybeUrl = parseUrl(source);

  if (provider === "udemy") {
    if (maybeUrl) {
      assertProviderHost(provider, maybeUrl);
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
      assertProviderHost(provider, maybeUrl);
      const segments = maybeUrl.pathname.split("/").filter(Boolean);
      const idx = segments.findIndex((segment) => segment.toLowerCase() === "verify");
      const id = idx >= 0 ? segments[idx + 1] : segments[segments.length - 1];
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

  if (provider === "datacamp") {
    if (maybeUrl) {
      assertProviderHost(provider, maybeUrl);
      const segments = maybeUrl.pathname.split("/").filter(Boolean);
      const idx = segments.findIndex((segment) => segment.toLowerCase() === "certificate");
      const id = idx >= 0 ? segments[idx + 1] : segments[segments.length - 1];
      if (!id) {
        throw new Error("Could not infer DataCamp certificate id from URL");
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
      sourceUrl: `https://www.datacamp.com/certificate/${encodeURIComponent(certificateId)}`,
      certificateId
    };
  }

  if (provider === "edx") {
    if (maybeUrl) {
      assertProviderHost(provider, maybeUrl);
      const segments = maybeUrl.pathname.split("/").filter(Boolean);
      const markerIndex = segments.findIndex((segment) =>
        ["certificates", "credentials"].includes(segment.toLowerCase())
      );
      const id = markerIndex >= 0 ? segments[markerIndex + 1] : segments[segments.length - 1];
      if (!id) {
        throw new Error("Could not infer edX certificate id from URL");
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
      sourceUrl: `https://courses.edx.org/certificates/${encodeURIComponent(certificateId)}`,
      certificateId
    };
  }

  throw new Error(`Unsupported provider ${provider}`);
}

function buildJinaReaderUrl(sourceUrl: string): string {
  const normalizedBase = JINA_BASE_URL.endsWith("/") ? JINA_BASE_URL : `${JINA_BASE_URL}/`;
  return `${normalizedBase}${sourceUrl}`;
}

function buildVerificationRecipe(provider: ProviderName, parsed: ParsedSource): VerificationRecipe {
  const providerLiteral = JSON.stringify(provider);
  const certificateIdLiteral = JSON.stringify(parsed.certificateId);
  const certificateIdLowerLiteral = JSON.stringify(parsed.certificateId.toLowerCase());

  // If the certificate page resolves to one of these generic titles, force ABI type mismatch.
  // This makes prepareRequest return INVALID and blocks on-chain submission.
  const providerInvalidTitles: Record<ProviderName, string[]> = {
    coursera: [],
    datacamp: ["Learn R, Python & Data Science Online"],
    edx: ["Page Not Found | edX"],
    udemy: ["Just a moment...", "Online Courses - Learn Anything, On Your Schedule | Udemy"]
  };

  const invalidTitleCondition =
    providerInvalidTitles[provider].length > 0
      ? providerInvalidTitles[provider]
          .map((title) => `((.data.title // "") == ${JSON.stringify(title)})`)
          .join(" or ")
      : "false";

  const providerEvidenceChecks: Record<ProviderName, string> = {
    // Coursera certificate pages are often bot-protected with generic title; use PDF link marker as evidence.
    coursera: `((.data.content // "") | test("certificate\\\\.v1/pdf/${parsed.certificateId}"))`,
    // DataCamp/edX should expose the certificate id in rendered content.
    datacamp: `(((.data.content // "") | test(${certificateIdLiteral})) or ((.data.content // "") | test(${certificateIdLowerLiteral})))`,
    edx: `(((.data.content // "") | test(${certificateIdLiteral})) or ((.data.content // "") | test(${certificateIdLowerLiteral})))`,
    // Udemy may surface id in URL or page content depending on response path.
    udemy: `(((.data.url // "") | test(${certificateIdLiteral})) or ((.data.content // "") | test(${certificateIdLiteral})) or ((.data.content // "") | test(${certificateIdLowerLiteral})))`
  };

  return {
    id: `${provider}_jina_reader_v1`,
    fetchUrl: buildJinaReaderUrl(parsed.sourceUrl),
    headers: '{"Accept":"application/json"}',
    postProcessJq: `if ((.code == 200) and (.status == 20000) and ((.data.title // "") != "") and (((.data.content // "") | test("Warning: Target URL returned error 404")) | not) and ((${invalidTitleCondition}) | not) and (${providerEvidenceChecks[provider]})) then {url:(.data.url // ""), title:(.data.title // ""), provider:${providerLiteral}, certificateId:${certificateIdLiteral}, proofType:"jina_reader_v1"} else "invalid_certificate" end`,
    abiSignature:
      '{"type":"tuple","name":"certificate","components":[{"name":"url","type":"string"},{"name":"title","type":"string"},{"name":"provider","type":"string"},{"name":"certificateId","type":"string"},{"name":"proofType","type":"string"}]}'
  };
}

export async function normalizeCertificateInput(payload: EducationSubmitRequest): Promise<NormalizedCertificate> {
  const wallet = getAddress(payload.wallet);
  const provider = payload.provider.toLowerCase() as ProviderName;
  const source = payload.certificateUrlOrId.trim();

  if (!source) {
    throw new Error("certificateUrlOrId must not be empty");
  }

  const parsed = parseCertificateSource(provider, source);
  const recipe = buildVerificationRecipe(provider, parsed);

  const canonicalCertificate = {
    certificateId: parsed.certificateId,
    provider,
    sourceUrl: parsed.sourceUrl,
    verifierSourceUrl: recipe.fetchUrl,
    verifierRuleId: recipe.id
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
      url: recipe.fetchUrl,
      httpMethod: "GET",
      headers: recipe.headers,
      queryParams: "",
      body: "",
      postProcessJq: recipe.postProcessJq,
      abiSignature: recipe.abiSignature
    }
  };
}
