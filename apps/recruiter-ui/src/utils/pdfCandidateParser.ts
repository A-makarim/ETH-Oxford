import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { CandidateCV, CandidateCertificate, CandidateEmployment } from "../data/candidates";

if (typeof window !== "undefined" && GlobalWorkerOptions.workerSrc !== pdfWorkerUrl) {
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

const DEFAULT_REQUIRED_SKILL_HASH = "77110099";
const DEFAULT_MIN_EXPERIENCE_MONTHS = 12;
const DEFAULT_SALARY_COMMITMENT = "123456789";
const DEFAULT_EDUCATION_EXPIRY_AT = 1893456000;
const DEFAULT_EMPLOYMENT_EXPERIENCE_MONTHS = 12;

type SectionName = "experience" | "courses" | null;
type ProviderName = CandidateCertificate["provider"];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function stripBullet(line: string): string {
  return line.replace(/^(?:(?:[-*\u2022])+|(?:\d+[.)]))\s*/u, "").trim();
}

function normalizeLine(line: string): string {
  return line
    .replace(/\u00a0/g, " ")
    .replace(/[\u2012\u2013\u2014\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function preprocessRawText(rawText: string): string {
  // Some PDFs flatten logical sections into a single line. Inject soft line breaks
  // before known headers so section extraction still works.
  return rawText
    .replace(/\r/g, "\n")
    .replace(/\s+(Name\s*:)/gi, "\n$1")
    .replace(/\s+(Role\s*:)/gi, "\n$1")
    .replace(/\s+(Position\s*:)/gi, "\n$1")
    .replace(/\s+(Wallet\s*:)/gi, "\n$1")
    .replace(/\s+(Experience\b)/gi, "\n$1")
    .replace(/\s+(Employment\b)/gi, "\n$1")
    .replace(/\s+(Courses\b)/gi, "\n$1")
    .replace(/\s+(Certificates\b)/gi, "\n$1")
    .replace(/\s+(Certifications\b)/gi, "\n$1");
}

function inferProvider(text: string): ProviderName | null {
  const source = text.toLowerCase();
  if (source.includes("edx.org") || source.includes(" edx")) return "edx";
  if (source.includes("coursera.org") || source.includes(" coursera")) return "coursera";
  if (source.includes("udemy.com") || source.includes(" udemy")) return "udemy";
  if (source.includes("datacamp.com") || source.includes(" datacamp")) return "datacamp";
  return null;
}

function isExperienceHeader(line: string): boolean {
  return /^(experience|employment|work experience|professional experience)\b/i.test(line);
}

function isCoursesHeader(line: string): boolean {
  return /^(courses|certificates|education|coursework|certifications)\b/i.test(line);
}

function isNoiseHeader(line: string): boolean {
  return /^(wallet|name|role|position|summary)\b/i.test(line);
}

function extractWallet(text: string): string | null {
  const match = text.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  const deduped = new Set<string>();
  for (const match of matches) {
    deduped.add(match.replace(/[),.;]+$/, ""));
  }
  return [...deduped];
}

function parseCoursesFromUrls(urls: string[]): CandidateCertificate[] {
  const certificates: CandidateCertificate[] = [];
  urls.forEach((url, index) => {
    const provider = inferProvider(url);
    if (!provider) return;
    certificates.push({
      id: `cert-${provider}-url-${index + 1}`,
      title: `${provider.toUpperCase()} Certificate`,
      provider,
      certificateUrlOrId: url
    });
  });
  return certificates;
}

function parseCandidateName(lines: string[], fallbackFileName: string): string {
  const labeled = lines.find((line) => /^name\s*:/i.test(line));
  if (labeled) {
    const name = labeled.replace(/^name\s*:/i, "").trim();
    if (name.length > 0) return name;
  }

  const candidate = lines.find((line) => line.length > 2 && !isNoiseHeader(line) && !line.includes("0x"));
  if (candidate) return candidate;
  return fallbackFileName;
}

function parseRole(lines: string[]): string {
  const labeled = lines.find((line) => /^(role|position)\s*:/i.test(line));
  if (labeled) {
    const role = labeled.replace(/^(role|position)\s*:/i, "").trim();
    if (role.length > 0) return role;
  }
  return "Candidate";
}

function parseExperience(lines: string[]): CandidateEmployment[] {
  const experiences: CandidateEmployment[] = [];

  lines.forEach((rawLine, index) => {
    const line = stripBullet(rawLine);
    if (!line) return;

    const walletMatch = line.match(/0x[a-fA-F0-9]{40}/);
    const employerWallet = walletMatch ? walletMatch[0] : "0x0000000000000000000000000000000000000000";
    const cleaned = line
      .replace(/0x[a-fA-F0-9]{40}/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return;

    let company = cleaned;
    let role = "Role";

    if (cleaned.includes(" - ")) {
      const [left, right] = cleaned.split(/\s+-\s+/, 2);
      company = left.trim() || "Company";
      role = right.trim() || "Role";
    } else if (/\s+at\s+/i.test(cleaned)) {
      const [left, right] = cleaned.split(/\s+at\s+/i, 2);
      role = left.trim() || "Role";
      company = right.trim() || "Company";
    }

    experiences.push({
      id: `emp-${index + 1}`,
      company,
      role,
      employerWallet,
      token: "USDT0"
    });
  });

  return experiences;
}

function parseCourses(lines: string[]): CandidateCertificate[] {
  const certificates: CandidateCertificate[] = [];
  let pendingTitle = "";

  lines.forEach((rawLine, index) => {
    const line = stripBullet(rawLine);
    if (!line) return;

    const urlMatch = line.match(/https?:\/\/\S+/i);
    if (!urlMatch) {
      pendingTitle = pendingTitle ? `${pendingTitle} ${line}` : line;
      return;
    }

    const certificateUrlOrId = urlMatch[0].replace(/[),.;]+$/, "");
    const provider = inferProvider(`${line} ${certificateUrlOrId}`);
    if (!provider) {
      pendingTitle = "";
      return;
    }

    const titleFromLine = line.replace(urlMatch[0], "").replace(/\s*[-|:]\s*$/, "").trim();
    const title = titleFromLine || pendingTitle || `${provider.toUpperCase()} Certificate ${index + 1}`;
    pendingTitle = "";

    certificates.push({
      id: `cert-${provider}-${index + 1}`,
      title,
      provider,
      certificateUrlOrId
    });
  });

  return certificates;
}

async function readPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const task = getDocument({ data: buffer });

  const pdf = await task.promise;
  let output = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;
    for (const item of items) {
      const text = String(item.str || "").trim();
      if (!text) continue;
      output += text;
      output += item.hasEOL ? "\n" : " ";
    }
    output += "\n";
  }

  if (output.trim().length === 0) {
    throw new Error(`No extractable text found in ${file.name}. Use a text-based PDF (not image/scanned).`);
  }

  return output;
}

export async function parseCandidatePdf(file: File, index: number): Promise<CandidateCV> {
  const rawText = await readPdfText(file);
  const preprocessedText = preprocessRawText(rawText);
  const lines = preprocessedText
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);

  const wallet = extractWallet(preprocessedText);
  if (!wallet) {
    throw new Error(`Missing wallet address in ${file.name}`);
  }

  const experienceLines: string[] = [];
  const courseLines: string[] = [];
  let section: SectionName = null;

  for (const line of lines) {
    if (isExperienceHeader(line)) {
      section = "experience";
      const remainder = normalizeLine(line.replace(/^(experience|employment|work experience|professional experience)\b[:\s-]*/i, ""));
      if (remainder) experienceLines.push(remainder);
      continue;
    }
    if (isCoursesHeader(line)) {
      section = "courses";
      const remainder = normalizeLine(line.replace(/^(courses|certificates|education|coursework|certifications)\b[:\s-]*/i, ""));
      if (remainder) courseLines.push(remainder);
      continue;
    }
    if (section === "experience") {
      experienceLines.push(line);
      continue;
    }
    if (section === "courses") {
      courseLines.push(line);
    }
  }

  let employments = parseExperience(experienceLines);
  if (employments.length === 0) {
    const fallbackExperienceLines = lines.filter((line) => {
      const normalized = line.toLowerCase();
      if (/^(name|role|position|wallet|summary)\s*:/.test(normalized)) return false;
      if (/^(courses|certificates|education|coursework|certifications)\b/.test(normalized)) return false;
      if (normalized.includes("http://") || normalized.includes("https://")) return false;
      return /\s-\s|\sat\s/i.test(line);
    });
    employments = parseExperience(fallbackExperienceLines);
  }
  if (employments.length === 0) {
    const regexLines = Array.from(preprocessedText.matchAll(/[^\n]*\s-\s[^\n]*0x[a-fA-F0-9]{40}[^\n]*/g)).map((m) =>
      normalizeLine(m[0] || "")
    );
    employments = parseExperience(regexLines);
  }

  let certificates = parseCourses(courseLines);
  if (certificates.length === 0) {
    certificates = parseCourses(lines);
  }
  if (certificates.length === 0) {
    certificates = parseCoursesFromUrls(extractUrls(preprocessedText));
  }

  if (certificates.length === 0) {
    throw new Error(`No supported certificate URLs found in ${file.name}`);
  }
  if (employments.length === 0) {
    throw new Error(`No experience entries found in ${file.name}`);
  }

  const fallbackName = file.name.replace(/\.pdf$/i, "").trim() || `Candidate ${index + 1}`;
  const name = parseCandidateName(lines, fallbackName);
  const roleApplied = parseRole(lines);

  const idBase = slugify(`${name}-${wallet.slice(2, 10)}-${index + 1}`) || `candidate-${index + 1}`;
  return {
    id: idBase,
    name,
    roleApplied,
    wallet,
    summary: `Parsed from ${file.name}`,
    requiredSkillHash: DEFAULT_REQUIRED_SKILL_HASH,
    minExperienceMonths: DEFAULT_MIN_EXPERIENCE_MONTHS,
    salaryCommitment: DEFAULT_SALARY_COMMITMENT,
    educationExpiryAt: DEFAULT_EDUCATION_EXPIRY_AT,
    employmentExperienceMonths: DEFAULT_EMPLOYMENT_EXPERIENCE_MONTHS,
    educationSkillHash: DEFAULT_REQUIRED_SKILL_HASH,
    certificates,
    employments
  };
}
